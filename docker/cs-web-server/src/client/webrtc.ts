import {Net, Packet, Xash3D, Xash3DOptions} from "xash3d-fwgs";
import type {Logger, WebSocketClient} from "./core";
import {WebRTCTransport} from "./transport";

const LOOPBACK_IP: [number, number, number, number] = [127, 0, 0, 1];
const LOOPBACK_PORT = 8080;

export interface Xash3DWebRTCOptions extends Xash3DOptions {
    /** Signalling socket, created and owned by the app. */
    socket: WebSocketClient;
    logger: Logger;
    /** `host:port` the engine is told to connect to. */
    serverAddress: string;
    /** Container for remote audio elements. Defaults to `document.body`. */
    audioContainer?: HTMLElement;
    /** Delay before rebuilding the transport after a drop, in ms. */
    restartDelay?: number;
    /** How long to wait before reporting a stalled first connection, in ms. */
    slowConnectionTimeout?: number;
    /** Injectable for tests. */
    createPeerConnection?: () => RTCPeerConnection;
    /** Injectable for tests. */
    getUserMedia?: () => Promise<MediaStream | undefined>;
}

/**
 * Xash3D wired to the server over WebRTC.
 *
 * The transport is disposable and the engine is not: when the socket or the
 * peer connection drops, {@link WebRTCTransport} rebuilds both and this class
 * simply re-issues the engine's `connect` command over the new channel. The
 * engine is never quit — `Xash3D.quit()` is irreversible, so tearing it down
 * would mean reloading the WASM module and re-mounting the whole filesystem.
 */
export class Xash3DWebRTC extends Xash3D {
    private readonly transport: WebRTCTransport;
    private readonly logger: Logger;
    private readonly serverAddress: string;

    /** Set once the app asks to join; drives reconnect-time re-joining. */
    private shouldBeConnected = false;

    /** Fired when the first connection is taking unusually long. */
    onSlowConnection?: () => void;
    /** Fired every time the transport becomes usable, including after a restart. */
    onConnected?: () => void;
    /** Fired when a live transport drops. */
    onDisconnected?: () => void;

    constructor(options: Xash3DWebRTCOptions) {
        const {
            socket,
            logger,
            serverAddress,
            audioContainer,
            restartDelay,
            slowConnectionTimeout,
            createPeerConnection,
            getUserMedia,
            ...xashOptions
        } = options;
        super(xashOptions);

        this.logger = logger;
        this.serverAddress = serverAddress;
        this.net = new Net(this);

        this.transport = new WebRTCTransport({
            socket,
            logger,
            audioContainer,
            restartDelay,
            slowConnectionTimeout,
            createPeerConnection,
            getUserMedia,
        });

        this.transport.onPacket = (data) => this.enqueuePacket(data);
        this.transport.onSlow = () => this.onSlowConnection?.();
        this.transport.onLost = () => this.onDisconnected?.();
        this.transport.onReady = () => this.handleTransportReady();
    }

    async init(): Promise<void> {
        await Promise.all([super.init(), this.transport.start()]);
    }

    /** Tells the engine to join the server, and to re-join after any reconnect. */
    connectToServer(): void {
        this.shouldBeConnected = true;
        this.logger.info({address: this.serverAddress}, "connecting to server");
        this.Cmd_ExecuteString(`connect ${this.serverAddress}`);
    }

    /** Stops re-joining on reconnect, without touching the engine. */
    disconnectFromServer(): void {
        this.shouldBeConnected = false;
        this.Cmd_ExecuteString("disconnect");
    }

    /** Closes the transport for good. The engine keeps running. */
    close(): void {
        this.transport.stop();
    }

    sendto(packet: Packet): void {
        // Packet.data is a view over the engine heap; RTCDataChannel.send only
        // types ArrayBuffer-backed views, so widen it here.
        this.transport.send(packet.data as unknown as ArrayBuffer);
    }

    /**
     * Re-joins the server after the transport was rebuilt. The engine survived
     * the drop, so it only needs to be pointed at the new channel.
     */
    private handleTransportReady(): void {
        this.onConnected?.();

        if (!this.shouldBeConnected || !this.running) return;

        this.logger.info(
            {address: this.serverAddress},
            "transport restored, rejoining server",
        );
        this.Cmd_ExecuteString(`connect ${this.serverAddress}`);
    }

    private enqueuePacket(data: unknown): void {
        const packet: Packet = {
            ip: LOOPBACK_IP,
            port: LOOPBACK_PORT,
            data: data as Packet["data"],
        };

        const blob = data as {arrayBuffer?: () => Promise<Int8Array>};
        if (typeof blob?.arrayBuffer === "function") {
            void blob.arrayBuffer().then((buffer) => {
                packet.data = buffer;
                (this.net as Net).incoming.enqueue(packet);
            });
            return;
        }

        (this.net as Net).incoming.enqueue(packet);
    }
}
