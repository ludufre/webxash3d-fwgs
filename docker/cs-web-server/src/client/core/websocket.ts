import type {Logger} from "./logger";

export interface WebSocketEventMap {
    open: Event;
    message: MessageEvent;
    error: Event;
    close: CloseEvent;
}

export type WebSocketEvent = keyof WebSocketEventMap;

export type WebSocketListener<K extends WebSocketEvent> = (
    payload: WebSocketEventMap[K],
) => void;

export interface WebSocketClientOptions {
    /** Path (`/websocket`) or absolute URL. Paths resolve against `location`. */
    url: string;
    logger: Logger;
    /** Reconnect automatically after an abnormal close/error. Default `true`. */
    autoReconnect?: boolean;
    /** Delay before a reconnect attempt, in ms. Default `3000`. */
    reconnectDelay?: number;
    /** Reconnect immediately when the socket errors. Default `false`. */
    reconnectOnError?: boolean;
}

/**
 * Single WebSocket implementation shared by the game client's signalling
 * channel and the admin panel's log stream.
 *
 * Consumers either subscribe with {@link on} (composition — used by
 * `Xash3DWebRTC`) or subclass and override the `handle*` hooks (used by
 * `AdminLogSocket`).
 */
export class WebSocketClient {
    protected readonly logger: Logger;
    protected readonly url: string;
    protected readonly autoReconnect: boolean;
    protected readonly reconnectDelay: number;
    protected readonly reconnectOnError: boolean;

    private socket: WebSocket | null = null;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private closedByUser = false;
    private readonly listeners = new Map<WebSocketEvent, Set<WebSocketListener<never>>>();

    constructor(options: WebSocketClientOptions) {
        this.logger = options.logger;
        this.url = WebSocketClient.resolveUrl(options.url);
        this.autoReconnect = options.autoReconnect ?? true;
        this.reconnectDelay = options.reconnectDelay ?? 3000;
        this.reconnectOnError = options.reconnectOnError ?? false;
    }

    /** Turns a path into an absolute ws(s) URL for the current origin. */
    static resolveUrl(url: string): string {
        if (/^wss?:\/\//.test(url)) return url;
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const path = url.startsWith("/") ? url : `/${url}`;
        return `${protocol}//${window.location.host}${path}`;
    }

    get connected(): boolean {
        return this.socket?.readyState === WebSocket.OPEN;
    }

    /** Opens the socket, replacing any existing one. */
    connect(): void {
        this.closedByUser = false;
        this.clearReconnectTimer();
        this.closeSocket();

        this.logger.debug({url: this.url}, "connecting");
        const socket = new WebSocket(this.url);
        this.socket = socket;

        socket.onopen = (event) => this.handleOpen(event);
        socket.onmessage = (event) => this.handleMessage(event);
        socket.onerror = (event) => this.handleError(event);
        socket.onclose = (event) => this.handleClose(event);
    }

    /** Closes the socket and suppresses auto-reconnect. */
    disconnect(): void {
        this.closedByUser = true;
        this.clearReconnectTimer();
        this.closeSocket();
    }

    send(data: string | ArrayBufferLike | Blob | ArrayBufferView): boolean {
        if (!this.connected) {
            this.logger.warn({url: this.url}, "send while disconnected, dropping message");
            return false;
        }
        this.socket!.send(data);
        return true;
    }

    /** Sends the `[event, data]` envelope both endpoints use. */
    sendEvent(event: string, data?: unknown): boolean {
        return this.send(JSON.stringify([event, data]));
    }

    on<K extends WebSocketEvent>(event: K, listener: WebSocketListener<K>): () => void {
        let set = this.listeners.get(event);
        if (!set) {
            set = new Set();
            this.listeners.set(event, set);
        }
        set.add(listener as WebSocketListener<never>);
        return () => {
            set!.delete(listener as WebSocketListener<never>);
        };
    }

    protected handleOpen(event: Event): void {
        this.logger.debug({url: this.url}, "connected");
        this.emit("open", event);
    }

    protected handleMessage(event: MessageEvent): void {
        this.emit("message", event);
    }

    protected handleError(event: Event): void {
        this.logger.error({url: this.url}, "socket error");
        this.emit("error", event);
        if (this.reconnectOnError && !this.closedByUser) {
            this.scheduleReconnect(0);
        }
    }

    protected handleClose(event: CloseEvent): void {
        this.logger.debug({url: this.url, code: event.code, reason: event.reason}, "closed");
        this.emit("close", event);
        if (this.autoReconnect && !this.closedByUser) {
            this.scheduleReconnect(this.reconnectDelay);
        }
    }

    protected scheduleReconnect(delay: number): void {
        if (this.reconnectTimer) return;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            if (this.closedByUser) return;
            this.connect();
        }, delay);
    }

    protected emit<K extends WebSocketEvent>(
        event: K,
        payload: WebSocketEventMap[K],
    ): void {
        this.listeners.get(event)?.forEach((listener) => {
            (listener as WebSocketListener<K>)(payload);
        });
    }

    private clearReconnectTimer(): void {
        if (!this.reconnectTimer) return;
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
    }

    private closeSocket(): void {
        if (!this.socket) return;
        // Detach first so the deliberate close does not trigger a reconnect.
        this.socket.onopen = null;
        this.socket.onmessage = null;
        this.socket.onerror = null;
        this.socket.onclose = null;
        this.socket.close();
        this.socket = null;
    }
}
