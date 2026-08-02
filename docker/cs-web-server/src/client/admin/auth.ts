import type {Logger} from "../core";
import type {AdminApiClient} from "./api";
import type {AdminDom} from "./dom";
import type {I18n} from "./i18n";
import type {AdminStorage} from "./storage";
import type {DOMElements, TokenData} from "./types";
import type {UIManager} from "./ui";
import {decodeJWT, hashPassword} from "./utils";

const EXPIRY_CHECK_INTERVAL = 60 * 1000;

export interface AuthServiceOptions {
    dom: AdminDom;
    logger: Logger;
    api: AdminApiClient;
    storage: AdminStorage;
    ui: UIManager;
    i18n: I18n;
}

/**
 * Salt fetching, login/logout and token expiry tracking.
 *
 * Every collaborator arrives through the constructor; the service reaches for
 * no globals of its own.
 */
export class AuthService {
    private readonly dom: AdminDom;
    private readonly logger: Logger;
    private readonly api: AdminApiClient;
    private readonly storage: AdminStorage;
    private readonly ui: UIManager;
    private readonly i18n: I18n;

    private passwordSalt: string | null = null;
    private tokenExpiryTimer: ReturnType<typeof setInterval> | null = null;

    constructor(options: AuthServiceOptions) {
        this.dom = options.dom;
        this.logger = options.logger;
        this.api = options.api;
        this.storage = options.storage;
        this.ui = options.ui;
        this.i18n = options.i18n;
    }

    private get el(): DOMElements {
        return this.dom.elements;
    }

    // ============================================
    // Salt
    // ============================================

    async fetchSalt(): Promise<string> {
        const response = await this.api.fetchSalt();

        if (response.status === 503) {
            throw new Error(this.i18n.t("errors.adminDisabled"));
        }
        if (!response.ok || !response.data) {
            throw new Error(this.i18n.t("errors.failedToFetchSalt"));
        }

        return response.data.salt;
    }

    /** Warms the salt cache so the first login does not pay for two requests. */
    async prefetchSalt(): Promise<void> {
        try {
            this.passwordSalt = await this.fetchSalt();
        } catch (error) {
            this.logger.warn({err: error}, "failed to prefetch salt");
        }
    }

    // ============================================
    // Login / logout
    // ============================================

    async login(username: string, password: string): Promise<TokenData> {
        this.ui.setLoginButtonState(true);

        try {
            this.passwordSalt ??= await this.fetchSalt();

            const passwordHash = await hashPassword(password, this.passwordSalt);
            const response = await this.api.login({username, passwordHash});

            switch (response.status) {
                case 401:
                    throw new Error(this.i18n.t("errors.invalidCredentials"));
                case 429:
                    throw new Error(this.i18n.t("errors.tooManyAttempts"));
                case 503:
                    throw new Error(this.i18n.t("errors.adminDisabled"));
            }

            if (!response.ok || !response.data) {
                throw new Error(this.i18n.t("errors.loginFailed"));
            }

            const payload = decodeJWT(response.data.token);
            if (!payload?.username) {
                throw new Error(this.i18n.t("errors.invalidToken"));
            }

            const tokenData: TokenData = {
                token: response.data.token,
                expiresAt: Date.now() + response.data.expiresIn * 1000,
                username: payload.username,
            };

            this.storage.saveTokenData(tokenData);
            this.api.authToken = tokenData.token;

            this.logger.info({username: tokenData.username}, "login successful");

            this.ui.clearAuthError();
            this.ui.clearAuthForm();

            return tokenData;
        } finally {
            this.ui.setLoginButtonState(false);
        }
    }

    logout(onLogout: () => void): void {
        this.stopTokenExpiryCheck();

        this.storage.clearTokenData();
        this.api.authToken = null;
        this.ui.clearAuthForm();

        onLogout();
    }

    // ============================================
    // Session
    // ============================================

    /** Shows the panel for an active session and starts the expiry ticker. */
    initializeAdminPanel(tokenData: TokenData): void {
        this.ui.showAdminPanel();
        this.ui.updateUsernameDisplay(tokenData.username);
        this.ui.updateTokenExpiry(tokenData);
        this.startTokenExpiryCheck(tokenData);
    }

    private startTokenExpiryCheck(tokenData: TokenData): void {
        this.stopTokenExpiryCheck();

        this.tokenExpiryTimer = setInterval(() => {
            this.ui.updateTokenExpiry(tokenData);

            if (tokenData.expiresAt <= Date.now()) {
                this.stopTokenExpiryCheck();
            }
        }, EXPIRY_CHECK_INTERVAL);
    }

    private stopTokenExpiryCheck(): void {
        if (!this.tokenExpiryTimer) return;
        clearInterval(this.tokenExpiryTimer);
        this.tokenExpiryTimer = null;
    }

    // ============================================
    // Handlers
    // ============================================

    setupAuthHandler(onLogin: (tokenData: TokenData) => void): void {
        this.el.authForm.addEventListener("submit", async (event) => {
            event.preventDefault();

            const username = this.el.usernameInput.value.trim();
            const password = this.el.passwordInput.value.trim();

            if (!username) {
                this.ui.showAuthError(this.i18n.t("errors.usernameRequired"));
                return;
            }
            if (!password) {
                this.ui.showAuthError(this.i18n.t("errors.passwordRequired"));
                return;
            }

            try {
                const tokenData = await this.login(username, password);
                this.initializeAdminPanel(tokenData);
                onLogin(tokenData);
            } catch (error) {
                this.ui.showAuthError(
                    error instanceof Error
                        ? error.message
                        : this.i18n.t("errors.loginFailed"),
                );
            }
        });
    }

    setupDisconnectHandler(onDisconnect: () => void): void {
        this.el.disconnectBtn.addEventListener("click", () => {
            this.logout(onDisconnect);
        });
    }
}
