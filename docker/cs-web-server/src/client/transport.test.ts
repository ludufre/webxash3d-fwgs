import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {WebSocketClient} from "./core";
import {WebRTCTransport, SIGNALLING_EVENTS} from "./transport";
import {
    completeHandshake,
    createFakeLogger,
    FakePeerConnection,
    FakeWebSocket,
} from "./testing/fakes";

const RESTART_DELAY = 1000;

/** Transports created by the factory, stopped after every test. */
const liveTransports: WebRTCTransport[] = [];

function createTransport(overrides: Partial<{restartDelay: number}> = {}) {
    const logger = createFakeLogger();
    const socket = new WebSocketClient({
        url: "/websocket",
        logger,
        autoReconnect: false,
    });

    const transport = new WebRTCTransport({
        socket,
        logger,
        createPeerConnection: () => new FakePeerConnection() as unknown as RTCPeerConnection,
        // No microphone: keeps the slow-connection timer active and the
        // handshake free of media tracks.
        getUserMedia: async () => undefined,
        restartDelay: overrides.restartDelay ?? RESTART_DELAY,
    });

    liveTransports.push(transport);
    return {transport, socket};
}

/** Runs start() to completion by driving the handshake once the socket exists. */
async function startAndConnect(transport: WebRTCTransport): Promise<void> {
    const started = transport.start();
    await vi.advanceTimersByTimeAsync(0);
    completeHandshake();
    await started;
}

beforeEach(() => {
    FakeWebSocket.reset();
    FakePeerConnection.reset();
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.useFakeTimers();
});

afterEach(() => {
    // A transport left mid-restart would otherwise fire its timer into the
    // next test and open a socket there.
    while (liveTransports.length) liveTransports.pop()!.stop();
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe("WebRTCTransport", () => {
    describe("initial connection", () => {
        it("becomes ready only once both data channels are open", async () => {
            const {transport} = createTransport();
            const onReady = vi.fn();
            transport.onReady = onReady;

            const started = transport.start();
            await vi.advanceTimersByTimeAsync(0);

            FakeWebSocket.last.open();
            const {read, write} = FakePeerConnection.last.emitDataChannels();

            read.open();
            expect(transport.ready).toBe(false);
            expect(onReady).not.toHaveBeenCalled();

            write.open();
            await started;

            expect(transport.ready).toBe(true);
            expect(onReady).toHaveBeenCalledTimes(1);
        });

        it("answers an offer and forwards ice candidates over the socket", async () => {
            const {transport} = createTransport();
            await startAndConnect(transport);

            FakeWebSocket.last.emitMessage({
                event: SIGNALLING_EVENTS.OFFER,
                data: {type: "offer", sdp: "remote"},
            });
            await vi.advanceTimersByTimeAsync(0);

            const answer = FakeWebSocket.last.sent
                .map((raw) => JSON.parse(raw))
                .find((msg) => msg.event === SIGNALLING_EVENTS.ANSWER);
            expect(answer?.data).toEqual({type: "answer", sdp: "fake-answer"});

            FakePeerConnection.last.emitIceCandidate({candidate: "a"});
            const candidate = FakeWebSocket.last.sent
                .map((raw) => JSON.parse(raw))
                .find((msg) => msg.event === SIGNALLING_EVENTS.CANDIDATE);
            expect(candidate?.data).toEqual({candidate: "a"});
        });

        it("buffers candidates that arrive before the remote description", async () => {
            const {transport} = createTransport();
            await startAndConnect(transport);

            FakeWebSocket.last.emitMessage({
                event: SIGNALLING_EVENTS.CANDIDATE,
                data: {candidate: "early"},
            });
            expect(FakePeerConnection.last.addedCandidates).toHaveLength(0);

            FakeWebSocket.last.emitMessage({
                event: SIGNALLING_EVENTS.OFFER,
                data: {type: "offer"},
            });
            await vi.advanceTimersByTimeAsync(0);

            expect(FakePeerConnection.last.addedCandidates).toEqual([
                {candidate: "early"},
            ]);
        });

        it("reports a stalled connection after the slow timeout", async () => {
            const {transport} = createTransport();
            const onSlow = vi.fn();
            transport.onSlow = onSlow;

            void transport.start();
            await vi.advanceTimersByTimeAsync(0);

            await vi.advanceTimersByTimeAsync(10_000);
            expect(onSlow).toHaveBeenCalledTimes(1);
        });

        it("does not report a stalled connection once ready", async () => {
            const {transport} = createTransport();
            const onSlow = vi.fn();
            transport.onSlow = onSlow;

            await startAndConnect(transport);
            await vi.advanceTimersByTimeAsync(60_000);

            expect(onSlow).not.toHaveBeenCalled();
        });
    });

    describe("restart triggers", () => {
        const triggers: Array<[string, () => void]> = [
            ["socket close", () => FakeWebSocket.last.emitClose()],
            ["socket error", () => FakeWebSocket.last.emitError()],
            ["peer failed", () => FakePeerConnection.last.setConnectionState("failed")],
            ["peer closed", () => FakePeerConnection.last.setConnectionState("closed")],
        ];

        it.each(triggers)("rebuilds the whole transport on %s", async (_name, trigger) => {
            const {transport} = createTransport();
            await startAndConnect(transport);

            const socketsBefore = FakeWebSocket.instances.length;
            const peersBefore = FakePeerConnection.instances.length;

            trigger();
            expect(transport.ready).toBe(false);

            await vi.advanceTimersByTimeAsync(RESTART_DELAY);

            expect(FakeWebSocket.instances.length).toBe(socketsBefore + 1);

            completeHandshake();
            expect(transport.ready).toBe(true);
            expect(FakePeerConnection.instances.length).toBe(peersBefore + 1);
        });

        it("rebuilds when a data channel closes", async () => {
            const {transport} = createTransport();
            const started = transport.start();
            await vi.advanceTimersByTimeAsync(0);

            FakeWebSocket.last.open();
            const {read, write} = FakePeerConnection.last.emitDataChannels();
            read.open();
            write.open();
            await started;

            write.emitClose();
            expect(transport.ready).toBe(false);

            await vi.advanceTimersByTimeAsync(RESTART_DELAY);
            expect(FakeWebSocket.instances).toHaveLength(2);
        });

        it("rebuilds when a data channel errors", async () => {
            const {transport} = createTransport();
            const started = transport.start();
            await vi.advanceTimersByTimeAsync(0);

            FakeWebSocket.last.open();
            const {read, write} = FakePeerConnection.last.emitDataChannels();
            read.open();
            write.open();
            await started;

            read.emitError();

            await vi.advanceTimersByTimeAsync(RESTART_DELAY);
            expect(FakeWebSocket.instances).toHaveLength(2);
        });

        it("ignores the transient 'disconnected' peer state", async () => {
            const {transport} = createTransport();
            await startAndConnect(transport);

            FakePeerConnection.last.setConnectionState("disconnected");
            await vi.advanceTimersByTimeAsync(60_000);

            expect(transport.ready).toBe(true);
            expect(FakeWebSocket.instances).toHaveLength(1);
        });

        it("closes the old peer connection before building a new one", async () => {
            const {transport} = createTransport();
            await startAndConnect(transport);

            const oldPeer = FakePeerConnection.last;
            FakeWebSocket.last.emitClose();

            expect(oldPeer.closeCalls).toBe(1);

            await vi.advanceTimersByTimeAsync(RESTART_DELAY);
            completeHandshake();

            expect(FakePeerConnection.last).not.toBe(oldPeer);
        });

        it("collapses simultaneous triggers into a single restart", async () => {
            const {transport} = createTransport();
            await startAndConnect(transport);

            // A dead peer usually takes the socket and channels down with it.
            FakePeerConnection.last.setConnectionState("failed");
            FakeWebSocket.last.emitClose();
            FakeWebSocket.last.emitError();

            await vi.advanceTimersByTimeAsync(RESTART_DELAY);

            expect(FakeWebSocket.instances).toHaveLength(2);
        });

        it("fires onLost once per drop, and not for a failed retry", async () => {
            const {transport} = createTransport();
            const onLost = vi.fn();
            transport.onLost = onLost;

            await startAndConnect(transport);

            FakeWebSocket.last.emitClose();
            expect(onLost).toHaveBeenCalledTimes(1);

            // The retry attempt itself fails before ever becoming ready.
            await vi.advanceTimersByTimeAsync(RESTART_DELAY);
            FakeWebSocket.last.emitClose();
            expect(onLost).toHaveBeenCalledTimes(1);
        });

        it("fires onReady again after each successful restart", async () => {
            const {transport} = createTransport();
            const onReady = vi.fn();
            transport.onReady = onReady;

            await startAndConnect(transport);
            expect(onReady).toHaveBeenCalledTimes(1);

            FakeWebSocket.last.emitClose();
            await vi.advanceTimersByTimeAsync(RESTART_DELAY);
            completeHandshake();

            expect(onReady).toHaveBeenCalledTimes(2);
        });

        it("keeps retrying until a connection succeeds", async () => {
            const {transport} = createTransport();
            await startAndConnect(transport);

            for (let attempt = 0; attempt < 3; attempt++) {
                FakeWebSocket.last.emitClose();
                await vi.advanceTimersByTimeAsync(RESTART_DELAY);
            }

            expect(FakeWebSocket.instances).toHaveLength(4);

            completeHandshake();
            expect(transport.ready).toBe(true);
        });
    });

    describe("packets", () => {
        it("forwards write-channel messages to onPacket", async () => {
            const {transport} = createTransport();
            const onPacket = vi.fn();
            transport.onPacket = onPacket;

            const started = transport.start();
            await vi.advanceTimersByTimeAsync(0);
            FakeWebSocket.last.open();
            const {read, write} = FakePeerConnection.last.emitDataChannels();
            read.open();
            write.open();
            await started;

            write.emitMessage("payload");
            expect(onPacket).toHaveBeenCalledWith("payload");
        });

        it("sends over the read channel and reports failure when down", async () => {
            const {transport} = createTransport();
            const started = transport.start();
            await vi.advanceTimersByTimeAsync(0);
            FakeWebSocket.last.open();
            const {read, write} = FakePeerConnection.last.emitDataChannels();
            read.open();
            write.open();
            await started;

            expect(transport.send("ping")).toBe(true);
            expect(read.sent).toEqual(["ping"]);

            read.emitClose();
            expect(transport.send("pong")).toBe(false);
        });
    });

    describe("stop", () => {
        it("cancels a pending restart", async () => {
            const {transport} = createTransport();
            await startAndConnect(transport);

            FakeWebSocket.last.emitClose();
            transport.stop();

            await vi.advanceTimersByTimeAsync(60_000);

            expect(FakeWebSocket.instances).toHaveLength(1);
            expect(transport.ready).toBe(false);
        });

        it("ignores drops that happen after stopping", async () => {
            const {transport} = createTransport();
            const onLost = vi.fn();
            transport.onLost = onLost;

            await startAndConnect(transport);
            transport.stop();

            FakePeerConnection.last.setConnectionState("failed");
            await vi.advanceTimersByTimeAsync(60_000);

            expect(onLost).not.toHaveBeenCalled();
            expect(FakeWebSocket.instances).toHaveLength(1);
        });
    });
});
