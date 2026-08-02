package main

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/jinzhu/configor"
	"gopkg.in/yaml.v3"
)

// ============================================
// Custom field types
// ============================================

// CommaSeparated is a []string that additionally accepts a comma-separated
// scalar, so `ENGINE_ARGS="-windowed,-console"` and a native YAML/JSON list
// both work. configor feeds env values and `default` tags through
// yaml.Unmarshal, so implementing the YAML unmarshaler covers both.
type CommaSeparated []string

func (c *CommaSeparated) UnmarshalYAML(value *yaml.Node) error {
	if value.Kind == yaml.SequenceNode {
		var list []string
		if err := value.Decode(&list); err != nil {
			return err
		}
		*c = list
		return nil
	}

	var raw string
	if err := value.Decode(&raw); err != nil {
		return err
	}
	*c = splitList(raw)
	return nil
}

func (c *CommaSeparated) UnmarshalJSON(data []byte) error {
	var list []string
	if err := json.Unmarshal(data, &list); err == nil {
		*c = list
		return nil
	}

	var raw string
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	*c = splitList(raw)
	return nil
}

// Slice returns the values, never nil, so JSON encodes `[]` rather than `null`.
func (c CommaSeparated) Slice() []string {
	if c == nil {
		return []string{}
	}
	return c
}

// PairMap is a map[string]string that additionally accepts the
// `from:to,from:to` scalar form used by FILES_MAP.
type PairMap map[string]string

func (m *PairMap) UnmarshalYAML(value *yaml.Node) error {
	if value.Kind == yaml.MappingNode {
		pairs := map[string]string{}
		if err := value.Decode(&pairs); err != nil {
			return err
		}
		*m = pairs
		return nil
	}

	var raw string
	if err := value.Decode(&raw); err != nil {
		return err
	}
	*m = splitPairs(raw)
	return nil
}

func (m *PairMap) UnmarshalJSON(data []byte) error {
	pairs := map[string]string{}
	if err := json.Unmarshal(data, &pairs); err == nil {
		*m = pairs
		return nil
	}

	var raw string
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	*m = splitPairs(raw)
	return nil
}

// Map returns the pairs, never nil, so JSON encodes `{}` rather than `null`.
func (m PairMap) Map() map[string]string {
	if m == nil {
		return map[string]string{}
	}
	return m
}

// splitList turns "a, b ,c" into ["a","b","c"], dropping empties.
func splitList(value string) []string {
	result := []string{}
	for _, part := range strings.Split(value, ",") {
		if trimmed := strings.TrimSpace(part); trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}

// splitPairs turns "from:to,from:to" into a map.
func splitPairs(value string) map[string]string {
	result := map[string]string{}
	for _, pair := range strings.Split(value, ",") {
		parts := strings.SplitN(strings.TrimSpace(pair), ":", 2)
		if len(parts) == 2 {
			result[strings.TrimSpace(parts[0])] = strings.TrimSpace(parts[1])
		}
	}
	return result
}

// ============================================
// Configuration
// ============================================

// Config is the single source of truth for every tunable in the server.
//
// Values are resolved by configor in this order: `default` tag, then any
// configuration file, then the environment variable named by the `env` tag.
type Config struct {
	Server    ServerConfig    `yaml:"server" json:"server" toml:"server"`
	Engine    EngineSettings  `yaml:"engine" json:"engine" toml:"engine"`
	Libraries LibrariesConfig `yaml:"libraries" json:"libraries" toml:"libraries"`
	Admin     AdminConfig     `yaml:"admin" json:"admin" toml:"admin"`
	Log       LogConfig       `yaml:"log" json:"log" toml:"log"`
	WebRTC    WebRTCConfig    `yaml:"webrtc" json:"webrtc" toml:"webrtc"`
}

// ServerConfig covers the HTTP listener and WebRTC networking.
type ServerConfig struct {
	// Addr is the HTTP listen address.
	Addr string `env:"ADDR" default:":27016" yaml:"addr" json:"addr" toml:"addr"`
	// Port, when set, pins ICE to a single UDP port via a multiplexer.
	Port int `env:"PORT" yaml:"port" json:"port" toml:"port"`
	// IP, when set, is advertised as the 1-to-1 NAT host candidate.
	IP string `env:"IP" yaml:"ip" json:"ip" toml:"ip"`

	DisableXPoweredBy bool   `env:"DISABLE_X_POWERED_BY" yaml:"disable_x_powered_by" json:"disable_x_powered_by" toml:"disable_x_powered_by"`
	XPoweredByValue   string `env:"X_POWERED_BY_VALUE" default:"yohimik" yaml:"x_powered_by_value" json:"x_powered_by_value" toml:"x_powered_by_value"`
}

// EngineSettings covers the Xash3D engine startup.
type EngineSettings struct {
	Arguments CommaSeparated `env:"ENGINE_ARGS" yaml:"arguments" json:"arguments" toml:"arguments"`
	Console   CommaSeparated `env:"ENGINE_CONSOLE" yaml:"console" json:"console" toml:"console"`
	GameDir   string         `env:"GAME_DIR" required:"true" yaml:"game_dir" json:"game_dir" toml:"game_dir"`
}

// LibrariesConfig covers the WASM artefacts served to the browser.
type LibrariesConfig struct {
	Client           string         `env:"CLIENT_WASM_PATH" required:"true" yaml:"client" json:"client" toml:"client"`
	Server           string         `env:"SERVER_WASM_PATH" required:"true" yaml:"server" json:"server" toml:"server"`
	Menu             string         `env:"MENU_WASM_PATH" required:"true" yaml:"menu" json:"menu" toml:"menu"`
	Extras           string         `env:"EXTRAS_PATH" required:"true" yaml:"extras" json:"extras" toml:"extras"`
	Filesystem       string         `env:"FILESYSTEM_WASM_PATH" required:"true" yaml:"filesystem" json:"filesystem" toml:"filesystem"`
	DynamicLibraries CommaSeparated `env:"DYNAMIC_LIBRARIES" required:"true" yaml:"dynamic_libraries" json:"dynamic_libraries" toml:"dynamic_libraries"`
	FilesMap         PairMap        `env:"FILES_MAP" required:"true" yaml:"files_map" json:"files_map" toml:"files_map"`
}

// AdminConfig covers the admin panel. Leaving Password blank disables it.
type AdminConfig struct {
	Username         string  `env:"ADMIN_PANEL_USER" default:"admin" yaml:"username" json:"username" toml:"username"`
	Password         string  `env:"ADMIN_PANEL_PASSWORD" yaml:"password" json:"password" toml:"password"`
	TokenTTLHours    int     `env:"ADMIN_TOKEN_TTL_HOURS" default:"24" yaml:"token_ttl_hours" json:"token_ttl_hours" toml:"token_ttl_hours"`
	LoginRateLimit   float64 `env:"ADMIN_LOGIN_RATE_LIMIT" default:"5" yaml:"login_rate_limit" json:"login_rate_limit" toml:"login_rate_limit"`
	RconRateLimit    float64 `env:"ADMIN_RCON_RATE_LIMIT" default:"30" yaml:"rcon_rate_limit" json:"rcon_rate_limit" toml:"rcon_rate_limit"`
	LogBufferEntries int     `env:"ADMIN_LOG_BUFFER" default:"1000" yaml:"log_buffer_entries" json:"log_buffer_entries" toml:"log_buffer_entries"`
}

// Enabled reports whether the admin panel has usable credentials.
func (a AdminConfig) Enabled() bool {
	return a.Username != "" && a.Password != ""
}

// LogConfig covers both the Go server log and the browser client log.
type LogConfig struct {
	// Level is the zerolog level for this process.
	Level string `env:"LOG_LEVEL" default:"info" yaml:"level" json:"level" toml:"level"`
	// Format is "pretty" for human-readable console output, or "json" for one
	// structured record per line. Engine output is wrapped either way.
	Format string `env:"LOG_FORMAT" default:"pretty" yaml:"format" json:"format" toml:"format"`
	// ClientLevel is served via GET /v1/config and drives pino in the browser.
	ClientLevel string `env:"CLIENT_LOG_LEVEL" default:"info" yaml:"client_level" json:"client_level" toml:"client_level"`
}

// WebRTCConfig covers websocket keepalive tuning.
type WebRTCConfig struct {
	PongWaitSeconds  int `env:"PONG_WAIT_SECONDS" default:"60" yaml:"pong_wait_seconds" json:"pong_wait_seconds" toml:"pong_wait_seconds"`
	WriteWaitSeconds int `env:"WRITE_WAIT_SECONDS" default:"10" yaml:"write_wait_seconds" json:"write_wait_seconds" toml:"write_wait_seconds"`
}

// ============================================
// Loading
// ============================================

// Candidate config files, used when CONFIG_FILE is not set. configor also
// picks up environment variants of each (config.production.yml) via CONFIGOR_ENV.
var defaultConfigFiles = []string{
	"config.yml",
	"config.yaml",
	"config.json",
	"config.toml",
}

var serverLogLevels = []string{"trace", "debug", "info", "warn", "error", "fatal"}

var logFormats = []string{LogFormatPretty, LogFormatJSON}

// Levels pino accepts in the browser.
var clientLogLevels = []string{"trace", "debug", "info", "warn", "error", "fatal", "silent"}

var (
	// configWarnings is drained by flushConfigWarnings once the logger exists.
	// Config is loaded during package variable initialisation, which happens
	// before the logger is constructed, so warnings cannot be emitted inline.
	configWarnings []string

	appConfig = mustLoadConfig()

	engineConfigJSON = mustBuildEngineConfigJSON()
)

// mustLoadConfig resolves defaults, config files and environment variables.
func mustLoadConfig() Config {
	var config Config

	loader := configor.New(&configor.Config{
		// Every field carries an explicit `env` tag, so no prefix is applied.
		ENVPrefix: "-",
		// Reject unknown keys in config files to catch typos early.
		ErrorOnUnmatchedKeys: true,
		// Left un-silenced on purpose: when a file named by CONFIG_FILE is
		// missing, configor falls back to its `.example.` sibling, and that
		// substitution must not happen quietly.
	})

	if err := loader.Load(&config, configFiles()...); err != nil {
		panic(fmt.Sprintf("failed to load configuration: %v", err))
	}

	config.Log.Level = normalizeChoice(
		config.Log.Level, serverLogLevels, "info", "LOG_LEVEL")
	config.Log.Format = normalizeChoice(
		config.Log.Format, logFormats, LogFormatPretty, "LOG_FORMAT")
	config.Log.ClientLevel = normalizeChoice(
		config.Log.ClientLevel, clientLogLevels, "info", "CLIENT_LOG_LEVEL")

	if config.Admin.Password == "" {
		configWarnings = append(configWarnings,
			"ADMIN_PANEL_PASSWORD not set, admin panel will be disabled")
	}

	return config
}

// configFiles returns the config files to load. CONFIG_FILE takes precedence
// and is reported verbatim when missing; otherwise known names are probed.
func configFiles() []string {
	if explicit := os.Getenv("CONFIG_FILE"); explicit != "" {
		return splitList(explicit)
	}

	var found []string
	for _, candidate := range defaultConfigFiles {
		if info, err := os.Stat(candidate); err == nil && info.Mode().IsRegular() {
			found = append(found, candidate)
		}
	}
	return found
}

// normalizeChoice falls back to defaultValue when value is not in allowed,
// recording a warning naming the environment variable.
func normalizeChoice(value string, allowed []string, defaultValue, envName string) string {
	for _, candidate := range allowed {
		if value == candidate {
			return value
		}
	}

	configWarnings = append(configWarnings, fmt.Sprintf(
		"Invalid %s %q, using default %q (allowed: %s)",
		envName, value, defaultValue, strings.Join(allowed, ", ")))

	return defaultValue
}

// flushConfigWarnings emits warnings collected during configuration load.
// Called once the logger is available.
func flushConfigWarnings() {
	for _, warning := range configWarnings {
		log.Warn().Msg(warning)
	}
	configWarnings = nil
}

// ============================================
// Engine config response
// ============================================

// EngineConfig is the JSON body of GET /v1/config.
type EngineConfig struct {
	Arguments        []string          `json:"arguments"`
	Console          []string          `json:"console"`
	GameDir          string            `json:"game_dir"`
	Libraries        map[string]string `json:"libraries"`
	DynamicLibraries []string          `json:"dynamic_libraries"`
	FilesMap         map[string]string `json:"files_map"`
	// LogLevel is the log level browser clients (game and admin panel) use.
	// It is served here rather than in the login response so that both clients
	// can configure their logger before, and independently of, authentication.
	LogLevel string `json:"log_level"`
}

// mustBuildEngineConfigJSON pre-serialises the client config response.
func mustBuildEngineConfigJSON() []byte {
	payload := EngineConfig{
		Arguments: appConfig.Engine.Arguments.Slice(),
		Console:   appConfig.Engine.Console.Slice(),
		GameDir:   appConfig.Engine.GameDir,
		Libraries: map[string]string{
			"client":     appConfig.Libraries.Client,
			"server":     appConfig.Libraries.Server,
			"extras":     appConfig.Libraries.Extras,
			"menu":       appConfig.Libraries.Menu,
			"filesystem": appConfig.Libraries.Filesystem,
		},
		DynamicLibraries: appConfig.Libraries.DynamicLibraries.Slice(),
		FilesMap:         appConfig.Libraries.FilesMap.Map(),
		LogLevel:         appConfig.Log.ClientLevel,
	}

	encoded, err := json.Marshal(payload)
	if err != nil {
		panic(fmt.Sprintf("failed to serialize engine config: %v", err))
	}
	return encoded
}
