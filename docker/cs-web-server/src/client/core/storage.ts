/**
 * Namespaced wrapper over a Web Storage area.
 *
 * Instance-based on purpose: subclasses (`GameStorage`, `AdminStorage`) are
 * constructed by the owning app and injected, so nothing reaches for a global.
 */
export class Storage {
    protected readonly prefix: string;
    protected readonly backend: globalThis.Storage;

    constructor(prefix = "", backend: globalThis.Storage = window.localStorage) {
        this.prefix = prefix;
        this.backend = backend;
    }

    get(key: string): string | null {
        return this.backend.getItem(this.key(key));
    }

    set(key: string, value: string): void {
        this.backend.setItem(this.key(key), value);
    }

    remove(key: string): void {
        this.backend.removeItem(this.key(key));
    }

    getNumber(key: string): number | null {
        const raw = this.get(key);
        if (raw === null) return null;
        const value = Number.parseInt(raw, 10);
        return Number.isNaN(value) ? null : value;
    }

    getBoolean(key: string): boolean | null {
        const raw = this.get(key);
        if (raw === null) return null;
        return raw === "true";
    }

    setBoolean(key: string, value: boolean): void {
        this.set(key, String(value));
    }

    protected key(key: string): string {
        return this.prefix ? `${this.prefix}${key}` : key;
    }
}
