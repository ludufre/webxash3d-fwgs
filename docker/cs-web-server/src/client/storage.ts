import type { PlayerSettings } from "./types";

// ============================================
// Storage Manager Class
// ============================================

class StorageManager {
  private readonly KEYS = {
    USERNAME: "username",
    CROSSHAIR_SIZE: "crosshairSize",
    CROSSHAIR_COLOR: "crosshairColor",
    CROSSHAIR_TRANSLUCENT: "crosshairTranslucent",
    HUD_CENTER_ID: "hudCenterId",
    VOLUME: "volume",
    SENSITIVITY: "sensitivity",
    TOUCH_CONTROLS: "touchControls",
  } as const;

  /**
   * Saves player settings to localStorage
   */
  saveSettings(settings: PlayerSettings): void {
    localStorage.setItem(this.KEYS.USERNAME, settings.username);
    localStorage.setItem(this.KEYS.CROSSHAIR_SIZE, settings.crosshairSize);
    localStorage.setItem(this.KEYS.CROSSHAIR_COLOR, settings.crosshairColor);
    localStorage.setItem(
      this.KEYS.CROSSHAIR_TRANSLUCENT,
      String(settings.crosshairTranslucent)
    );
    localStorage.setItem(this.KEYS.HUD_CENTER_ID, String(settings.hudCenterId));
    localStorage.setItem(this.KEYS.VOLUME, settings.volume.toString());
    localStorage.setItem(this.KEYS.SENSITIVITY, settings.sensitivity.toString());
  }

  /**
   * Loads player settings from localStorage
   * Returns partial settings (only values that exist)
   */
  loadSettings(): Partial<PlayerSettings> {
    const settings: Partial<PlayerSettings> = {};

    const username = localStorage.getItem(this.KEYS.USERNAME);
    if (username) settings.username = username;

    const crosshairSize = localStorage.getItem(this.KEYS.CROSSHAIR_SIZE);
    if (crosshairSize) settings.crosshairSize = crosshairSize;

    const crosshairColor = localStorage.getItem(this.KEYS.CROSSHAIR_COLOR);
    if (crosshairColor) settings.crosshairColor = crosshairColor;

    const crosshairTranslucent = localStorage.getItem(this.KEYS.CROSSHAIR_TRANSLUCENT);
    if (crosshairTranslucent !== null) {
      settings.crosshairTranslucent = crosshairTranslucent === "true";
    }

    const hudCenterId = localStorage.getItem(this.KEYS.HUD_CENTER_ID);
    if (hudCenterId !== null) {
      settings.hudCenterId = hudCenterId === "true";
    }

    const volume = localStorage.getItem(this.KEYS.VOLUME);
    if (volume !== null) {
      settings.volume = Math.round(parseFloat(volume));
    }

    const sensitivity = localStorage.getItem(this.KEYS.SENSITIVITY);
    if (sensitivity !== null) {
      settings.sensitivity = Number(sensitivity);
    }

    return settings;
  }

  /**
   * Gets touch controls enabled state
   */
  getTouchControls(): boolean | null {
    const value = localStorage.getItem(this.KEYS.TOUCH_CONTROLS);
    if (value === null) return null;
    return value === "true";
  }

  /**
   * Sets touch controls enabled state
   */
  setTouchControls(enabled: boolean): void {
    localStorage.setItem(this.KEYS.TOUCH_CONTROLS, String(enabled));
  }
}

// Export singleton instance
export const storageManager = new StorageManager();
