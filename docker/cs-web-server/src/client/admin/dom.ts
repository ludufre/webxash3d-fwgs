import type {DOMElements} from "./types";

/**
 * Resolves and caches every admin panel element.
 *
 * Constructed by `AdminApp` and injected — there is no module-level instance,
 * so a test (or a second panel) can supply its own.
 */
export class AdminDom {
    private cache: DOMElements | null = null;

    get elements(): DOMElements {
        if (!this.cache) {
            this.cache = this.resolve();
        }
        return this.cache;
    }

    /** Drops cached references (useful after a DOM swap, or in tests). */
    reset(): void {
        this.cache = null;
    }

    private resolve(): DOMElements {
        return {
            // Containers
            authContainer: this.require("auth-container"),
            adminContainer: this.require("admin-container"),
            logsContainer: this.require("logs-container"),

            // Auth elements
            authForm: this.require<HTMLFormElement>("auth-form"),
            authError: this.require("auth-error"),
            usernameInput: this.require<HTMLInputElement>("username"),
            passwordInput: this.require<HTMLInputElement>("password"),
            loginBtn: this.require<HTMLButtonElement>("login-btn"),

            // Admin elements
            disconnectBtn: this.require("disconnect-btn"),
            commandForm: this.require<HTMLFormElement>("command-form"),
            commandInput: this.require<HTMLInputElement>("command-input"),

            // Status elements
            connectionStatus: this.require("connection-status"),
            connectionText: this.require("connection-text"),
            tokenExpiry: this.require("token-expiry"),
            usernameDisplay: this.require("username-display"),

            // Settings form
            gameSettingsForm: this.require<HTMLFormElement>("game-settings"),
            gameSettingsCurrent: this.require<HTMLButtonElement>("game-settings-current"),
            gameSettingsApply: this.require<HTMLButtonElement>("game-settings-apply"),

            // Maps elements
            mapsSelect: this.require<HTMLSelectElement>("maps-select"),
            changelevelBtn: this.require<HTMLButtonElement>("changelevel-btn"),

            // Settings status elements
            settingsStatus: this.require("settings-status"),
            settingsStatusText: this.require("settings-status-text"),
            settingsRefreshBtn: this.require<HTMLButtonElement>("settings-refresh-btn"),

            // Language selectors
            languageSelectors: [
                document.getElementById("language-selector-auth"),
                document.getElementById("language-selector-admin"),
            ].filter((el): el is HTMLSelectElement => el instanceof HTMLSelectElement),
        };
    }

    private require<T extends HTMLElement = HTMLElement>(id: string): T {
        const element = document.getElementById(id);
        if (!element) {
            throw new Error(`Missing required element #${id}`);
        }
        return element as T;
    }
}
