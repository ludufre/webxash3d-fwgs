# Counter-Strike 1.6 Web Server Docker

This repository provides a **plug-and-play Docker image** for running a fully functional **Counter-Strike 1.6** client
and dedicated server via the web. Powered by **Xash3D FWGS**, **WebRTC**, and modern web tooling, this setup allows for
in-browser gameplay and remote multiplayer support.

---

## 🧱 Features

- ✅ Web-based CS 1.6 client (HTML + TypeScript + Vite)
- ✅ Dedicated CS 1.6 server (Go + CGO + Xash3D FWGS)
- ✅ WebRTC support for browser-to-server networking
- ✅ AMX Mod X & Metamod-R compatible
- ✅ Dockerized & easy to deploy
- ✅ i386 (32-bit) architecture support
- ✅ Optional Admin Panel for remote server management

---

## 🎯 Looking for AMX Mod X Support?

If you want **AMX Mod X and Metamod pre-installed and ready to use**, check out
the [cs-web-server-metpamx](https://github.com/yohimik/webxash3d-fwgs/tree/main/docker/cs-web-server-metpamx) variant.
It includes:

- Pre-configured Metamod-P
- AMX Mod X with all base modules
- Ready for custom plugins out of the box

This base version is compatible with AMX Mod X but requires manual installation.

---

## 📁 Repository Structure

```plaintext
.
├── Dockerfile            # Unified Dockerfile for client + server
├── src/
│   ├── client/           # HTML + TypeScript + Vite web client
│   └── server/           # Golang + CGO dedicated server
└── README.md             # You're here
```

## 🔧 Technologies

### 🖥️ Client (src/client)

* Framework: Vite (with HTML + TypeScript)
* NPM packages:
    * xash3d-fwgs
    * cs16-client
* Uses WebRTC to connect to the dedicated server

### 🎮 Server (src/server)

* Language: Go (Golang) + CGO
* Embedded: Xash3D FWGS (dedicated server)
* Network: Pion WebRTC library
* Serves static files for the client frontend

## 🚀 Getting Started

### 🎮 Game Content (Required)

To run the game, you must provide original **Counter-Strike 1.6 game files** from Steam. These must be packaged in a
`valve.zip` file and mounted into the Docker container.

### 📦 `valve.zip` Structure

The `valve.zip` file must contain the following two directories from your Steam installation:

```plaintext
valve.zip
├── valve/
└── cstrike/
```

### ✅ Prerequisites

* Docker installed
* A public IP address (if hosting outside LAN)
* An open UDP port (e.g. 27018)

You must mount the file to the container path `/xashds/public/valve.zip`:

```shell
docker build --platform linux/386 -t cs-web-server  .
docker run -d \
  -p 27016:27016 \
  -p <your-port>:<your-port>/udp \
  -e IP=<your-public-ip> \
  -e PORT=<your-port> \
  -v $(pwd)/valve.zip:/xashds/public/valve.zip \
  yohimik/cs-web-server:latest \
  +map de_dust +maxplayers 14
```

```yaml
services:
  xash3d:
    image: yohimik/cs-web-server:latest
    command: [ "+map de_dust", "+maxplayers 14" ]
    restart: always
    platform: linux/386
    environment:
      PORT: <your-port>
      IP: <your-public-ip>
    volumes:
      - "./valve.zip:/xashds/public/valve.zip"
    ports:
      - "27016:27016"
      - "<your-port>:<your-port>"
      - "<your-port>:<your-port>/udp"

```

Replace the placeholders:

* `<your-public-ip>` — your server's external IP
* `<your-port>` — open UDP port (e.g. 27018)

Then open `http://<your-server-ip>:27016` in your browser!

## 🌍 Environment Variables

### Server Configuration

| Variable                 | Description                                                                                                                                        | Example             |
|--------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------|---------------------|
| `IP`                     | Public IP address for WebRTC connection                                                                                                            | `123.45.67.89`      |
| `PORT`                   | UDP port for CS server (must be open)                                                                                                              | `27018`             |
| `DISABLE_X_POWERED_BY`   | Set to `true` to remove the `X-Powered-By` HTTP header                                                                                             | `true`              |
| `X_POWERED_BY_VALUE`     | Custom value for `X-Powered-By` header if not disabled                                                                                             | `CS 1.6 Web Server` |
| `PONG_WAIT_SECONDS`      | Seconds to wait for a pong/any message before the WebSocket connection is considered dead (must be a positive integer, otherwise defaults to `60`) | `60`                |
| `WRITE_WAIT_SECONDS`     | Write deadline in seconds for WebSocket writes and pings (must be a positive integer, otherwise defaults to `10`)                                  | `10`                |
| `ADMIN_PANEL_USER`       | Username for [Admin Panel](#-admin-panel) access (leave empty to disable)                                                                          | `admin`             |
| `ADMIN_PANEL_PASSWORD`   | Password for [Admin Panel](#-admin-panel) access (leave empty to disable)                                                                          | `<strong_password>` |
| `CLIENT_LOG_LEVEL`       | Log level for browser clients (game + Admin Panel), served via `GET /v1/config` (`trace`, `debug`, `info`, `warn`, `error`, `fatal`, `silent`)     | `info`              |
| `ADDR`                   | HTTP listen address                                                                                                                                | `:27016`            |
| `LOG_LEVEL`              | Server log level (`trace`, `debug`, `info`, `warn`, `error`, `fatal`)                                                                              | `info`              |
| `LOG_FORMAT`             | Server log output: `pretty` (console) or `json` (one structured record per line)                                                                   | `json`              |
| `ADMIN_TOKEN_TTL_HOURS`  | Admin session token lifetime, in hours                                                                                                             | `24`                |
| `ADMIN_LOGIN_RATE_LIMIT` | Login attempts allowed per minute                                                                                                                  | `5`                 |
| `ADMIN_RCON_RATE_LIMIT`  | RCON commands allowed per minute                                                                                                                   | `30`                |
| `ADMIN_LOG_BUFFER`       | Log scrollback entries kept for newly connected panels                                                                                             | `1000`              |
| `CONFIG_FILE`            | Config file(s) to load, comma-separated. Defaults to probing `config.yml`/`.yaml`/`.json`/`.toml`                                                  | `config.yml`        |

### Configuration Files

Every variable above can instead live in a configuration file. Loading is handled by
[configor](https://github.com/jinzhu/configor), so YAML, JSON and TOML all work, and values resolve in this order —
**environment variables always win**:

1. the `default` declared on the field
2. the configuration file
3. the environment variable

`config.yml`, `config.yaml`, `config.json` and `config.toml` are picked up automatically from the working directory; set
`CONFIG_FILE` to load something else (comma-separated for several). configor also merges an environment overlay when
`CONFIGOR_ENV` is set — with
`CONFIGOR_ENV=production`, `config.production.yml` is applied on top of `config.yml`.

See [`config.example.yml`](./config.example.yml) for a fully commented file.

List and map values accept either form. In a file they are native YAML:

```yaml
engine:
  arguments: [ "-windowed", "-console" ]
libraries:
  files_map:
    xash.wasm: /xash.wasm
```

while the environment keeps the comma-separated form:

```
ENGINE_ARGS="-windowed,-console"
FILES_MAP="xash.wasm:/xash.wasm"
```

Unknown keys in a config file are rejected, so typos surface at startup rather than silently doing nothing.
`CONFIGOR_DEBUG_MODE=1` or `CONFIGOR_VERBOSE_MODE=1` prints which source each field was resolved from.

### Engine Configuration

| Variable         | Description                                            | Default                   |
|------------------|--------------------------------------------------------|---------------------------|
| `GAME_DIR`       | Game directory name                                    | `cstrike`                 |
| `ENGINE_ARGS`    | Comma-separated engine arguments                       | `-windowed,-game,cstrike` |
| `ENGINE_CONSOLE` | Comma-separated console commands to execute on startup | `_vgui_menus 0`           |

### Library Paths

| Variable               | Description                                                                          | Default                                                                                                                  |
|------------------------|--------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------|
| `CLIENT_WASM_PATH`     | Path to client WASM library                                                          | `cstrike/cl_dlls/client_emscripten_wasm32.wasm`                                                                          |
| `SERVER_WASM_PATH`     | Path to server WASM library                                                          | `cstrike/dlls/cs_emscripten_wasm32.wasm`                                                                                 |
| `MENU_WASM_PATH`       | Path to menu WASM library                                                            | `cstrike/cl_dlls/menu_emscripten_wasm32.wasm`                                                                            |
| `EXTRAS_PATH`          | Path to extras package                                                               | `cstrike/extras.pk3`                                                                                                     |
| `FILESYSTEM_WASM_PATH` | Path to filesystem WASM library                                                      | `filesystem_stdio.wasm`                                                                                                  |
| `DYNAMIC_LIBRARIES`    | Comma-separated list of libraries to load dynamically                                | `dlls/cs_emscripten_wasm32.so,/rwdir/filesystem_stdio.wasm`                                                              |
| `FILES_MAP`            | Comma-separated mapping of virtual paths to actual files (format: `from:to,from:to`) | `dlls/cs_emscripten_wasm32.so:cstrike/dlls/cs_emscripten_wasm32.wasm,/rwdir/filesystem_stdio.wasm:filesystem_stdio.wasm` |

## 🛠️ Customization

* Client UI/UX: Modify files in src/client

To include custom plugins:

* Mount a volume to `/xashds` inside the container
* Or copy plugin files into the Docker build context

## 🔐 Admin Panel

This image includes an optional **Admin Panel** for remote administration (RCON, live logs). Enable it by setting the
following environment variables in your Docker run or compose configuration:

```yaml
environment:
  ADMIN_PANEL_USER: "admin"
  ADMIN_PANEL_PASSWORD: "<strong_password>"
  CLIENT_LOG_LEVEL: "info"  # optional: trace, debug, info, warn, error, fatal, silent
```

Access the admin panel at `http://<your-public-ip>:<your-port>/admin`.

Security recommendations: use a strong password, restrict access via a reverse proxy with TLS, and do not expose the
admin panel publicly without proper protections.

## 🌐 Discord Community

Need help? Want to share your project or ideas? **[Join our Discord community](https://discord.gg/cRNGjWfTDd)** to
connect with others!

## 📜 License

This project is licensed under the MIT License. See the [LICENSE](./LICENSE.md) file for more information.

## 📝 Changelog

See [CHANGELOG.md](https://github.com/yohimik/webxash3d-fwgs/tree/main/docker/cs-web-server/CHANGELOG.md) for a full
list of updates and release history.

## 🔗 Related Projects

- [cs-web-server-metpamx](https://github.com/yohimik/webxash3d-fwgs/tree/main/docker/cs-web-server-metpamx) - Version
  with AMX Mod X & Metamod pre-installed