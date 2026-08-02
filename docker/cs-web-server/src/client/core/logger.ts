import pino from "pino";

export type LogLevel =
    | "trace"
    | "debug"
    | "info"
    | "warn"
    | "error"
    | "fatal"
    | "silent";

/** Pino's call signature: structured object first, optional message second. */
export interface LogFn {
    (obj: unknown, msg?: string, ...args: unknown[]): void;
    (msg: string, ...args: unknown[]): void;
}

/**
 * The logging surface the rest of the client depends on.
 *
 * Mirrors pino so a pino instance satisfies it directly — there is no wrapper
 * class, only this interface, so no call is ever proxied or re-implemented.
 */
export interface Logger {
    readonly level: string;
    trace: LogFn;
    debug: LogFn;
    info: LogFn;
    warn: LogFn;
    error: LogFn;
    fatal: LogFn;
    /** Scoped logger, e.g. `logger.child({scope: "api"})`. */
    child(bindings: Record<string, unknown>): Logger;
}

export interface CreateLoggerOptions {
    level: LogLevel;
    /** Bindings attached to every record, e.g. `{app: "admin"}`. */
    bindings?: Record<string, unknown>;
}

/** Level used when the server config could not be read. */
export const DEFAULT_LOG_LEVEL: LogLevel = "info";

/**
 * Builds the root pino logger. The level comes from `GET /v1/config`, so this
 * is called only after that request resolves.
 */
export function createLogger(options: CreateLoggerOptions): Logger {
    const logger = pino({
        level: options.level,
        browser: {
            // Emit one structured record per call so bindings such as
            // {scope: "api"} and payloads such as {loadedConfig} survive.
            asObject: true,
        },
    }) as unknown as Logger;

    return options.bindings ? logger.child(options.bindings) : logger;
}
