package main

import (
	"fmt"
	"io"
	"os"
	"strings"
	"syscall"
	"time"

	"github.com/rs/zerolog"
)

// Supported values for LOG_FORMAT.
const (
	LogFormatPretty = "pretty"
	LogFormatJSON   = "json"
)

// realStdout is a duplicate of the process stdout captured before
// setupEngineLogging replaces file descriptor 1 with a pipe. All log output
// goes here, so records never flow back into the engine capture loop and get
// broadcast twice.
var realStdout = dupStdout()

// log is the server logger. Every event is also mirrored to the admin panel.
var log = newLogger("server", broadcastHook{})

// engineLog carries raw Xash3D stdout lines. It has no broadcast hook on
// purpose: the capture loop forwards the untouched console line to the panel
// itself, so the panel keeps receiving plain text (its cvar and map-list
// parsing depends on that) while stdout gets the structured record.
var engineLog = newLogger("engine")

// dupStdout duplicates fd 1.
//
// On failure it falls back to stderr rather than os.Stdout: once
// setupEngineLogging redirects fd 1, anything written to os.Stdout would be
// read back by the capture loop and broadcast to the admin panel, which must
// never receive the server's JSON records. fd 2 is never redirected, so the
// fallback keeps that guarantee (at the cost of logs landing on stderr).
func dupStdout() *os.File {
	fd, err := syscall.Dup(int(os.Stdout.Fd()))
	if err != nil {
		return os.Stderr
	}
	return os.NewFile(uintptr(fd), "/dev/stdout")
}

// newLogger builds a zerolog logger at the configured level and format.
func newLogger(component string, hooks ...zerolog.Hook) zerolog.Logger {
	var writer io.Writer = realStdout
	if appConfig.Log.Format == LogFormatPretty {
		writer = zerolog.ConsoleWriter{Out: realStdout, TimeFormat: time.RFC3339}
	}

	logger := zerolog.New(writer).
		Level(parseLogLevel(appConfig.Log.Level)).
		With().
		Timestamp().
		Str("component", component).
		Logger()

	for _, hook := range hooks {
		logger = logger.Hook(hook)
	}

	return logger
}

// parseLogLevel maps a configured level name onto zerolog. The value is
// already validated by mustLoadConfig, so the default is unreachable in
// practice.
func parseLogLevel(level string) zerolog.Level {
	parsed, err := zerolog.ParseLevel(level)
	if err != nil {
		return zerolog.InfoLevel
	}
	return parsed
}

// broadcastHook mirrors each event to the admin panel log stream in the
// human-readable form the panel expects.
type broadcastHook struct{}

func (broadcastHook) Run(_ *zerolog.Event, level zerolog.Level, message string) {
	broadcastLog(fmt.Sprintf("[%s] [%s] %s",
		time.Now().Format("15:04:05"),
		strings.ToUpper(level.String()),
		message,
	))
}
