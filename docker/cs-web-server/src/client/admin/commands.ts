import type {Logger} from "../core";
import type {AdminApiClient} from "./api";
import type {AdminDom} from "./dom";
import type {I18n} from "./i18n";
import type {DOMElements, TokenData} from "./types";
import type {UIManager} from "./ui";
import type {AdminLogSocket} from "./websocket";
import {getInputValue} from "./utils";

/** How long to wait for cvar values to come back over the log stream. */
const SETTINGS_TIMEOUT = 2000;
/** Grace period after the RCON call before finalising the settings form. */
const SETTINGS_SETTLE_DELAY = 500;
const LOGOUT_DELAY = 1000;

export interface CommandServiceOptions {
    dom: AdminDom;
    ui: UIManager;
    socket: AdminLogSocket;
    api: AdminApiClient;
    i18n: I18n;
    logger: Logger;
}

/**
 * RCON command execution and the game settings form.
 *
 * Settings are read by issuing the cvar names as commands and picking the
 * answers out of the log stream, so this service and {@link AdminLogSocket}
 * cooperate through an explicit callback rather than shared state.
 */
export class CommandService {
    private readonly dom: AdminDom;
    private readonly ui: UIManager;
    private readonly socket: AdminLogSocket;
    private readonly api: AdminApiClient;
    private readonly i18n: I18n;
    private readonly logger: Logger;

    private tokenData: TokenData | null = null;
    private onLogout: (() => void) | null = null;
    private readonly originalSettings = new Map<string, string>();
    private readonly receivedSettings = new Set<string>();
    private settingsTimeout: ReturnType<typeof setTimeout> | null = null;
    private allSettingNames: string[] = [];

    constructor(options: CommandServiceOptions) {
        this.dom = options.dom;
        this.ui = options.ui;
        this.socket = options.socket;
        this.api = options.api;
        this.i18n = options.i18n;
        this.logger = options.logger;
    }

    private get el(): DOMElements {
        return this.dom.elements;
    }

    initialize(tokenData: TokenData, onLogout: () => void): void {
        this.tokenData = tokenData;
        this.onLogout = onLogout;
        this.api.authToken = tokenData.token;

        this.socket.setSettingReceivedCallback((settingName) => {
            this.receivedSettings.add(settingName);
        });
    }

    // ============================================
    // Commands
    // ============================================

    async sendCommand(command: string): Promise<void> {
        if (!this.tokenData) {
            this.ui.addLog("System", this.i18n.t("errors.notAuthenticated"));
            return;
        }

        this.ui.addLog("System", `> ${command}`);

        const response = await this.api.sendCommand(command);

        switch (response.status) {
            case 401:
                this.ui.addLog("System", this.i18n.t("errors.authFailed"));
                setTimeout(() => this.onLogout?.(), LOGOUT_DELAY);
                return;
            case 403:
                this.ui.addLog("System", this.i18n.t("errors.insufficientPermissions"));
                return;
            case 429:
                this.ui.addLog("System", this.i18n.t("errors.rateLimitExceeded"));
                return;
        }

        if (!response.ok) {
            this.ui.addLog(
                "System",
                this.i18n.t("errors.commandFailed", {status: response.status}),
            );
        }

        // On success the server replies 204; output arrives over the log socket.
    }

    // ============================================
    // Settings
    // ============================================

    async fetchGameSettings(): Promise<void> {
        const inputs = this.el.gameSettingsForm.querySelectorAll("input, select");

        this.ui.showSettingsLoading();
        this.ui.showAllSettingRows();
        this.receivedSettings.clear();
        this.originalSettings.clear();

        this.allSettingNames = Array.from(inputs)
            .map((input) => (input as HTMLInputElement | HTMLSelectElement).name)
            .filter(Boolean);

        this.clearSettingsTimeout();
        this.settingsTimeout = setTimeout(
            () => this.handleSettingsTimeout(),
            SETTINGS_TIMEOUT,
        );

        const response = await this.api.sendCommand(this.allSettingNames);

        if (response.status !== 204) {
            this.logger.warn({status: response.status}, "failed to request settings");
            this.ui.addLog("System", this.i18n.t("errors.failedToGetSettings"));
            this.clearSettingsTimeout();
            this.ui.showSettingsRefreshButton();
            return;
        }

        setTimeout(() => this.finalizeSettingsFetch(), SETTINGS_SETTLE_DELAY);
    }

    async applyGameSettings(): Promise<void> {
        const inputs = this.el.gameSettingsForm.querySelectorAll("input, select");
        let changedCount = 0;

        for (const input of inputs) {
            const element = input as HTMLInputElement | HTMLSelectElement;
            if (!element.name) continue;

            const value = getInputValue(element);
            const originalValue = this.originalSettings.get(element.name);

            // Only send values we actually read back and that the user changed.
            if (originalValue !== undefined && originalValue !== value) {
                await this.sendCommand(`${element.name} "${value.replace(/"/g, " ")}"`);
                changedCount++;
            }
        }

        this.ui.addLog(
            "System",
            changedCount === 0
                ? this.i18n.t("settings.noChanges")
                : this.i18n.t("settings.applied", {count: changedCount}),
        );
    }

    private handleSettingsTimeout(): void {
        if (this.receivedSettings.size === 0) {
            this.ui.addLog("System", this.i18n.t("errors.settingsTimeout"));
            this.ui.showSettingsRefreshButton();
            return;
        }
        this.finalizeSettingsFetch();
    }

    private finalizeSettingsFetch(): void {
        this.clearSettingsTimeout();

        if (this.receivedSettings.size === 0) {
            this.ui.showSettingsRefreshButton();
            return;
        }

        // Hide cvars this build did not answer for.
        for (const fieldName of this.allSettingNames) {
            if (!this.receivedSettings.has(fieldName)) {
                this.ui.hideSettingRow(fieldName);
            }
        }

        for (const fieldName of this.receivedSettings) {
            const input = document.querySelector<HTMLInputElement | HTMLSelectElement>(
                `#game-settings [name="${fieldName}"]`,
            );
            if (input) {
                this.originalSettings.set(fieldName, getInputValue(input));
            }
        }

        this.ui.showSettingsForm();
        this.ui.addLog(
            "System",
            this.i18n.t("settings.loaded", {count: this.receivedSettings.size}),
        );
    }

    private clearSettingsTimeout(): void {
        if (!this.settingsTimeout) return;
        clearTimeout(this.settingsTimeout);
        this.settingsTimeout = null;
    }

    // ============================================
    // Handlers
    // ============================================

    setupCommandHandler(): void {
        this.el.commandForm.addEventListener("submit", async (event) => {
            event.preventDefault();

            const command = this.el.commandInput.value.trim();
            if (!command) return;

            await this.sendCommand(command);
            this.el.commandInput.value = "";
        });
    }

    setupQuickCommands(): void {
        document.querySelectorAll<HTMLElement>(".quick-cmd").forEach((button) => {
            button.addEventListener("click", () => {
                const command = button.dataset.cmd;
                if (command) void this.sendCommand(command);
            });
        });
    }

    setupGameSettingsHandler(): void {
        this.el.gameSettingsCurrent.addEventListener("click", () => {
            void this.fetchGameSettings();
        });

        this.el.settingsRefreshBtn.addEventListener("click", () => {
            window.location.reload();
        });

        this.el.gameSettingsApply.addEventListener("click", () => {
            void this.applyGameSettings();
        });
    }

    setupChangelevelHandler(): void {
        this.el.changelevelBtn.addEventListener("click", () => {
            const selectedMap = this.el.mapsSelect.value;
            if (selectedMap) void this.sendCommand(`changelevel ${selectedMap}`);
        });

        this.el.mapsSelect.addEventListener("change", () => {
            this.el.changelevelBtn.disabled = !this.el.mapsSelect.value;
        });
    }
}
