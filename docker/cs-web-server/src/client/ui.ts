import { domManager } from "./dom";

// ============================================
// UI Utilities
// ============================================

// Flag to indicate a fatal error occurred
let fatalError = false;

/**
 * Checks if a fatal error has occurred
 */
export function hasFatalError(): boolean {
  return fatalError;
}

/**
 * Helper function to get HTML elements with type safety
 * @deprecated Use domManager.elements instead
 */
export function getElement<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

/**
 * Hides the loading logo with animation
 */
export function hideLoadingLogo(): void {
  const logo = domManager.elements.logo;
  logo.style.animationName = "pulsate-end";
  logo.style.animationFillMode = "forwards";
  logo.style.animationIterationCount = "1";
  logo.style.animationDirection = "normal";
}

/**
 * Hides the scanline effect overlay
 */
export function hideScanlineEffect(): void {
  document.body.classList.add("game-loaded");
}

/**
 * Hides the settings UI elements
 */
export function hideSettingsUI(): void {
  domManager.elements.form.style.display = "none";
  domManager.elements.social.style.display = "none";
}

/**
 * Updates progress bar value
 */
export function updateProgressBar(percentage: number): void {
  domManager.elements.progressBar.style.width = `${percentage}%`;
}

/**
 * Hides the progress bar
 */
export function hideProgressBar(): void {
  domManager.elements.progressWrapper.style.display = "none";
}

/**
 * Shows an error message in the warning dialog
 */
export function showError(title: string, message: string): void {
  fatalError = true;

  const elements = domManager.elements;

  // Hide progress bar and settings
  elements.progressWrapper.style.display = "none";
  elements.form.style.display = "none";
  elements.social.style.display = "none";

  // Stop logo animation
  elements.logo.style.animationName = "none";
  elements.logo.style.opacity = "0.5";

  // Show error dialog
  elements.warningTitle.textContent = title;
  elements.warningMessage.textContent = message;
  elements.warning.style.display = "block";
  if (!elements.warning.open) {
    elements.warning.showModal();
  }
}
