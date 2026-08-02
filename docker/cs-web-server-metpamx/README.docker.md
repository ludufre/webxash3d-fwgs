# Counter-Strike 1.6 Web Server Docker (with AMX Mod X)

This image provides a **plug-and-play Docker image** for running a fully functional **Counter-Strike 1.6** client and
dedicated server via the web with **AMX Mod X pre-installed**. Powered by **Xash3D FWGS**, **WebRTC**, and modern web
tooling, this setup allows for in-browser gameplay and remote multiplayer support with full plugin support.

Repository: [github.com/yohimik/webxash3d-fwgs/docker/cs-web-server-metpamx](https://github.com/yohimik/webxash3d-fwgs/tree/main/docker/cs-web-server-metpamx)

---

## 🙏 Credits & Acknowledgements

Special thanks that made this project possible:

- [@ludufre](https://github.com/ludufre) - docker images and metamod plugins
- [@ololoken](https://github.com/ololoken) — graphics, WebGL2, and resolving many issues

---

## 🧱 Features

- ✅ Web-based CS 1.6 client (HTML + TypeScript + Vite)
- ✅ Dedicated CS 1.6 server (Go + CGO + Xash3D FWGS)
- ✅ WebRTC support for browser-to-server networking
- ✅ **Pre-installed Metamod-P & AMX Mod X**
- ✅ **Ready for custom plugins out of the box**
- ✅ Dockerized & easy to deploy
- ✅ i386 (32-bit) architecture support
- ✅ Optional Admin Panel for remote server management

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
  yohimik/cs-web-server-metpamx:latest \
  +map de_dust +maxplayers 14
```

```yaml
services:
  xash3d:
    image: yohimik/cs-web-server-metpamx:latest
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

Variables available
from [base image](https://github.com/yohimik/webxash3d-fwgs/blob/main/docker/cs-web-server/README.md#-environment-variables)

## 🛠️ Customization

### AMX Mod X Plugins

This image comes with AMX Mod X pre-installed. To add custom plugins:

**Mount plugins directory:**

```yaml
volumes:
  - "./valve.zip:/xashds/public/valve.zip"
  - "./plugins:/xashds/cstrike/addons/amxmodx/plugins"
  - "./configs:/xashds/cstrike/addons/amxmodx/configs"
```

**Extend the image:**

```dockerfile
FROM yohimik/cs-web-server-metpamx:latest
COPY my-plugins/*.amxx /xashds/cstrike/addons/amxmodx/plugins/
```

### Plugin Configuration

Edit `plugins.ini` to enable/disable plugins:

```yaml
volumes:
  - "./plugins.ini:/xashds/cstrike/addons/amxmodx/configs/plugins.ini"
```

## 🔐 Admin Panel

This image includes an optional **Admin Panel** for remote administration.

For information on how to enable and use the Admin Panel, see
the [CS Web Server Admin Panel documentation](https://github.com/yohimik/webxash3d-fwgs/tree/main/docker/cs-web-server#-admin-panel).

## 🌐 Discord Community

Need help? Want to share your project or ideas? **[Join our Discord community](https://discord.gg/cRNGjWfTDd)** to
connect with others!

## 📜 License

This project is licensed under the MIT License. See the [LICENSE](./LICENSE.md) file for more information.

## 📝 Changelog

See [CHANGELOG.md](https://github.com/yohimik/webxash3d-fwgs/tree/main/docker/cs-web-server-metpamx/CHANGELOG.md) for a
full list of updates and release history.

## 🔗 Related Projects

- [cs-web-server](https://github.com/yohimik/webxash3d-fwgs/tree/main/docker/cs-web-server) - Vanilla version without
  AMX Mod X