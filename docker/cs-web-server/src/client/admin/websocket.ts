import {type Logger, WebSocketClient} from "../core";
import type {AdminDom} from "./dom";
import type {I18n} from "./i18n";
import type {DOMElements, LogEntry, TokenData, WebSocketMessage} from "./types";
import type {UIManager} from "./ui";
import {stripAnsiCodes} from "./utils";

const EVENT_VERSION = "v1";

const EVENTS = {
    AUTH: `${EVENT_VERSION}:auth`,
    ERROR: `${EVENT_VERSION}:error`,
    HISTORY: `${EVENT_VERSION}:history`,
    LOG: `${EVENT_VERSION}:log`,
} as const;

const LOGS_PATH = "/websocket/logs";
const AUTH_FAILURE_CODES = [1008, 4401];
const LOGOUT_DELAY = 2000;

export interface AdminLogSocketOptions {
    logger: Logger;
    dom: AdminDom;
    ui: UIManager;
    i18n: I18n;
    /** Overrides the default `/websocket/logs` path. */
    url?: string;
}

/**
 * Authenticated log stream for the admin panel.
 *
 * Extends the shared {@link WebSocketClient}: connection lifecycle, reconnect
 * and send live in the base class, this subclass only adds the auth handshake
 * and the log/settings/map message handling.
 */
export class AdminLogSocket extends WebSocketClient {
    private readonly dom: AdminDom;
    private readonly ui: UIManager;
    private readonly i18n: I18n;

    private tokenData: TokenData | null = null;
    private onLogout: (() => void) | null = null;
    private onSettingReceived: ((settingName: string) => void) | null = null;

    constructor(options: AdminLogSocketOptions) {
        super({
            url: options.url ?? LOGS_PATH,
            logger: options.logger,
            autoReconnect: true,
            reconnectDelay: 3000,
        });

        this.dom = options.dom;
        this.ui = options.ui;
        this.i18n = options.i18n;
    }

    private get el(): DOMElements {
        return this.dom.elements;
    }

    setSettingReceivedCallback(callback: (settingName: string) => void): void {
        this.onSettingReceived = callback;
    }

    /** Authenticates with `tokenData` and opens the stream. */
    authenticate(tokenData: TokenData, onLogout: () => void): void {
        this.tokenData = tokenData;
        this.onLogout = onLogout;

        this.ui.updateConnectionStatus("connecting", this.i18n.t("status.connecting"));
        this.connect();
    }

    override disconnect(): void {
        super.disconnect();
        this.tokenData = null;
        this.onLogout = null;
    }

    // ============================================
    // Socket lifecycle
    // ============================================

    protected override handleOpen(event: Event): void {
        super.handleOpen(event);

        if (!this.tokenData) {
            this.ui.addLog("System", this.i18n.t("errors.noToken"));
            return;
        }

        this.sendEvent(EVENTS.AUTH, this.tokenData.token);
    }

    protected override handleMessage(event: MessageEvent): void {
        super.handleMessage(event);

        let data: WebSocketMessage, incomingEvent: string;
        try {
            [incomingEvent, data] = JSON.parse(event.data);
        } catch (error) {
            this.logger.error(error, "failed to parse message");
            return;
        }

        switch (incomingEvent) {
            case EVENTS.AUTH:
                if (data !== "ok") return;
                this.logger.info({username: this.tokenData?.username}, "authenticated");
                this.ui.updateConnectionStatus(
                    "connected",
                    this.i18n.t("status.connected"),
                );
                this.ui.addLog("System", this.i18n.t("logs.connectedToServer"));
                return;

            case EVENTS.ERROR:
                this.logger.error(data, "server reported error");
                this.ui.addLog("System", `ERROR: ${data}`);
                return;

            case EVENTS.HISTORY:
                const logs = data as LogEntry[]
                this.ui.clearLogs();
                this.ui.addLog(
                    "System",
                    this.i18n.t("logs.historyLoaded", {count: logs.length ?? 0}),
                );
                logs.forEach((log) => this.ui.addLog(log.timestamp, log.message));
                return;

            case EVENTS.LOG:
                const log = data as LogEntry;
                if (!log.timestamp || !log.message) return;
                this.ui.addLog(log.timestamp, log.message);
                this.updateSettingFromMessage(stripAnsiCodes(log.message));
                this.processMapList(log.message);
                return;
        }
    }

    protected override handleError(event: Event): void {
        super.handleError(event);
        this.ui.updateConnectionStatus("disconnected", this.i18n.t("status.error"));
    }

    protected override handleClose(event: CloseEvent): void {
        this.ui.updateConnectionStatus("disconnected", this.i18n.t("status.disconnected"));

        if (AUTH_FAILURE_CODES.includes(event.code)) {
            // Auth failure: log out instead of reconnecting in a loop.
            this.ui.addLog("System", this.i18n.t("errors.authFailed"));
            const onLogout = this.onLogout;
            this.disconnect();
            setTimeout(() => onLogout?.(), LOGOUT_DELAY);
            return;
        }

        this.ui.addLog("System", this.i18n.t("logs.disconnected"));
        if (this.tokenData) {
            this.ui.addLog("System", this.i18n.t("logs.reconnecting"));
        }

        super.handleClose(event);
    }

    // ============================================
    // Message parsing
    // ============================================

    /** Mirrors a `"cvar" is "value"` console line back into the settings form. */
    private updateSettingFromMessage(message: string): void {
        const match = message.match(/.+"([A-Za-z_]+)" is "(.+?|)"( \( "(.+|)" \)|)$/);
        if (!match || match.length < 3) return;

        const [, settingName, currentValue] = match;

        const input = document.querySelector<HTMLInputElement | HTMLSelectElement>(
            `#game-settings input[name="${settingName}"], #game-settings select[name="${settingName}"]`,
        );
        if (!input) return;

        if (input instanceof HTMLInputElement && input.type === "checkbox") {
            input.checked = currentValue === "1";
        } else {
            input.value = currentValue;
        }

        this.onSettingReceived?.(settingName);
        this.logger.debug({setting: settingName, value: currentValue}, "updated setting");
    }

    /** Collects map names printed by `maps *` out of the rendered log. */
    private processMapList(message: string): void {
        const match = message.match(/Directory: ".+\/maps" - Maps listed: ([\d]{1,})$/);
        if (!match) return;

        const mapCount = Number.parseInt(match[1], 10);
        this.logger.debug({count: mapCount}, "maps listed");

        const logEntries = this.el.logsContainer.querySelectorAll(".log-entry");
        const totalLogs = logEntries.length;

        const startIndex = Math.max(0, totalLogs - mapCount - 2);
        const endIndex = totalLogs - 1;

        const maps: string[] = [];
        for (let i = startIndex; i < endIndex; i++) {
            const logMessage =
                logEntries[i].querySelector(".log-message")?.textContent ?? "";
            const mapMatch = logMessage.match(/(.+)\s+\(Half-Life\)/);

            // Ignore Half-Life single player maps like c1a1, t0a5b, etc.
            if (mapMatch?.[1] && !/^\b[ct]\d+a\d+(?:[a-z]\d*)?\b$/.test(mapMatch[1])) {
                maps.push(mapMatch[1]);
            }
        }

        this.logger.debug({maps}, "detected maps");
        this.ui.updateMapsList(maps);
    }
}
