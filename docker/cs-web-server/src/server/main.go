package main

import (
	"bufio"
	"os"
	"syscall"

	goxash3d_fwgs "github.com/yohimik/goxash3d-fwgs/pkg"
)

// setupEngineLogging redirects stdout so Xash3D console output can be captured.
//
// Log output itself goes to realStdout, a duplicate of fd 1 taken before this
// redirection, so records written by the loggers are not re-read here.
func setupEngineLogging() {
	r, w, err := os.Pipe()
	if err != nil {
		log.Error().Err(err).Msg("failed to create engine log pipe")
		return
	}

	// Redirect fd 1 to the pipe. This affects both Go and C code (CGO).
	if err := syscall.Dup2(int(w.Fd()), int(os.Stdout.Fd())); err != nil {
		log.Error().Err(err).Msg("failed to redirect stdout")
		return
	}

	go func() {
		scanner := bufio.NewScanner(r)
		for scanner.Scan() {
			line := scanner.Text()

			// The admin panel needs the untouched console text: it parses cvar
			// values and map listings straight out of these lines.
			broadcastLog(line)

			// stdout gets the same line as a field on a structured record.
			engineLog.Info().Str("log", line).Msg("engine log")
		}

		if err := scanner.Err(); err != nil {
			log.Error().Err(err).Msg("engine log reader stopped")
		}
	}()
}

func main() {
	goxash3d_fwgs.DefaultXash3D.Net = net

	go runSFU()

	// Setup engine log capture BEFORE starting engine
	setupEngineLogging()

	goxash3d_fwgs.DefaultXash3D.SysStart()
}
