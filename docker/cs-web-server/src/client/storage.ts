import {Storage} from "./core";

const KEYS = {
    USERNAME: "username",
    TOUCH_CONTROLS: "touchControls",
} as const;

/** Game client preferences. */
export class GameStorage extends Storage {
    get username(): string | null {
        return this.get(KEYS.USERNAME);
    }

    set username(value: string) {
        this.set(KEYS.USERNAME, value);
    }

    get touchControls(): boolean | null {
        return this.getBoolean(KEYS.TOUCH_CONTROLS);
    }

    set touchControls(value: boolean) {
        this.setBoolean(KEYS.TOUCH_CONTROLS, value);
    }
}
