package main

import (
	"net/http"
	"time"

	"github.com/gorilla/websocket"
	"github.com/pion/ice/v4"
	"github.com/pion/interceptor"
	"github.com/pion/webrtc/v4"
)

func init() {
	// Configuration is already resolved: appConfig is a package variable, so
	// it is initialised before any init function runs.
	flushConfigWarnings()

	if appConfig.Admin.Enabled() {
		generateJWTSecret()
		generatePasswordSalt()

		loginRateLimiter = NewRateLimiter(appConfig.Admin.LoginRateLimit)
		rconRateLimiter = NewRateLimiter(appConfig.Admin.RconRateLimit)

		log.Info().Str("username", appConfig.Admin.Username).Msg("jwt authentication enabled")
	}

	// Initialize log streaming
	logBuffer = NewCircularBuffer(appConfig.Admin.LogBufferEntries)
	logClients = make(map[*websocket.Conn]chan string)
	logBroadcast = make(chan string, 256)

	// Start log broadcast goroutine
	go logBroadcaster()
}

func runSFU() {
	settingEngine := webrtc.SettingEngine{}
	settingEngine.DetachDataChannels()

	if appConfig.Server.Port > 0 {
		udpMux, err := ice.NewMultiUDPMuxFromPort(appConfig.Server.Port)
		if err != nil {
			panic(err)
		}
		settingEngine.SetICEUDPMux(udpMux)
	}

	if appConfig.Server.IP != "" {
		settingEngine.SetNAT1To1IPs(
			[]string{appConfig.Server.IP}, webrtc.ICECandidateTypeHost)
	}

	m := &webrtc.MediaEngine{}
	err := m.RegisterDefaultCodecs()
	if err != nil {
		panic(err)
	}

	i := &interceptor.Registry{}
	err = webrtc.RegisterDefaultInterceptors(m, i)
	if err != nil {
		panic(err)
	}
	api = webrtc.NewAPI(webrtc.WithSettingEngine(settingEngine), webrtc.WithMediaEngine(m), webrtc.WithInterceptorRegistry(i))

	// Init other state
	trackLocals = map[string]*webrtc.TrackLocalStaticRTP{}

	// request a keyframe every 3 seconds
	go func() {
		ticker := time.NewTicker(time.Second * 3)
		defer ticker.Stop()
		for range ticker.C {
			dispatchKeyFrame()
		}
	}()

	// start HTTP server
	log.Info().Str("addr", appConfig.Server.Addr).Msg("http server listening")
	if err := http.ListenAndServe(appConfig.Server.Addr, &Server{}); err != nil { //nolint: gosec
		log.Error().Err(err).Str("addr", appConfig.Server.Addr).Msg("http server stopped")
	}
}
