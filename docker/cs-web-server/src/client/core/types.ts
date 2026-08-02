/**
 * Types shared by the game client and the admin panel.
 */

import type {LogLevel} from "./logger";

/**
 * Shape of `GET /v1/config`.
 *
 * Served before authentication so that every browser client can configure
 * itself (log level included) without waiting for a login.
 */
export interface ClientConfig {
    arguments: string[];
    console: string[];
    game_dir: string;
    libraries: {
        client: string;
        server: string;
        extras: string;
        menu: string;
        filesystem: string;
    };
    dynamic_libraries: string[];
    files_map: Record<string, string>;
    log_level: LogLevel;
}
