import {
    ApiClient,
    type ApiClientOptions,
    type ApiResponse,
    type RequestOptions,
} from "../core";

export interface SaltResponse {
    salt: string;
}

export interface LoginResponse {
    token: string;
    expiresIn: number;
}

export interface LoginRequest {
    username: string;
    passwordHash: string;
}

/**
 * Admin API client.
 *
 * Extends the shared {@link ApiClient} with the bearer token and the endpoints
 * only the panel uses; transport concerns stay in the base class.
 */
export class AdminApiClient extends ApiClient {
    private token: string | null = null;

    constructor(options: ApiClientOptions) {
        super(options);
    }

    get authToken(): string | null {
        return this.token;
    }

    set authToken(token: string | null) {
        this.token = token;
    }

    /** `GET /v1/auth` — password salt, unauthenticated. */
    fetchSalt(): Promise<ApiResponse<SaltResponse>> {
        return this.request<SaltResponse>("GET", "/v1/auth", {anonymous: true});
    }

    /** `POST /v1/auth` — login, unauthenticated. */
    login(body: LoginRequest): Promise<ApiResponse<LoginResponse>> {
        return this.request<LoginResponse>("POST", "/v1/auth", {body, anonymous: true});
    }

    /** `POST /v1/rcon` — run one command, or a batch of cvar reads. */
    sendCommand(command: string | string[]): Promise<ApiResponse<void>> {
        return this.request<void>("POST", "/v1/rcon", {body: {command}});
    }

    protected override buildHeaders(options: RequestOptions): Record<string, string> {
        const headers = super.buildHeaders(options);
        if (!options.anonymous && this.token) {
            headers["Authorization"] = `Bearer ${this.token}`;
        }
        return headers;
    }
}
