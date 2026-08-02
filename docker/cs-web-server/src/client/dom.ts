export interface GameElements {
    canvas: HTMLCanvasElement;
    form: HTMLFormElement;
    username: HTMLInputElement;
    touchControls: HTMLInputElement;
    progress: HTMLProgressElement;
    logo: HTMLElement;
    social: HTMLElement;
    warning: HTMLElement;
}

/**
 * Owns every DOM lookup for the game client so no other class touches
 * `document` directly. Elements are resolved lazily on first access.
 */
export class GameDom {
    private cache: GameElements | null = null;

    get elements(): GameElements {
        if (!this.cache) {
            this.cache = {
                canvas: this.require<HTMLCanvasElement>("canvas"),
                form: this.require<HTMLFormElement>("form"),
                username: this.require<HTMLInputElement>("username"),
                touchControls: this.require<HTMLInputElement>("touchControls"),
                progress: this.require<HTMLProgressElement>("progress"),
                logo: this.require<HTMLElement>("logo"),
                social: this.require<HTMLElement>("social"),
                warning: this.require<HTMLElement>("warning"),
            };
        }
        return this.cache;
    }

    reset(): void {
        this.cache = null;
    }

    private require<T extends HTMLElement>(id: string): T {
        const element = document.getElementById(id);
        if (!element) {
            throw new Error(`Missing required element #${id}`);
        }
        return element as T;
    }
}
