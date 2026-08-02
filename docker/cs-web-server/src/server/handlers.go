package main

/*
#include <stdlib.h>

extern void Cbuf_AddText(const char* text);
*/
import "C"

import (
	"crypto/sha512"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"time"
	"unsafe"

	"github.com/gorilla/websocket"
)

// passwordSalt is generated at startup, not configured.
var passwordSalt string

// WebSocket logs event version constants
const (
	LogsEventVersion = "v1"
	LogsEventHistory = LogsEventVersion + ":history"
	LogsEventLog     = LogsEventVersion + ":log"
)

// checkCredentials validates both username and password hash using constant-time comparison
func checkCredentials(username, passwordHash string) bool {
	// Validate username
	usernameMatch := subtle.ConstantTimeCompare([]byte(username), []byte(appConfig.Admin.Username)) == 1

	// Compute expected hash: SHA-512(password + salt)
	expectedHash := computePasswordHash(appConfig.Admin.Password, passwordSalt)

	// Compare hashes using constant-time comparison
	hashMatch := subtle.ConstantTimeCompare([]byte(passwordHash), []byte(expectedHash)) == 1

	return usernameMatch && hashMatch
}

// computePasswordHash computes SHA-512 hash of password + salt
func computePasswordHash(password, salt string) string {
	hasher := sha512.New()
	hasher.Write([]byte(password + salt))
	hashBytes := hasher.Sum(nil)
	return hex.EncodeToString(hashBytes)
}

// configHandler returns the pre-serialized engine configuration
func configHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Write(engineConfigJSON)
}

// rconHandler handles RCON commands via HTTP (requires JWT authentication via middleware)
func rconHandler(w http.ResponseWriter, r *http.Request) {
	// Only allow POST requests
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed, use POST", http.StatusMethodNotAllowed)
		return
	}

	// Parse request body
	var requestBody struct {
		Command interface{} `json:"command"`
	}

	if err := json.NewDecoder(r.Body).Decode(&requestBody); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if requestBody.Command == nil {
		http.Error(w, "Command is required", http.StatusBadRequest)
		return
	}

	// Handle both string and array of strings
	switch cmd := requestBody.Command.(type) {
	case string:
		if cmd == "" {
			http.Error(w, "Command cannot be empty", http.StatusBadRequest)
			return
		}
		ExecuteCommand(cmd)
	case []interface{}:
		if len(cmd) == 0 {
			http.Error(w, "Command array cannot be empty", http.StatusBadRequest)
			return
		}
		for _, c := range cmd {
			if str, ok := c.(string); ok && str != "" {
				ExecuteCommand(str)
			}
		}
	default:
		http.Error(w, "Command must be a string or array of strings", http.StatusBadRequest)
		return
	}

	// Return 204 No Content
	w.WriteHeader(http.StatusNoContent)
}

// ExecuteCommand sends a command to the Xash3D engine
func ExecuteCommand(command string) {
	log.Info().Str("command", command).Msg("executing rcon command")

	// Add command to the engine's command buffer
	// We need to add a newline to ensure the command is executed
	commandWithNewline := command + "\n"
	cCommand := C.CString(commandWithNewline)
	defer C.free(unsafe.Pointer(cCommand))

	// Add the command to the buffer (will be executed on next frame)
	C.Cbuf_AddText(cCommand)
}

// adminHandler serves the admin panel
func adminHandler(w http.ResponseWriter, r *http.Request) {
	// Check if admin panel is enabled
	if !appConfig.Admin.Enabled() {
		http.Error(w, "Admin panel is disabled (ADMIN_PANEL_USER and ADMIN_PANEL_PASSWORD must be set)", http.StatusServiceUnavailable)
		return
	}

	// Serve admin index.html
	path := filepath.Join("public", "admin", "index.html")
	if _, err := os.Stat(path); os.IsNotExist(err) {
		http.NotFound(w, r)
		return
	}
	http.ServeFile(w, r, path)
}

// logsWebSocketHandler handles WebSocket connections for log streaming (requires JWT authentication)
func logsWebSocketHandler(w http.ResponseWriter, r *http.Request) {
	// Check if admin panel is enabled
	if !appConfig.Admin.Enabled() {
		http.Error(w, "Log streaming is disabled (ADMIN_PANEL_USER and ADMIN_PANEL_PASSWORD must be set)", http.StatusServiceUnavailable)
		return
	}

	// Upgrade to WebSocket first (auth will happen via first message)
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Error().Err(err).Msg("failed to upgrade to websocket for logs")
		return
	}

	// Set read deadline for auth message (5 seconds)
	conn.SetReadDeadline(time.Now().Add(5 * time.Second))

	// Read first message which should contain the auth token
	var authMsg [2]string
	if err := conn.ReadJSON(&authMsg); err != nil {
		log.Warn().Str("remote", r.RemoteAddr).Err(err).Msg("failed to read auth message")
		conn.WriteJSON([2]any{"v1:error", "Failed to read auth message"})
		conn.Close()
		return
	}

	if authMsg[0] != "v1:auth" || authMsg[1] == "" {
		log.Warn().Str("remote", r.RemoteAddr).Msg("invalid auth message")
		conn.WriteJSON([2]any{"v1:error", "Invalid auth message"})
		conn.Close()
		return
	}

	// Validate JWT token
	claims, err := validateToken(authMsg[1])
	if err != nil {
		log.Warn().Str("remote", r.RemoteAddr).Err(err).Msg("invalid token for websocket")
		conn.WriteJSON([2]any{"v1:error", "Invalid or expired token"})
		conn.Close()
		return
	}

	if claims.Role != "admin" {
		conn.WriteJSON([2]any{"v1:error", "Insufficient permissions"})
		conn.Close()
		return
	}

	// Verify username in token matches configured username
	if claims.Username != appConfig.Admin.Username {
		log.Warn().Str("remote", r.RemoteAddr).Str("expected", appConfig.Admin.Username).Str("got", claims.Username).Msg("token username mismatch for websocket")
		conn.WriteJSON([2]any{"v1:error", "Invalid token"})
		conn.Close()
		return
	}

	// Auth successful - send confirmation
	conn.WriteJSON([2]any{"v1:auth", "ok"})

	// Reset read deadline for normal operation
	conn.SetReadDeadline(time.Time{})

	defer conn.Close()

	// Send history to client
	if err := sendHistory(conn); err != nil {
		log.Error().Err(err).Msg("failed to send log history")
		return
	}

	// Create client channel
	clientChan := make(chan string, 256)

	// Register client
	logClientsMux.Lock()
	logClients[conn] = clientChan
	logClientsMux.Unlock()

	// Unregister on exit
	defer func() {
		logClientsMux.Lock()
		delete(logClients, conn)
		logClientsMux.Unlock()
		close(clientChan)
	}()

	// Read pump (for keep-alive and close detection)
	conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	// Write pump (sends logs to client)
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()

		for {
			select {
			case message, ok := <-clientChan:
				if !ok {
					return
				}

				logMsg := struct {
					Timestamp string `json:"timestamp"`
					Message   string `json:"message"`
				}{
					Timestamp: time.Now().Format(time.RFC3339),
					Message:   message,
				}

				if err := conn.WriteJSON([2]any{LogsEventLog, logMsg}); err != nil {
					return
				}

			case <-ticker.C:
				// Send ping to keep connection alive
				if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
					return
				}
			}
		}
	}()

	// Keep connection alive by reading messages
	for {
		if _, _, err := conn.NextReader(); err != nil {
			break
		}
	}
}
