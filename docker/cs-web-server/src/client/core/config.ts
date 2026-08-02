import type {ClientConfig} from "./types";

const CONFIG_URL = "/v1/config";

/**
 * Fetches `GET /v1/config`.
 *
 * Deliberately a plain function rather than an `ApiClient` method: the config
 * carries the log level, so it has to be read before any logger — and
 * therefore before any logger-dependent client — can be constructed.
 */
export async function fetchClientConfig(url = CONFIG_URL): Promise<ClientConfig> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch client config: HTTP ${response.status}`);
    }
    return (await response.json()) as ClientConfig;
}
