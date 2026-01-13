import { logger } from "./logger";

// ============================================
// API Client Class
// ============================================

export interface ApiResponse<T = unknown> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

class ApiClient {
  private authToken: string | null = null;

  /**
   * Sets the authentication token for requests
   */
  setAuthToken(token: string | null): void {
    this.authToken = token;
  }

  /**
   * Gets default headers for requests
   */
  private getHeaders(includeAuth: boolean = true): HeadersInit {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    if (includeAuth && this.authToken) {
      headers["Authorization"] = `Bearer ${this.authToken}`;
    }

    return headers;
  }

  /**
   * Performs a GET request
   */
  async get<T = unknown>(
    url: string,
    includeAuth: boolean = true
  ): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: this.getHeaders(includeAuth),
      });

      return this.handleResponse<T>(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Performs a POST request
   */
  async post<T = unknown>(
    url: string,
    body?: unknown,
    includeAuth: boolean = true
  ): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: this.getHeaders(includeAuth),
        body: body ? JSON.stringify(body) : undefined,
      });

      return this.handleResponse<T>(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Performs a PUT request
   */
  async put<T = unknown>(url: string, body?: unknown): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(url, {
        method: "PUT",
        headers: this.getHeaders(),
        body: body ? JSON.stringify(body) : undefined,
      });

      return this.handleResponse<T>(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Performs a DELETE request
   */
  async delete<T = unknown>(url: string): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(url, {
        method: "DELETE",
        headers: this.getHeaders(),
      });

      return this.handleResponse<T>(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Handles the response from fetch
   */
  private async handleResponse<T>(response: Response): Promise<ApiResponse<T>> {
    const result: ApiResponse<T> = {
      ok: response.ok,
      status: response.status,
    };

    // Handle no content response
    if (response.status === 204) {
      return result;
    }

    // Try to parse JSON response
    try {
      const text = await response.text();
      if (text) {
        result.data = JSON.parse(text) as T;
      }
    } catch {
      // Response is not JSON, that's ok
    }

    // Add error message for non-ok responses
    if (!response.ok) {
      result.error = this.getErrorMessage(response.status);
      logger.warn(`API error: ${response.status} - ${result.error}`);
    }

    return result;
  }

  /**
   * Handles fetch errors
   */
  private handleError<T>(error: unknown): ApiResponse<T> {
    const message = error instanceof Error ? error.message : "Network error";
    logger.error("API request failed:", error);

    return {
      ok: false,
      status: 0,
      error: message,
    };
  }

  /**
   * Gets human-readable error message from status code
   */
  private getErrorMessage(status: number): string {
    switch (status) {
      case 400:
        return "Bad request";
      case 401:
        return "Authentication failed";
      case 403:
        return "Insufficient permissions";
      case 404:
        return "Not found";
      case 429:
        return "Too many requests";
      case 500:
        return "Server error";
      case 503:
        return "Service unavailable";
      default:
        return `Request failed (${status})`;
    }
  }
}

// Export singleton instance
export const apiClient = new ApiClient();
