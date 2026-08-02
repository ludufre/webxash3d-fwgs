import {loadAsync} from "jszip";
import xashURL from "xash3d-fwgs/xash.wasm?url";
import gl4esURL from "xash3d-fwgs/libref_webgl2.wasm?url";

import {
    ApiClient,
    WebSocketClient,
    createLogger,
    fetchClientConfig,
    type ClientConfig,
    type Logger,
} from "./core";
import {GameDom, type GameElements} from "./dom";
import {GameStorage} from "./storage";
import {Xash3DWebRTC} from "./webrtc";

const SIGNALLING_PATH = "/websocket";
const GAME_ARCHIVE = "valve.zip";
const SERVER_ADDRESS = "127.0.0.1:8080";

export interface AppOptions {
    storage?: GameStorage;
    dom?: GameDom;
}

/**
 * Game client application root.
 *
 * Owns every dependency and injects them downwards — nothing here or below
 * reaches for a module-level singleton. The object graph is built in
 * {@link init} rather than the constructor because the logger's level comes
 * from the server config, which has to be fetched first.
 */
export class App {
    private readonly storage: GameStorage;
    private readonly dom: GameDom;

    private logger!: Logger;
    private socket!: WebSocketClient;
    private xash!: Xash3DWebRTC;

    private resolveUsername!: (username: string) => void;
    private readonly username = new Promise<string>((resolve) => {
        this.resolveUsername = resolve;
    });

    constructor(options: AppOptions = {}) {
        this.storage = options.storage ?? new GameStorage();
        this.dom = options.dom ?? new GameDom();
    }

    private get el(): GameElements {
        return this.dom.elements;
    }

    async init(): Promise<void> {
        // Config first: it carries the log level, so nothing that logs can be
        // constructed before it resolves.
        const config = await fetchClientConfig();

        this.logger = createLogger({
            level: config.log_level,
            bindings: {app: "game"},
        });
        this.logger.trace({loadedConfig: config}, "loaded client config");

        // No auto-reconnect: WebRTCTransport owns the retry cycle, because a
        // dropped socket also means the peer connection has to be rebuilt.
        this.socket = new WebSocketClient({
            url: SIGNALLING_PATH,
            logger: this.logger.child({scope: "websocket"}),
        });

        this.restorePreferences();
        this.setupFormHandler();

        const archivePromise = this.fetchArchive();

        this.xash = this.createEngine(config);
        this.xash.onSlowConnection = () => this.setWarningVisible(true);
        this.xash.onConnected = () => this.setWarningVisible(false);

        const [archive, extras] = await Promise.all([
            archivePromise.then((buffer) => loadAsync(buffer)),
            fetch(config.libraries.extras).then((res) => res.arrayBuffer()),
            this.xash.init(),
        ]);

        this.logger.trace("mounting game filesystem");
        await this.mountArchive(archive);
        this.mountExtras(config, extras);

        this.fadeOutLogo();

        const username = await this.username;
        this.start(config, username);
    }

    // ============================================
    // Preferences / UI
    // ============================================

    private restorePreferences(): void {
        const storedTouch = this.storage.touchControls;
        if (storedTouch === null) {
            const isMobile = !window.matchMedia("(hover: hover)").matches;
            this.el.touchControls.checked = isMobile;
            this.storage.touchControls = isMobile;
        } else {
            this.el.touchControls.checked = storedTouch;
        }

        const storedUsername = this.storage.username;
        if (storedUsername) {
            this.el.username.value = storedUsername;
        }

        this.logger.trace(
            {touchControls: this.el.touchControls.checked, hasUsername: !!storedUsername},
            "restored preferences",
        );
    }

    private setupFormHandler(): void {
        this.el.touchControls.addEventListener("change", () => {
            this.storage.touchControls = this.el.touchControls.checked;
        });

        this.el.form.addEventListener("submit", (event) => {
            event.preventDefault();

            const username = this.el.username.value;
            this.storage.username = username;
            this.el.form.style.display = "none";
            this.el.social.style.display = "none";

            this.logger.debug({username}, "player joined");
            this.resolveUsername(username);
        });

        this.logger.trace(
            {form: this.el.form},
            "form setup",
        );
    }

    private setWarningVisible(visible: boolean): void {
        this.el.warning.style.opacity = visible ? "1" : "0";
    }

    private fadeOutLogo(): void {
        const {style} = this.el.logo;
        style.animationName = "pulsate-end";
        style.animationFillMode = "forwards";
        style.animationIterationCount = "1";
        style.animationDirection = "normal";
    }

    // ============================================
    // Engine
    // ============================================

    private createEngine(config: ClientConfig): Xash3DWebRTC {
        return new Xash3DWebRTC({
            socket: this.socket,
            logger: this.logger.child({scope: "webrtc"}),
            serverAddress: SERVER_ADDRESS,
            canvas: this.el.canvas,
            arguments: config.arguments.length ? config.arguments : ["-windowed"],
            libraries: {
                filesystem: config.libraries.filesystem,
                xash: xashURL,
                menu: config.libraries.menu,
                server: config.libraries.server,
                client: config.libraries.client,
                render: {
                    gl4es: gl4esURL,
                },
            },
            dynamicLibraries: config.dynamic_libraries,
            filesMap: config.files_map,
        });
    }

    private start(config: ClientConfig, username: string): void {
        this.xash.main();

        if (this.el.touchControls.checked) {
            this.xash.Cmd_ExecuteString("touch_enable 1");
        }
        this.xash.Cmd_ExecuteString(`name "${username}"`);

        config.console?.forEach((command) => {
            this.logger.trace({command}, "executing console command");
            this.xash.Cmd_ExecuteString(command);
        });

        // Also re-issued automatically whenever the transport is rebuilt.
        this.xash.connectToServer();

        window.addEventListener("beforeunload", (event) => {
            event.preventDefault();
            event.returnValue = "";
            return "";
        });
    }

    // ============================================
    // Assets
    // ============================================

    private async fetchArchive(): Promise<ArrayBuffer> {
        this.logger.trace({archive: GAME_ARCHIVE}, "downloading game assets");

        const {progress} = this.el;
        const response = await fetch(GAME_ARCHIVE);

        const contentLength = response.headers.get("Content-Length");
        const total = contentLength ? Number.parseInt(contentLength, 10) : null;

        const reader = response.body!.getReader();
        const chunks: Uint8Array[] = [];
        let received = 0;

        for (;;) {
            const {done, value} = await reader.read();
            if (done) break;

            chunks.push(value);
            received += value.length;
            progress.value = total !== null ? received / total : received;
        }

        progress.style.opacity = "0";
        this.logger.debug({bytes: received, total}, "game archive downloaded");

        return new Blob(chunks as BlobPart[]).arrayBuffer();
    }

    private async mountArchive(
        archive: Awaited<ReturnType<typeof loadAsync>>,
    ): Promise<void> {
        await Promise.all(
            Object.entries(archive.files).map(async ([filename, file]) => {
                if (file.dir) return;

                const path = `/rodir/${filename}`;
                const dir = path.split("/").slice(0, -1).join("/");

                this.xash.em.FS.mkdirTree(dir);
                this.xash.em.FS.writeFile(path, await file.async("uint8array"));
            }),
        );
    }

    private mountExtras(config: ClientConfig, extras: ArrayBuffer): void {
        this.xash.em.FS.writeFile(
            `/rodir/${config.game_dir}/extras.pk3`,
            new Uint8Array(extras),
        );
        this.xash.em.FS.chdir("/rodir");
    }
}
