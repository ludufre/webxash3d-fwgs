import { domManager } from "./dom";
import { storageManager } from "./storage";
import type { PlayerSettings } from "./types";

// ============================================
// Settings Management
// ============================================

/**
 * Loads saved settings from localStorage and populates form fields
 */
export function loadSettingsFromLocalStorage(): void {
  const elements = domManager.elements;
  const settings = storageManager.loadSettings();

  if (settings.username) {
    elements.username.value = settings.username;
  }

  if (settings.crosshairSize) {
    elements.crosshairSize.value = settings.crosshairSize;
  }

  if (settings.crosshairColor) {
    elements.crosshairColor.value = settings.crosshairColor;
  }

  if (settings.crosshairTranslucent !== undefined) {
    elements.crosshairTranslucent.checked = settings.crosshairTranslucent;
  }

  if (settings.hudCenterId !== undefined) {
    elements.hudCenterId.checked = settings.hudCenterId;
  }

  if (settings.volume !== undefined) {
    elements.volume.value = settings.volume.toString();
    elements.volumeValue.textContent = settings.volume.toString();
  }

  if (settings.sensitivity !== undefined) {
    elements.sensitivity.value = settings.sensitivity.toString();
    elements.sensitivityValue.textContent = settings.sensitivity.toString();
  }
}

/**
 * Saves settings to localStorage
 */
export function saveSettingsToLocalStorage(settings: PlayerSettings): void {
  storageManager.saveSettings(settings);
}

/**
 * Retrieves current settings from form inputs
 */
export function getSettingsFromForm(): PlayerSettings {
  const elements = domManager.elements;

  return {
    username: elements.username.value,
    crosshairSize: elements.crosshairSize.value,
    crosshairColor: elements.crosshairColor.value,
    crosshairTranslucent: elements.crosshairTranslucent.checked,
    hudCenterId: elements.hudCenterId.checked,
    volume: Number(elements.volume.value),
    sensitivity: Number(elements.sensitivity.value),
  };
}

/**
 * Sets up touch controls based on device and saved preferences
 */
export function setupTouchControls(): void {
  const touchControls = domManager.elements.touchControls;

  const enableTouch = storageManager.getTouchControls();
  if (enableTouch === null) {
    const isMobile = !window.matchMedia("(hover: hover)").matches;
    touchControls.checked = isMobile;
    storageManager.setTouchControls(isMobile);
  } else {
    touchControls.checked = enableTouch;
  }

  touchControls.addEventListener("change", () => {
    storageManager.setTouchControls(touchControls.checked);
  });
}
