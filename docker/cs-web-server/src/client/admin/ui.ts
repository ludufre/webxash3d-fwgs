import type {AdminDom} from "./dom";
import type {I18n, Locale} from "./i18n";
import type {ConnectionStatus, DOMElements, TokenData} from "./types";
import {escapeHtml, extractTimestamp, stripAnsiCodes} from "./utils";

const TOKEN_WARNING_THRESHOLD = 5 * 60 * 1000;
const AUTO_SCROLL_THRESHOLD = 10;

export interface UIManagerOptions {
    dom: AdminDom;
    i18n: I18n;
}

/**
 * All admin panel rendering. Holds no state beyond the auto-scroll flag and
 * receives its DOM and translations by injection.
 */
export class UIManager {
    private readonly dom: AdminDom;
    private readonly i18n: I18n;
    private isAutoScroll = true;

    constructor(options: UIManagerOptions) {
        this.dom = options.dom;
        this.i18n = options.i18n;
    }

    private get el(): DOMElements {
        return this.dom.elements;
    }

    // ============================================
    // Authentication UI
    // ============================================

    showAuthError(message: string): void {
        this.el.authError.textContent = message;
    }

    clearAuthError(): void {
        this.el.authError.textContent = "";
    }

    showAdminPanel(): void {
        this.el.authContainer.style.display = "none";
        this.el.adminContainer.style.display = "block";
    }

    showAuthPanel(): void {
        this.el.authContainer.style.display = "flex";
        this.el.adminContainer.style.display = "none";
    }

    clearAuthForm(): void {
        this.el.usernameInput.value = "";
        this.el.passwordInput.value = "";
    }

    setLoginButtonState(loading: boolean): void {
        this.el.loginBtn.disabled = loading;
        this.el.loginBtn.textContent = loading
            ? this.i18n.t("auth.loggingIn")
            : this.i18n.t("auth.login");
    }

    // ============================================
    // Session display
    // ============================================

    updateUsernameDisplay(username: string): void {
        this.el.usernameDisplay.textContent = this.i18n.t("session.loggedInAs", {
            username,
        });
    }

    updateTokenExpiry(tokenData: TokenData | null): void {
        if (!tokenData) return;

        const remaining = tokenData.expiresAt - Date.now();
        const {tokenExpiry} = this.el;

        if (remaining <= 0) {
            tokenExpiry.textContent = this.i18n.t("session.tokenExpired");
            tokenExpiry.style.color = "var(--token-expiring)";
            return;
        }

        const hours = Math.floor(remaining / (1000 * 60 * 60));
        const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

        tokenExpiry.textContent = hours
            ? this.i18n.t("session.tokenExpiryHours", {hours, minutes})
            : this.i18n.t("session.tokenExpiry", {minutes});

        tokenExpiry.style.color =
            remaining < TOKEN_WARNING_THRESHOLD
                ? "var(--token-expiring)"
                : "var(--token-valid)";
    }

    updateConnectionStatus(status: ConnectionStatus, text: string): void {
        this.el.connectionStatus.className = "status-dot";
        this.el.connectionStatus.classList.add(status);
        this.el.connectionText.textContent = text;
    }

    // ============================================
    // Logs
    // ============================================

    addLog(timestamp: string, message: string): void {
        const entry = document.createElement("div");
        entry.className = "log-entry";

        let cleanMessage = stripAnsiCodes(message);
        const [extractedTime, extractedMessage] = extractTimestamp(cleanMessage);

        let time: string;
        if (extractedTime) {
            time = extractedTime;
            cleanMessage = extractedMessage;
        } else if (timestamp === "System") {
            time = `[${new Date().toLocaleTimeString()}]`;
        } else {
            time = `[${new Date(timestamp).toLocaleTimeString()}]`;
        }

        entry.innerHTML = `
      <span class="log-timestamp">${time}</span>
      <span class="log-message">${escapeHtml(cleanMessage)}</span>
    `;

        this.el.logsContainer.appendChild(entry);

        if (this.isAutoScroll) {
            this.el.logsContainer.scrollTop = this.el.logsContainer.scrollHeight;
        }
    }

    clearLogs(): void {
        this.el.logsContainer.innerHTML = "";
    }

    /** Disables auto-scroll as soon as the user scrolls away from the bottom. */
    setupAutoScroll(): void {
        this.el.logsContainer.addEventListener("scroll", () => {
            const {scrollTop, scrollHeight, clientHeight} = this.el.logsContainer;
            this.isAutoScroll =
                scrollTop + clientHeight >= scrollHeight - AUTO_SCROLL_THRESHOLD;
        });
    }

    // ============================================
    // Maps
    // ============================================

    updateMapsList(maps: string[]): void {
        const {mapsSelect, changelevelBtn} = this.el;

        if (maps.length === 0) {
            mapsSelect.innerHTML = `<option disabled>${this.i18n.t("maps.selectMapHint")}</option>`;
            mapsSelect.disabled = true;
            changelevelBtn.disabled = true;
            return;
        }

        mapsSelect.innerHTML = maps
            .map((map) => `<option value="${map}">${map}</option>`)
            .join("");
        mapsSelect.disabled = false;
        changelevelBtn.disabled = false;
    }

    // ============================================
    // Settings
    // ============================================

    showSettingsLoading(): void {
        this.el.settingsStatus.style.display = "flex";
        this.el.settingsStatusText.textContent = this.i18n.t("settings.fetchingSettings");
        this.el.settingsStatusText.style.display = "block";
        this.el.settingsRefreshBtn.style.display = "none";
        this.el.gameSettingsForm.style.display = "none";
    }

    showSettingsForm(): void {
        this.el.settingsStatus.style.display = "none";
        this.el.gameSettingsForm.style.display = "block";
    }

    showSettingsRefreshButton(): void {
        this.el.settingsStatusText.textContent = this.i18n.t("settings.loadFailed");
        this.el.settingsRefreshBtn.style.display = "block";
    }

    hideSettingRow(fieldName: string): void {
        const input = document.querySelector<HTMLInputElement | HTMLSelectElement>(
            `#game-settings [name="${fieldName}"]`,
        );
        input?.closest(".row")?.classList.add("hidden");
    }

    showAllSettingRows(): void {
        document
            .querySelectorAll("#game-settings .row")
            .forEach((row) => row.classList.remove("hidden"));
    }

    // ============================================
    // Language selector
    // ============================================

    setupLanguageSelector(): void {
        const selectors = this.el.languageSelectors;
        if (selectors.length === 0) return;

        const optionsHTML = this.i18n.availableLocales
            .map(
                (locale) =>
                    `<option value="${locale}"${locale === this.i18n.locale ? " selected" : ""}>${this.i18n.localeNames[locale]}</option>`,
            )
            .join("");

        selectors.forEach((selector) => {
            selector.innerHTML = optionsHTML;

            selector.addEventListener("change", async () => {
                await this.i18n.setLocale(selector.value as Locale);

                // Keep the auth and admin selectors in sync.
                selectors.forEach((other) => {
                    if (other !== selector) other.value = selector.value;
                });
            });
        });
    }
}
