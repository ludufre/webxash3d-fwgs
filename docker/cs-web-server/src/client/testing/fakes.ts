import {vi} from "vitest";
import type {Logger} from "../core";

/** Logger that satisfies the interface and records nothing. */
export function createFakeLogger(): Logger {
    const logger: Logger = {
        level: "silent",
        trace: vi.fn(),
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        fatal: vi.fn(),
        child: () => logger,
    };
    return logger;
}

/**
 * Stand-in for the global WebSocket.
 *
 * Instances register themselves in {@link FakeWebSocket.instances} so tests can
 * drive open/close/message on whichever socket the code under test opened.
 */
export class FakeWebSocket {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;

    static instances: FakeWebSocket[] = [];

    static reset(): void {
        FakeWebSocket.instances = [];
    }

    /** Most recently constructed socket. */
    static get last(): FakeWebSocket {
        const socket = FakeWebSocket.instances.at(-1);
        if (!socket) throw new Error("no FakeWebSocket has been constructed");
        return socket;
    }

    readyState: number = FakeWebSocket.CONNECTING;
    sent: string[] = [];
    closeCalls = 0;

    onopen: ((event: Event) => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    onclose: ((event: CloseEvent) => void) | null = null;

    constructor(readonly url: string) {
        FakeWebSocket.instances.push(this);
    }

    send(data: string): void {
        this.sent.push(data);
    }

    close(): void {
        this.closeCalls += 1;
        this.readyState = FakeWebSocket.CLOSED;
    }

    // --- test drivers ---

    open(): void {
        this.readyState = FakeWebSocket.OPEN;
        this.onopen?.(new Event("open"));
    }

    emitMessage(data: unknown): void {
        this.onmessage?.({data: JSON.stringify(data)} as MessageEvent);
    }

    emitError(): void {
        this.onerror?.(new Event("error"));
    }

    emitClose(code = 1006): void {
        this.readyState = FakeWebSocket.CLOSED;
        this.onclose?.({code, reason: ""} as CloseEvent);
    }
}

/** Minimal RTCDataChannel double. */
export class FakeDataChannel {
    readyState: RTCDataChannelState = "connecting";
    sent: unknown[] = [];

    onopen: (() => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;

    constructor(readonly label: string) {
    }

    send(data: unknown): void {
        this.sent.push(data);
    }

    open(): void {
        this.readyState = "open";
        this.onopen?.();
    }

    emitClose(): void {
        this.readyState = "closed";
        this.onclose?.();
    }

    emitError(): void {
        this.onerror?.();
    }

    emitMessage(data: unknown): void {
        this.onmessage?.({data} as MessageEvent);
    }
}

/** Minimal RTCPeerConnection double covering only what the transport uses. */
export class FakePeerConnection {
    static instances: FakePeerConnection[] = [];

    static reset(): void {
        FakePeerConnection.instances = [];
    }

    static get last(): FakePeerConnection {
        const peer = FakePeerConnection.instances.at(-1);
        if (!peer) throw new Error("no FakePeerConnection has been constructed");
        return peer;
    }

    connectionState: RTCPeerConnectionState = "new";
    closeCalls = 0;
    addedTracks: MediaStreamTrack[] = [];
    addedCandidates: RTCIceCandidateInit[] = [];
    localDescription: RTCSessionDescriptionInit | null = null;
    remoteDescription: RTCSessionDescriptionInit | null = null;

    onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
    ontrack: ((event: RTCTrackEvent) => void) | null = null;
    onconnectionstatechange: (() => void) | null = null;
    ondatachannel: ((event: RTCDataChannelEvent) => void) | null = null;

    constructor() {
        FakePeerConnection.instances.push(this);
    }

    async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
        this.remoteDescription = description;
    }

    async createAnswer(): Promise<RTCSessionDescriptionInit> {
        return {type: "answer", sdp: "fake-answer"};
    }

    async setLocalDescription(description: RTCSessionDescriptionInit): Promise<void> {
        this.localDescription = description;
    }

    async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
        this.addedCandidates.push(candidate);
    }

    addTrack(track: MediaStreamTrack): void {
        this.addedTracks.push(track);
    }

    close(): void {
        this.closeCalls += 1;
        this.connectionState = "closed";
    }

    // --- test drivers ---

    setConnectionState(state: RTCPeerConnectionState): void {
        this.connectionState = state;
        this.onconnectionstatechange?.();
    }

    /** Delivers both data channels the server opens, and returns them. */
    emitDataChannels(): { read: FakeDataChannel; write: FakeDataChannel } {
        const read = new FakeDataChannel("read");
        const write = new FakeDataChannel("write");

        this.ondatachannel?.({channel: read} as unknown as RTCDataChannelEvent);
        this.ondatachannel?.({channel: write} as unknown as RTCDataChannelEvent);

        return {read, write};
    }

    emitIceCandidate(candidate: RTCIceCandidateInit | null): void {
        this.onicecandidate?.({
            candidate: candidate ? {toJSON: () => candidate} : null,
        } as unknown as RTCPeerConnectionIceEvent);
    }
}

/** Brings a transport all the way to ready and returns its channels. */
export function completeHandshake(): {
    peer: FakePeerConnection;
    read: FakeDataChannel;
    write: FakeDataChannel;
} {
    const socket = FakeWebSocket.last;
    socket.open();

    const peer = FakePeerConnection.last;
    const {read, write} = peer.emitDataChannels();
    read.open();
    write.open();

    return {peer, read, write};
}
