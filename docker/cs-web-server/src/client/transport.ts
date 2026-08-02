import type {Logger, WebSocketClient} from "./core";

const EVENT_VERSION = "v1";

export const SIGNALLING_EVENTS = {
    OFFER: `${EVENT_VERSION}:offer`,
    ANSWER: `${EVENT_VERSION}:answer`,
    CANDIDATE: `${EVENT_VERSION}:candidate`,
} as const;

/** Peer states we treat as unrecoverable. `disconnected` is transient and ignored. */
const FATAL_PEER_STATES: RTCPeerConnectionState[] = ["failed", "closed"];

const READ_CHANNEL = "read";
const WRITE_CHANNEL = "write";
const REQUIRED_CHANNELS = 2;

export interface WebRTCTransportOptions {
    /** Signalling socket. Must have auto-reconnect disabled — this class drives it. */
    socket: WebSocketClient;
    logger: Logger;
    /** Injectable for tests. */
    createPeerConnection?: () => RTCPeerConnection;
    /** Injectable for tests. Resolves undefined when the mic is unavailable. */
    getUserMedia?: () => Promise<MediaStream | undefined>;
    /** Container for remote audio elements. Defaults to `document.body`. */
    audioContainer?: HTMLElement;
    /** Delay before rebuilding after a drop, in ms. */
    restartDelay?: number;
    /** How long to wait before reporting a stalled first connection, in ms. */
    slowConnectionTimeout?: number;
}

/**
 * Owns the signalling socket and the peer connection, and rebuilds both from
 * scratch whenever either goes down.
 *
 * There is no partial recovery: any fatal event tears the whole transport down
 * and starts a fresh WebSocket + RTCPeerConnection. The engine is deliberately
 * left running — {@link onReady} fires after every successful (re)connect so
 * the caller can re-issue its `connect` command over the new transport.
 */
export class WebRTCTransport {
    /** Fires whenever the transport becomes usable, including after a restart. */
    onReady?: () => void;
    /** Fires when a live transport drops. Not fired for failed retry attempts. */
    onLost?: () => void;
    /** Fires when the first connection is taking unusually long. */
    onSlow?: () => void;
    /** Receives payloads from the server's write channel. */
    onPacket?: (data: unknown) => void;

    private readonly socket: WebSocketClient;
    private readonly logger: Logger;
    private readonly createPeerConnection: () => RTCPeerConnection;
    private readonly acquireUserMedia: () => Promise<MediaStream | undefined>;
    private readonly audioContainer?: HTMLElement;
    private readonly restartDelay: number;
    private readonly slowConnectionTimeout: number;

    private peer?: RTCPeerConnection;
    private channel?: RTCDataChannel;
    private stream?: MediaStream;
    private audio?: HTMLAudioElement;

    private remoteDescription?: RTCSessionDescriptionInit;
    private candidates: RTCIceCandidateInit[] = [];
    private wasRemote = false;
    private openChannels = 0;

    private isReady = false;
    private stopped = true;
    private restarting = false;
    private restartTimer?: ReturnType<typeof setTimeout>;
    private slowTimer?: ReturnType<typeof setTimeout>;
    private readyWaiters: Array<() => void> = [];

    constructor(options: WebRTCTransportOptions) {
        this.socket = options.socket;
        this.logger = options.logger;
        this.createPeerConnection =
            options.createPeerConnection ?? (() => new RTCPeerConnection());
        this.acquireUserMedia =
            options.getUserMedia ?? (() => WebRTCTransport.defaultUserMedia(this.logger));
        this.audioContainer = options.audioContainer;
        this.restartDelay = options.restartDelay ?? 1000;
        this.slowConnectionTimeout = options.slowConnectionTimeout ?? 10000;

        this.socket.on("open", () => this.handleSocketOpen());
        this.socket.on("message", (event) => void this.handleSignal(event));
        this.socket.on("close", () => this.handleLost("socket closed"));
        this.socket.on("error", () => this.handleLost("socket error"));
    }

    /** True while a peer connection with both data channels is established. */
    get ready(): boolean {
        return this.isReady;
    }

    /** Opens the transport and resolves once it is ready for the first time. */
    async start(): Promise<void> {
        if (!this.stopped) return;
        this.stopped = false;

        this.stream = await this.acquireUserMedia();

        const ready = new Promise<void>((resolve) => this.readyWaiters.push(resolve));
        this.socket.connect();
        this.startSlowTimer();

        await ready;
    }

    /** Closes everything and suppresses any pending restart. */
    stop(): void {
        this.stopped = true;
        this.restarting = false;
        this.clearTimers();
        this.teardown();
        this.socket.disconnect();
        this.isReady = false;
    }

    /** Sends a payload over the read channel. Returns false when not connected. */
    send(data: string | ArrayBufferLike | Blob | ArrayBufferView): boolean {
        if (!this.channel || this.channel.readyState !== "open") return false;
        this.channel.send(data as ArrayBuffer);
        return true;
    }

    // ============================================
    // Lifecycle
    // ============================================

    private handleSocketOpen(): void {
        if (this.stopped) return;
        this.logger.debug("signalling connected, negotiating peer connection");
        this.startConnection();
    }

    /**
     * Single entry point for every fatal condition: socket close/error, data
     * channel close/error, or a dead peer connection.
     */
    private handleLost(reason: string): void {
        if (this.stopped || this.restarting) return;

        const wasReady = this.isReady;
        this.restarting = true;
        this.isReady = false;

        this.logger.warn({reason, wasReady}, "transport lost, rebuilding");

        this.clearTimers();
        this.teardown();
        this.socket.disconnect();

        if (wasReady) this.onLost?.();

        this.restartTimer = setTimeout(() => {
            this.restartTimer = undefined;
            if (this.stopped) return;

            this.restarting = false;
            this.logger.debug("reopening signalling socket");
            this.socket.connect();
        }, this.restartDelay);
    }

    private handleReady(): void {
        this.isReady = true;
        this.clearSlowTimer();
        this.logger.info("transport ready");

        const waiters = this.readyWaiters;
        this.readyWaiters = [];
        waiters.forEach((resolve) => resolve());

        this.onReady?.();
    }

    /** Drops the peer connection and any attached media, keeping the socket alone. */
    private teardown(): void {
        this.detachAudio();

        if (this.peer) {
            this.peer.onicecandidate = null;
            this.peer.ontrack = null;
            this.peer.onconnectionstatechange = null;
            this.peer.ondatachannel = null;
            this.peer.close();
            this.peer = undefined;
        }

        this.channel = undefined;
        this.openChannels = 0;
        this.candidates = [];
        this.wasRemote = false;
        this.remoteDescription = undefined;
    }

    // ============================================
    // Peer connection
    // ============================================

    private startConnection(): void {
        const peer = this.createPeerConnection();
        this.peer = peer;

        peer.onicecandidate = (e) => {
            if (!e.candidate) return;
            this.socket.sendEvent(SIGNALLING_EVENTS.CANDIDATE, e.candidate.toJSON());
        };

        peer.ontrack = (e) => this.attachAudio(e);

        peer.onconnectionstatechange = () => {
            const state = peer.connectionState;
            this.logger.debug({connectionState: state}, "peer connection state changed");

            if (FATAL_PEER_STATES.includes(state)) {
                this.handleLost(`peer connection ${state}`);
            }
        };

        this.stream?.getTracks()?.forEach((track) => peer.addTrack(track, this.stream!));

        peer.ondatachannel = (e) => this.attachChannel(e.channel);

        void this.negotiate();
    }

    private attachChannel(channel: RTCDataChannel): void {
        if (channel.label === WRITE_CHANNEL) {
            channel.onmessage = (event) => this.onPacket?.(event.data);
        }

        channel.onclose = () => this.handleLost(`data channel ${channel.label} closed`);
        channel.onerror = () => this.handleLost(`data channel ${channel.label} errored`);

        channel.onopen = () => {
            if (channel.label === READ_CHANNEL) {
                this.channel = channel;
            }

            this.openChannels += 1;
            if (this.openChannels === REQUIRED_CHANNELS) {
                this.handleReady();
            }
        };
    }

    private async handleSignal(event: MessageEvent): Promise<void> {
        let parsed: [string, unknown];
        try {
            parsed = JSON.parse(event.data);
        } catch (error) {
            this.logger.error(error, "failed to parse signalling message");
            return;
        }

        switch (parsed[0]) {
            case SIGNALLING_EVENTS.OFFER:
                this.remoteDescription = parsed[1] as RTCSessionDescriptionInit;
                await this.negotiate();
                break;
            case SIGNALLING_EVENTS.CANDIDATE:
                this.candidates.push(parsed[1] as RTCIceCandidateInit);
                if (this.wasRemote) this.flushCandidates();
                break;
        }
    }

    private async negotiate(): Promise<void> {
        if (!this.remoteDescription || !this.peer) return;

        const peer = this.peer;
        const description = this.remoteDescription;
        this.remoteDescription = undefined;

        try {
            await peer.setRemoteDescription(description);
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            this.socket.sendEvent(SIGNALLING_EVENTS.ANSWER, answer);
        } catch (error) {
            this.logger.error(error, "negotiation failed");
            this.handleLost("negotiation failed");
            return;
        }

        this.wasRemote = true;
        this.flushCandidates();
    }

    private flushCandidates(): void {
        if (!this.candidates.length || !this.peer) return;

        const peer = this.peer;
        const candidates = this.candidates;
        this.candidates = [];

        candidates.forEach((candidate) => {
            peer.addIceCandidate(candidate).catch(() => {
                // Re-queue so the next flush retries it.
                this.candidates.push(candidate);
            });
        });
    }

    // ============================================
    // Audio
    // ============================================

    private attachAudio(event: RTCTrackEvent): void {
        const container = this.audioContainer ?? document.body;

        const audio = document.createElement(event.track.kind) as HTMLAudioElement;
        audio.srcObject = event.streams[0];
        audio.autoplay = true;
        audio.controls = true;
        container.appendChild(audio);
        this.audio = audio;

        event.track.onmute = () => void audio.play();
        event.streams[0].onremovetrack = () => this.detachAudio();
    }

    private detachAudio(): void {
        this.audio?.parentNode?.removeChild(this.audio);
        this.audio = undefined;
    }

    // ============================================
    // Timers
    // ============================================

    private startSlowTimer(): void {
        if (this.stream || this.slowTimer) return;

        this.slowTimer = setTimeout(() => {
            this.slowTimer = undefined;
            this.logger.warn(
                {timeoutMs: this.slowConnectionTimeout},
                "connection is taking longer than expected",
            );
            this.onSlow?.();
        }, this.slowConnectionTimeout);
    }

    private clearSlowTimer(): void {
        if (!this.slowTimer) return;
        clearTimeout(this.slowTimer);
        this.slowTimer = undefined;
    }

    private clearTimers(): void {
        this.clearSlowTimer();
        if (this.restartTimer) {
            clearTimeout(this.restartTimer);
            this.restartTimer = undefined;
        }
    }

    private static async defaultUserMedia(
        logger: Logger,
    ): Promise<MediaStream | undefined> {
        try {
            return await navigator.mediaDevices.getUserMedia({audio: true});
        } catch (error) {
            logger.debug({err: error}, "microphone unavailable, continuing without audio");
            return undefined;
        }
    }
}
