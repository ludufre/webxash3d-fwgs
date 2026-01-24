// ============================================
// DOM Elements Interface
// ============================================

export interface DOMElements {
  // Canvas
  canvas: HTMLCanvasElement;

  // Logo
  logo: HTMLImageElement;

  // Dialogs
  warning: HTMLDialogElement;
  warningTitle: HTMLParagraphElement;
  warningMessage: HTMLParagraphElement;
  progressWrapper: HTMLDialogElement;

  // Progress
  progressBar: HTMLDivElement;

  // Form
  form: HTMLFormElement;
  username: HTMLInputElement;
  crosshairSize: HTMLSelectElement;
  crosshairColor: HTMLSelectElement;
  crosshairTranslucent: HTMLInputElement;
  hudCenterId: HTMLInputElement;
  touchControls: HTMLInputElement;
  volume: HTMLInputElement;
  volumeValue: HTMLSpanElement;
  sensitivity: HTMLInputElement;
  sensitivityValue: HTMLSpanElement;

  // Social
  social: HTMLDivElement;
}

// ============================================
// DOM Manager Class
// ============================================

class DOMManager {
  private _elements: DOMElements | null = null;

  /**
   * Gets cached DOM elements, initializing them if needed
   */
  get elements(): DOMElements {
    if (!this._elements) {
      this._elements = this.initializeElements();
    }
    return this._elements;
  }

  /**
   * Initializes and caches all DOM elements
   */
  private initializeElements(): DOMElements {
    return {
      // Canvas
      canvas: this.getElement<HTMLCanvasElement>("canvas"),

      // Logo
      logo: this.getElement<HTMLImageElement>("logo"),

      // Dialogs
      warning: this.getElement<HTMLDialogElement>("warning"),
      warningTitle: this.getElement<HTMLParagraphElement>("warning-title"),
      warningMessage: this.getElement<HTMLParagraphElement>("warning-message"),
      progressWrapper: this.getElement<HTMLDialogElement>("progress-wrapper"),

      // Progress
      progressBar: this.getElement<HTMLDivElement>("progress-bar"),

      // Form
      form: this.getElement<HTMLFormElement>("form"),
      username: this.getElement<HTMLInputElement>("username"),
      crosshairSize: this.getElement<HTMLSelectElement>("crosshairSize"),
      crosshairColor: this.getElement<HTMLSelectElement>("crosshairColor"),
      crosshairTranslucent: this.getElement<HTMLInputElement>(
        "crosshairTranslucent"
      ),
      hudCenterId: this.getElement<HTMLInputElement>("hudCenterId"),
      touchControls: this.getElement<HTMLInputElement>("touchControls"),
      volume: this.getElement<HTMLInputElement>("volume"),
      volumeValue: this.getElement<HTMLSpanElement>("volume-value"),
      sensitivity: this.getElement<HTMLInputElement>("sensitivity"),
      sensitivityValue: this.getElement<HTMLSpanElement>("sensitivity-value"),

      // Social
      social: this.getElement<HTMLDivElement>("social"),
    };
  }

  /**
   * Helper function to get HTML elements with type safety
   */
  private getElement<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) {
      throw new Error(`Element with id "${id}" not found`);
    }
    return element as T;
  }
}

// Export singleton instance
export const domManager = new DOMManager();
