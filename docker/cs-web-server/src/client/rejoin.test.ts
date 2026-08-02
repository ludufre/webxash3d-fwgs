/**
 * Covers the contract between the transport and the engine: the engine is
 * never restarted, it is only re-pointed at the rebuilt transport.
 *
 * `Xash3DWebRTC` extends `Xash3D`, which boots a WASM module on construction,
 * so these tests exercise the same wiring against a stand-in engine rather than
 * loading the real one.
 */
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {WebSocketClient} from "./core";
import {WebRTCTransport} from "./transport";
import {completeHandshake, createFakeLogger, FakePeerConnection, FakeWebSocket,} from "./testing/fakes";

const SERVER_ADDRESS = "127.0.0.1:8080";
const RESTART_DELAY = 1000;

/** Mirrors the reconnect wiring in Xash3DWebRTC against a fake engine. */
class FakeEngine {
    running = false;
    exited = false;
    commands: string[] = [];

    private shouldBeConnected = false;

    constructor(private readonly transport: WebRTCTransport) {
        this.transport.onReady = () => this.handleTransportReady();
    }

    Cmd_ExecuteString(cmd: string): void {
        this.commands.push(cmd);
    }

    main(): void {
        if (this.exited || this.running) return;
        this.running = true;
    }

    quit(): void {
        this.exited = true;
        this.running = false;
    }

    connectToServer(): void {
        this.shouldBeConnected = true;
        this.Cmd_ExecuteString(`connect ${SERVER_ADDRESS}`);
    }

    private handleTransportReady(): void {
        if (!this.shouldBeConnected || !this.running) return;
        this.Cmd_ExecuteString(`connect ${SERVER_ADDRESS}`);
    }
}

const liveTransports: WebRTCTransport[] = [];

function createHarness() {
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
        getUserMedia: async () => undefined,
        restartDelay: RESTART_DELAY,
    });

    liveTransports.push(transport);
    return {transport, engine: new FakeEngine(transport)};
}

async function start(transport: WebRTCTransport): Promise<void> {
    const started = transport.start();
    await vi.advanceTimersByTimeAsync(0);
    completeHandshake();
    await started;
}

async function dropAndRecover(): Promise<void> {
    FakeWebSocket.last.emitClose();
    await vi.advanceTimersByTimeAsync(RESTART_DELAY);
    completeHandshake();
}

beforeEach(() => {
    FakeWebSocket.reset();
    FakePeerConnection.reset();
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.useFakeTimers();
});

afterEach(() => {
    while (liveTransports.length) liveTransports.pop()!.stop();
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe("engine rejoin on transport restart", () => {
    it("re-issues connect after the transport is rebuilt", async () => {
        const {transport, engine} = createHarness();

        await start(transport);
        engine.main();
        engine.connectToServer();
        expect(engine.commands).toEqual([`connect ${SERVER_ADDRESS}`]);

        await dropAndRecover();

        expect(engine.commands).toEqual([
            `connect ${SERVER_ADDRESS}`,
            `connect ${SERVER_ADDRESS}`,
        ]);
    });

    it("never quits the engine across a drop", async () => {
        const {transport, engine} = createHarness();

        await start(transport);
        engine.main();
        engine.connectToServer();

        await dropAndRecover();

        expect(engine.running).toBe(true);
        expect(engine.exited).toBe(false);
    });

    it("does not rejoin when the engine was never started", async () => {
        const {transport, engine} = createHarness();

        await start(transport);
        // No main(), no connectToServer().

        await dropAndRecover();

        expect(engine.commands).toEqual([]);
    });

    it("does not rejoin when the engine is running but never joined", async () => {
        const {transport, engine} = createHarness();

        await start(transport);
        engine.main();

        await dropAndRecover();

        expect(engine.commands).toEqual([]);
    });

    it("rejoins once per successful reconnect, not per retry attempt", async () => {
        const {transport, engine} = createHarness();

        await start(transport);
        engine.main();
        engine.connectToServer();

        // Two failed attempts, then a successful one.
        FakeWebSocket.last.emitClose();
        await vi.advanceTimersByTimeAsync(RESTART_DELAY);
        FakeWebSocket.last.emitClose();
        await vi.advanceTimersByTimeAsync(RESTART_DELAY);
        completeHandshake();

        expect(engine.commands).toHaveLength(2);
    });

    it("rejoins after each of several separate drops", async () => {
        const {transport, engine} = createHarness();

        await start(transport);
        engine.main();
        engine.connectToServer();

        await dropAndRecover();
        await dropAndRecover();
        await dropAndRecover();

        expect(engine.commands).toHaveLength(4);
    });
});
