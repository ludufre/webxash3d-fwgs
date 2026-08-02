import {Storage} from "../core";
import type {Locale} from "./i18n";
import type {TokenData} from "./types";

const KEYS = {
    TOKEN: "adminToken",
    EXPIRY: "adminTokenExpiry",
    USERNAME: "adminUsername",
    LOCALE: "adminLocale",
} as const;

/**
 * Admin panel persistence. Instance-based (no statics) so `AdminApp` owns it
 * and can hand a different backend to tests.
 */
export class AdminStorage extends Storage {
    saveTokenData(tokenData: TokenData): void {
        this.set(KEYS.TOKEN, tokenData.token);
        this.set(KEYS.EXPIRY, String(tokenData.expiresAt));
        this.set(KEYS.USERNAME, tokenData.username);
    }

    /** Returns the stored session, or `null` when missing or expired. */
    loadTokenData(): TokenData | null {
        const token = this.get(KEYS.TOKEN);
        const expiresAt = this.getNumber(KEYS.EXPIRY);
        const username = this.get(KEYS.USERNAME);

        if (!token || expiresAt === null || !username) {
            return null;
        }

        if (expiresAt <= Date.now()) {
            this.clearTokenData();
            return null;
        }

        return {token, expiresAt, username};
    }

    clearTokenData(): void {
        this.remove(KEYS.TOKEN);
        this.remove(KEYS.EXPIRY);
        this.remove(KEYS.USERNAME);
    }

    getLocale(): Locale | null {
        return this.get(KEYS.LOCALE) as Locale | null;
    }

    setLocale(locale: Locale): void {
        this.set(KEYS.LOCALE, locale);
    }
}
