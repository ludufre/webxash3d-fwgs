import type {Logger} from "./logger";

export interface ApiResponse<T = unknown> {
    ok: boolean;
    status: number;
    statusText?: string;
    data?: T;
    error?: string;
}

export interface ApiClientOptions {
    logger: Logger;
    baseUrl?: string;
    timeout?: number;
}

export interface RequestOptions {
    body?: unknown;
    timeout?: number;
    headers?: Record<string, string>;
    /** Skip credentials for endpoints that are public (login, salt, config). */
    anonymous?: boolean;
}

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

const DEFAULT_TIMEOUT = 5000;

/**
 * Base HTTP client: URL building, timeouts, JSON parsing and error shaping.
 *
 * Subclasses customise requests by overriding {@link buildHeaders} rather than
 * by carrying request-specific flags around.
 */
export class ApiClient {
    protected readonly logger: Logger;
    protected readonly baseUrl: string;
    protected readonly timeout: number;

    constructor(options: ApiClientOptions) {
        this.logger = options.logger;
        this.baseUrl = options.baseUrl ?? "";
        this.timeout = options.timeout ?? DEFAULT_TIMEOUT;
    }

    async request<T = unknown>(
        method: HttpMethod,
        url: string,
        options: RequestOptions = {},
    ): Promise<ApiResponse<T>> {
        const controller = new AbortController();
        const timeoutId = setTimeout(
            () => controller.abort(),
            options.timeout ?? this.timeout,
        );

        this.logger.trace({method, url}, "sending request");

        try {
            const response = await fetch(`${this.baseUrl}${url}`, {
                method,
                headers: {...this.buildHeaders(options), ...options.headers},
                body: options.body === undefined ? undefined : JSON.stringify(options.body),
                signal: controller.signal,
            });

            return await this.handleResponse<T>(method, url, response);
        } catch (error) {
            if (error instanceof Error && error.name === "AbortError") {
                return this.handleError<T>(method, url, new Error("Request timeout"));
            }
            return this.handleError<T>(method, url, error);
        } finally {
            clearTimeout(timeoutId);
        }
    }

    /** Headers applied to every request. Override to add authentication. */
    protected buildHeaders(_options: RequestOptions): Record<string, string> {
        return {"Content-Type": "application/json"};
    }

    private async handleResponse<T>(
        method: HttpMethod,
        url: string,
        response: Response,
    ): Promise<ApiResponse<T>> {
        const result: ApiResponse<T> = {
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
        };

        if (response.status === 204) {
            this.logger.trace({method, url, status: 204}, "request succeeded");
            return result;
        }

        try {
            const text = await response.text();
            if (text) {
                result.data = JSON.parse(text) as T;
            }
        } catch {
            // Not a JSON body — leave `data` undefined.
        }

        if (!response.ok) {
            result.error = response.statusText || `Request failed (${response.status})`;
            this.logger.warn(
                {method, url, status: response.status, error: result.error},
                "request failed",
            );
            return result;
        }

        this.logger.trace({method, url, status: response.status}, "request succeeded");
        return result;
    }

    private handleError<T>(
        method: HttpMethod,
        url: string,
        error: unknown,
    ): ApiResponse<T> {
        const message = error instanceof Error ? error.message : "Network error";
        this.logger.error({method, url, err: error}, "request errored");

        return {ok: false, status: 0, error: message};
    }
}
