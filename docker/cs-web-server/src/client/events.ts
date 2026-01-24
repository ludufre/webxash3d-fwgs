import { domManager } from "./dom";
import { hideSettingsUI } from "./ui";
import {
  getSettingsFromForm,
  saveSettingsToLocalStorage,
  loadSettingsFromLocalStorage,
  setupTouchControls,
} from "./settings";
import type { PlayerSettings } from "./types";

// ============================================
// Event Handlers
// ============================================

/**
 * Sets up slider value display handlers
 */
export function setupSliderHandlers(): void {
  const elements = domManager.elements;

  elements.volume.addEventListener("input", (e) => {
    const target = e.target as HTMLInputElement;
    elements.volumeValue.textContent = target.value;
  });

  elements.sensitivity.addEventListener("input", (e) => {
    const target = e.target as HTMLInputElement;
    elements.sensitivityValue.textContent = target.value;
  });
}

/**
 * Sets up the settings form submission handler
 */
export function setupFormHandler(
  onSubmit: (settings: PlayerSettings) => void
): void {
  domManager.elements.form.addEventListener("submit", (e) => {
    e.preventDefault();

    const settings = getSettingsFromForm();
    saveSettingsToLocalStorage(settings);
    hideSettingsUI();
    onSubmit(settings);
  });
}

/**
 * Initializes all event handlers
 */
export function setupEventHandlers(
  onSettingsSubmit: (settings: PlayerSettings) => void
): void {
  setupTouchControls();
  setupSliderHandlers();
  loadSettingsFromLocalStorage();
  setupFormHandler(onSettingsSubmit);
}
