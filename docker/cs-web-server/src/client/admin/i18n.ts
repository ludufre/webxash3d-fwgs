import type {Logger} from "../core";
import type {AdminStorage} from "./storage";

// ============================================
// Types
// ============================================

type TranslationValue = string | TranslationObject;

interface TranslationObject {
    [key: string]: TranslationValue;
}

export type Locale = "en" | "pt-BR" | "ru";

export interface I18nOptions {
    storage: AdminStorage;
    logger: Logger;
    defaultLocale?: Locale;
    fallbackLocale?: Locale;
}

/**
 * Translation catalogue and DOM binder.
 *
 * Takes its storage and logger by injection; `AdminApp` owns the instance.
 */
export class I18n {
    readonly availableLocales: readonly Locale[] = ["en", "pt-BR", "ru"];

    readonly localeNames: Record<Locale, string> = {
        en: "English",
        "pt-BR": "Português (Brasil)",
        ru: "Русский",
    };

    private readonly storage: AdminStorage;
    private readonly logger: Logger;
    private readonly defaultLocale?: Locale;
    private readonly fallbackLocale: Locale;

    private readonly translations = new Map<Locale, TranslationObject>();
    private currentLocale: Locale = "en";
    private ready = false;

    constructor(options: I18nOptions) {
        this.storage = options.storage;
        this.logger = options.logger;
        this.defaultLocale = options.defaultLocale;
        this.fallbackLocale = options.fallbackLocale ?? "en";
    }

    get locale(): Locale {
        return this.currentLocale;
    }

    get initialized(): boolean {
        return this.ready;
    }

    /** Loads the fallback and the active locale, then paints the DOM. */
    async init(): Promise<void> {
        if (this.ready) return;

        const initialLocale: Locale =
            this.storage.getLocale() ??
            this.defaultLocale ??
            this.detectBrowserLocale() ??
            this.fallbackLocale;

        await this.loadLocale(this.fallbackLocale);
        if (initialLocale !== this.fallbackLocale) {
            await this.loadLocale(initialLocale);
        }

        this.currentLocale = initialLocale;
        this.ready = true;

        this.logger.info({locale: this.currentLocale, fallback: this.fallbackLocale}, "initialized");
        this.updateDOM();
    }

    async setLocale(locale: Locale): Promise<void> {
        if (!this.availableLocales.includes(locale)) {
            this.logger.warn({locale}, "invalid locale, ignoring");
            return;
        }

        await this.loadLocale(locale);
        this.currentLocale = locale;
        this.storage.setLocale(locale);

        this.updateDOM();
        this.logger.info({locale}, "locale changed");
    }

    /**
     * Translates a dot-separated key, interpolating `{name}` placeholders.
     */
    t(key: string, params?: Record<string, string | number>): string {
        const value = this.getValue(key, this.currentLocale);
        if (value !== null) {
            return this.interpolate(value, params);
        }

        const fallbackValue = this.getValue(key, this.fallbackLocale);
        if (fallbackValue === null) {
            this.logger.warn({key, locale: this.currentLocale}, "missing translation");
            return key;
        }

        return this.interpolate(fallbackValue, params);
    }

    /** Applies translations to every `data-i18n*` element. */
    updateDOM(): void {
        document.querySelectorAll("[data-i18n]").forEach((el) => {
            const key = el.getAttribute("data-i18n");
            if (key) el.textContent = this.t(key);
        });

        document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
            const key = el.getAttribute("data-i18n-placeholder");
            if (key && el instanceof HTMLInputElement) el.placeholder = this.t(key);
        });

        document.querySelectorAll("[data-i18n-title]").forEach((el) => {
            const key = el.getAttribute("data-i18n-title");
            if (key && el instanceof HTMLElement) el.title = this.t(key);
        });

        document.title = this.t("app.title");
        document.documentElement.lang = this.currentLocale;
    }

    private detectBrowserLocale(): Locale | null {
        const browserLang = navigator.language || navigator.languages?.[0];
        if (!browserLang) return null;

        if (this.availableLocales.includes(browserLang as Locale)) {
            return browserLang as Locale;
        }

        const langCode = browserLang.split("-")[0];
        return this.availableLocales.find((l) => l.startsWith(langCode)) ?? null;
    }

    private async loadLocale(locale: Locale): Promise<void> {
        if (this.translations.has(locale)) return;

        try {
            const response = await fetch(`/admin/locales/${locale}.json`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            this.translations.set(locale, await response.json());
            this.logger.debug({locale}, "loaded locale");
        } catch (error) {
            this.logger.error({locale, err: error}, "failed to load locale");
        }
    }

    private getValue(key: string, locale: Locale): string | null {
        const translations = this.translations.get(locale);
        if (!translations) return null;

        let current: TranslationValue | undefined = translations;
        for (const part of key.split(".")) {
            if (typeof current !== "object" || current === null) return null;
            current = current[part];
            if (current === undefined) return null;
        }

        return typeof current === "string" ? current : null;
    }

    private interpolate(
        text: string,
        params?: Record<string, string | number>,
    ): string {
        if (!params) return text;
        return text.replace(/\{(\w+)\}/g, (_, key) => params[key]?.toString() ?? `{${key}}`);
    }
}
