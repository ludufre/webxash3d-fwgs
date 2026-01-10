# Counter-Strike 1.6 Web Server Docker

This image provides a **plug-and-play Docker image** for running a fully functional **Counter-Strike 1.6** client
and dedicated server via the web. Powered by **Xash3D FWGS**, **WebRTC**, and modern web tooling, this setup allows for
in-browser gameplay and remote multiplayer support.

Repository: [github.com/yohimik/webxash3d-fwgs/docker/cs-web-server](https://github.com/yohimik/webxash3d-fwgs/tree/main/docker/cs-web-server)
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

If you want **AMX Mod X and Metamod pre-installed and ready to use**, check out the [cs-web-server-metpamx](https://github.com/yohimik/webxash3d-fwgs/tree/main/docker/cs-web-server-metpamx) variant. It includes:
- Pre-configured Metamod-P
- AMX Mod X with all base modules
- Ready for custom plugins out of the box

This base version is compatible with AMX Mod X but requires manual installation.

---

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

| Variable               | Description                                                               | Example                  |
|------------------------|---------------------------------------------------------------------------|--------------------------|
| `IP`                   | Public IP address for WebRTC connection                                   | `123.45.67.89`           |
| `PORT`                 | UDP port for CS server (must be open)                                     | `27018`                  |
| `DISABLE_X_POWERED_BY` | Set to `true` to remove the `X-Powered-By` HTTP header                    | `true`                   |
| `X_POWERED_BY_VALUE`   | Custom value for `X-Powered-By` header if not disabled                    | `CS 1.6 Web Server`.     |
| `ADMIN_PANEL_USER`       | Username for [Admin Panel](#-admin-panel) access (leave empty to disable) | `admin`                  |
| `ADMIN_PANEL_PASSWORD` | Password for [Admin Panel](#-admin-panel) access (leave empty to disable) | `<strong_password>`      |

### Engine Configuration

| Variable            | Description                                             | Default                                         |
|---------------------|---------------------------------------------------------|-------------------------------------------------|
| `GAME_DIR`          | Game directory name                                     | `cstrike`                                       |
| `ENGINE_ARGS`       | Comma-separated engine arguments                        | `-windowed,-game,cstrike`                       |
| `ENGINE_CONSOLE`    | Comma-separated console commands to execute on startup  | `_vgui_menus 0`                                 |

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

This image includes an optional **Admin Panel** for remote administration (RCON, live logs). Enable it by setting the following environment variables in your Docker run or compose configuration:

```yaml
environment:
  ADMIN_PANEL_USER: "admin"
  ADMIN_PANEL_PASSWORD: "<strong_password>"
```

Access the admin panel at `http://<your-public-ip>:<your-port>/admin`.

Security recommendations: use a strong password, restrict access via a reverse proxy with TLS, and do not expose the admin panel publicly without proper protections.

## 🌐 Discord Community

Need help? Want to share your project or ideas?
**[Join our Discord community](https://discord.gg/cRNGjWfTDd)** to connect with others!

## 📜 License

This project is licensed under the MIT License.
See the [LICENSE](./LICENSE.md) file for more information.

## 📝 Changelog

See [CHANGELOG.md](https://github.com/yohimik/webxash3d-fwgs/tree/main/docker/cs-web-server/CHANGELOG.md) for a full
list of updates and release history.

## 🔗 Related Projects

- [cs-web-server-metpamx](https://github.com/yohimik/webxash3d-fwgs/tree/main/docker/cs-web-server-metpamx) - Version with AMX Mod X & Metamod pre-installed