import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {WebSocketClient} from "./websocket";
import {createFakeLogger, FakeWebSocket} from "../testing/fakes";

function createClient(options: Partial<{autoReconnect: boolean; reconnectDelay: number}> = {}) {
    return new WebSocketClient({
        url: "/websocket",
        logger: createFakeLogger(),
        autoReconnect: options.autoReconnect ?? false,
        reconnectDelay: options.reconnectDelay ?? 3000,
    });
}

beforeEach(() => {
    FakeWebSocket.reset();
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe("WebSocketClient", () => {
    it("resolves a path against the current origin", () => {
        expect(WebSocketClient.resolveUrl("/websocket")).toBe(
            `ws://${window.location.host}/websocket`,
        );
        expect(WebSocketClient.resolveUrl("websocket")).toBe(
            `ws://${window.location.host}/websocket`,
        );
    });

    it("leaves an absolute ws url untouched", () => {
        expect(WebSocketClient.resolveUrl("wss://example.com/x")).toBe(
            "wss://example.com/x",
        );
    });

    it("emits open, message and close to subscribers", () => {
        const client = createClient();
        const onOpen = vi.fn();
        const onMessage = vi.fn();
        const onClose = vi.fn();

        client.on("open", onOpen);
        client.on("message", onMessage);
        client.on("close", onClose);
        client.connect();

        FakeWebSocket.last.open();
        expect(onOpen).toHaveBeenCalledTimes(1);

        FakeWebSocket.last.emitMessage({event: "v1:offer"});
        expect(onMessage).toHaveBeenCalledTimes(1);

        FakeWebSocket.last.emitClose();
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("stops notifying after the unsubscribe function is called", () => {
        const client = createClient();
        const onOpen = vi.fn();

        const off = client.on("open", onOpen);
        client.connect();
        FakeWebSocket.last.open();
        expect(onOpen).toHaveBeenCalledTimes(1);

        off();
        client.connect();
        FakeWebSocket.last.open();
        expect(onOpen).toHaveBeenCalledTimes(1);
    });

    it("serialises the {event, ...data} envelope", () => {
        const client = createClient();
        client.connect();
        FakeWebSocket.last.open();

        client.sendEvent("v1:answer", {data: {type: "answer"}});

        expect(JSON.parse(FakeWebSocket.last.sent[0])).toEqual({
            event: "v1:answer",
            data: {type: "answer"},
        });
    });

    it("drops sends while disconnected instead of throwing", () => {
        const client = createClient();
        client.connect();

        expect(client.send("hello")).toBe(false);
        expect(FakeWebSocket.last.sent).toHaveLength(0);
    });

    it("does not reconnect when auto-reconnect is off", () => {
        const client = createClient({autoReconnect: false});
        client.connect();
        FakeWebSocket.last.open();
        FakeWebSocket.last.emitClose();

        vi.advanceTimersByTime(60_000);

        expect(FakeWebSocket.instances).toHaveLength(1);
    });

    it("reconnects after the delay when auto-reconnect is on", () => {
        const client = createClient({autoReconnect: true, reconnectDelay: 3000});
        client.connect();
        FakeWebSocket.last.open();
        FakeWebSocket.last.emitClose();

        vi.advanceTimersByTime(2999);
        expect(FakeWebSocket.instances).toHaveLength(1);

        vi.advanceTimersByTime(1);
        expect(FakeWebSocket.instances).toHaveLength(2);
    });

    it("cancels a pending reconnect when disconnect is called", () => {
        const client = createClient({autoReconnect: true, reconnectDelay: 3000});
        client.connect();
        FakeWebSocket.last.open();
        FakeWebSocket.last.emitClose();

        client.disconnect();
        vi.advanceTimersByTime(60_000);

        expect(FakeWebSocket.instances).toHaveLength(1);
    });

    it("does not fire close handlers for a deliberate disconnect", () => {
        const client = createClient({autoReconnect: true});
        const onClose = vi.fn();
        client.on("close", onClose);

        client.connect();
        FakeWebSocket.last.open();
        client.disconnect();

        expect(onClose).not.toHaveBeenCalled();
        expect(FakeWebSocket.last.closeCalls).toBe(1);
    });
});
