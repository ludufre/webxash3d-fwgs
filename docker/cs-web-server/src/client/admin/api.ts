import { logger } from "./logger";

// ============================================
// API Client Types
// ============================================

export interface ApiResponse<T = unknown> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

export interface ApiClientOptions {
  authToken?: string | null;
  baseUrl?: string;
}

interface RequestOptions {
  body?: unknown;
  includeAuth?: boolean;
}

// ============================================
// API Client Class
// ============================================

class ApiClient {
  private options: ApiClientOptions;

  constructor(options: ApiClientOptions = {}) {
    this.options = options;
  }

  /**
   * Sets/updates the client options
   */
  setOptions(options: Partial<ApiClientOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Sets the authentication token for requests
   */
  setAuthToken(token: string | null): void {
    this.options.authToken = token;
  }

  /**
   * Gets default headers for requests
   */
  private getHeaders(includeAuth: boolean = true): HeadersInit {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    if (includeAuth && this.options.authToken) {
      headers["Authorization"] = `Bearer ${this.options.authToken}`;
    }

    return headers;
  }

  /**
   * Common request method for all HTTP methods
   */
  private async request<T = unknown>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    url: string,
    options: RequestOptions = {}
  ): Promise<ApiResponse<T>> {
    const { body, includeAuth = true } = options;

    try {
      const fullUrl = this.options.baseUrl ? `${this.options.baseUrl}${url}` : url;

      const response = await fetch(fullUrl, {
        method,
        headers: this.getHeaders(includeAuth),
        body: body ? JSON.stringify(body) : undefined,
      });

      return this.handleResponse<T>(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Performs a GET request
   */
  async get<T = unknown>(
    url: string,
    includeAuth: boolean = true
  ): Promise<ApiResponse<T>> {
    return this.request<T>("GET", url, { includeAuth });
  }

  /**
   * Performs a POST request
   */
  async post<T = unknown>(
    url: string,
    body?: unknown,
    includeAuth: boolean = true
  ): Promise<ApiResponse<T>> {
    return this.request<T>("POST", url, { body, includeAuth });
  }

  /**
   * Performs a PUT request
   */
  async put<T = unknown>(
    url: string,
    body?: unknown,
    includeAuth: boolean = true
  ): Promise<ApiResponse<T>> {
    return this.request<T>("PUT", url, { body, includeAuth });
  }

  /**
   * Performs a DELETE request
   */
  async delete<T = unknown>(
    url: string,
    includeAuth: boolean = true
  ): Promise<ApiResponse<T>> {
    return this.request<T>("DELETE", url, { includeAuth });
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
