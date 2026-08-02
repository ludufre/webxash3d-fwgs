package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

var (
	jwtSecret []byte
	// jwtExpiration is how long an admin session token stays valid.
	jwtExpiration = time.Duration(appConfig.Admin.TokenTTLHours) * time.Hour
)

// Claims represents the JWT claims
type Claims struct {
	Role     string `json:"role"`
	Username string `json:"username"`
	jwt.RegisteredClaims
}

// LoginRequest represents the login request body
type LoginRequest struct {
	Username     string `json:"username"`
	PasswordHash string `json:"passwordHash"`
}

// LoginResponse represents the login response
type LoginResponse struct {
	Token     string `json:"token"`
	ExpiresIn int64  `json:"expiresIn"` // seconds
}

// SaltResponse represents the salt response
type SaltResponse struct {
	Salt string `json:"salt"`
}

// generateJWTSecret generates a random secret key for JWT signing
func generateJWTSecret() {
	secret := make([]byte, 32)
	if _, err := rand.Read(secret); err != nil {
		panic("Failed to generate JWT secret: " + err.Error())
	}
	jwtSecret = secret
	log.Info().Msg("JWT secret generated")
}

// generatePasswordSalt generates a random salt for password hashing
func generatePasswordSalt() {
	saltBytes := make([]byte, 32)
	if _, err := rand.Read(saltBytes); err != nil {
		panic("Failed to generate password salt: " + err.Error())
	}
	passwordSalt = hex.EncodeToString(saltBytes)
	log.Info().Int("bytes", len(saltBytes)).Msg("password salt generated")
}

// generateToken creates a new JWT token for authenticated users
func generateToken(username string) (string, error) {
	expirationTime := time.Now().Add(jwtExpiration)
	claims := &Claims{
		Role:     "admin",
		Username: username,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expirationTime),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "xash3d-server",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtSecret)
}

// validateToken validates and parses a JWT token
func validateToken(tokenString string) (*Claims, error) {
	claims := &Claims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
		return jwtSecret, nil
	})

	if err != nil {
		return nil, err
	}

	if !token.Valid {
		return nil, jwt.ErrSignatureInvalid
	}

	return claims, nil
}

// extractToken extracts the JWT token from the Authorization header
func extractToken(r *http.Request) string {
	bearerToken := r.Header.Get("Authorization")
	if len(strings.Split(bearerToken, " ")) == 2 {
		return strings.Split(bearerToken, " ")[1]
	}
	return ""
}

// loginHandler handles authentication and returns a JWT token
func loginHandler(w http.ResponseWriter, r *http.Request) {
	// Check if admin panel is enabled
	if !appConfig.Admin.Enabled() {
		http.Error(w, "Admin panel is disabled (ADMIN_PANEL_USER and ADMIN_PANEL_PASSWORD must be set)", http.StatusServiceUnavailable)
		return
	}

	// Only allow POST requests
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed, use POST", http.StatusMethodNotAllowed)
		return
	}

	// Parse request body
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate username and password hash are provided
	if len(req.Username) == 0 {
		http.Error(w, "Username is required", http.StatusBadRequest)
		return
	}

	if len(req.PasswordHash) == 0 {
		http.Error(w, "Password hash is required", http.StatusBadRequest)
		return
	}

	// Check credentials with constant-time hash comparison
	if !checkCredentials(req.Username, req.PasswordHash) {
		log.Warn().Str("remote", r.RemoteAddr).Str("username", req.Username).Msg("failed login attempt")
		http.Error(w, "Invalid username or password", http.StatusUnauthorized)
		return
	}

	// Generate JWT token with username
	token, err := generateToken(req.Username)
	if err != nil {
		log.Error().Err(err).Msg("failed to generate token")
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Return token
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(LoginResponse{
		Token:     token,
		ExpiresIn: int64(jwtExpiration.Seconds()),
	})

	log.Info().Str("remote", r.RemoteAddr).Str("username", req.Username).Msg("login successful")
}

// saltHandler returns the password salt for client-side hashing
func saltHandler(w http.ResponseWriter, r *http.Request) {
	// Check if admin panel is enabled
	if !appConfig.Admin.Enabled() {
		http.Error(w, "Admin panel is disabled (ADMIN_PANEL_USER and ADMIN_PANEL_PASSWORD must be set)", http.StatusServiceUnavailable)
		return
	}

	// Only allow GET requests
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed, use GET", http.StatusMethodNotAllowed)
		return
	}

	// Return the salt (this is public information)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(SaltResponse{
		Salt: passwordSalt,
	})
}

// authMiddleware validates JWT token from request
func authMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Check if admin panel is enabled
		if !appConfig.Admin.Enabled() {
			http.Error(w, "Admin panel is disabled (ADMIN_PANEL_USER and ADMIN_PANEL_PASSWORD must be set)", http.StatusServiceUnavailable)
			return
		}

		// Extract token from header
		tokenString := extractToken(r)
		if tokenString == "" {
			http.Error(w, "Missing authorization token", http.StatusUnauthorized)
			return
		}

		// Validate token
		claims, err := validateToken(tokenString)
		if err != nil {
			log.Warn().Str("remote", r.RemoteAddr).Err(err).Msg("invalid token")
			http.Error(w, "Invalid or expired token", http.StatusUnauthorized)
			return
		}

		// Check role
		if claims.Role != "admin" {
			http.Error(w, "Insufficient permissions", http.StatusForbidden)
			return
		}

		// Verify username in token matches configured username
		if claims.Username != appConfig.Admin.Username {
			log.Warn().Str("remote", r.RemoteAddr).Str("expected", appConfig.Admin.Username).Str("got", claims.Username).Msg("token username mismatch")
			http.Error(w, "Invalid token", http.StatusUnauthorized)
			return
		}

		// Token is valid, proceed to handler
		next(w, r)
	}
}
