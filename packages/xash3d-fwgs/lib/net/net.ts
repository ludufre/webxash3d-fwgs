import { Em, Sockaddr } from "../generated/xash";
import { RollingBuffer } from "../utils";
import { EmNet } from "./emNet";
import { ErrNoLocation } from "../xash3d";

export interface NetOptions {
    maxPackets: number;
    hostname: string;
    hostID: number;
    debug?: boolean;
}

/**
 * Represents a network packet with raw data, IP address, and port.
 */
export interface Packet {
    data: Int8Array<ArrayBufferLike>;
    ip: [number, number, number, number];
    port: number;
}

/**
 * Interface for an object that handles sending packets via `sendto`.
 */
export interface SendtoSender {
    sendto: (data: Packet) => void;
}

export interface Socket {
    id: number;
    family: number;
    type: number;
    protocol: number;
    addr?: Sockaddr;
    // TCP/HTTP support
    tcpConnected?: boolean;
    tcpHost?: string;
    tcpPort?: number;
    tcpSendBuffer?: Uint8Array[];
    tcpRecvBuffer?: Uint8Array;
    tcpRecvOffset?: number;
}

/**
 * Emulates a simple network layer for Xash3D by implementing network functions
 * in a way that integrates with Emscripten’s networking model.
 */
export class Net implements EmNet {
    em?: Em;

    public readonly sender: SendtoSender;
    public readonly opts: NetOptions;

    public readonly incoming: RollingBuffer<Packet>;

    protected lastSocketID = 1000;
    protected sockets = new Map<number, Socket>();
    // Map fake IPs to real hostnames for HTTP support
    protected hostnameMap = new Map<string, string>();

    constructor(sender: SendtoSender, opts: Partial<NetOptions> = {}) {
        const {
            maxPackets = 128,
            hostname = "webxash3d",
            hostID = 3000,
            debug = false,
        } = opts;
        this.sender = sender;
        this.opts = {
            hostname,
            maxPackets,
            hostID,
            debug,
        };
        this.incoming = new RollingBuffer({
            maxSize: maxPackets,
        });
    }

    private log(...args: unknown[]) {
        if (this.opts.debug) {
            console.log('[Net]', ...args);
        }
    }

    /**
     * Initializes the Net instance with a reference to the Emscripten module.
     * Ensures setup happens only once.
     * @param em - The Emscripten module instance
     */
    init(em: Em) {
        if (this.em) return;
        this.em = em;
    }

    readSockaddrFast(addrPtr: number): [[number, number, number, number], number] {
        const em = this.em!;
        const heapU8 = em.HEAPU8;
        const ipOffset = addrPtr + 4;
        const ip: [number, number, number, number] = [
            heapU8[ipOffset],
            heapU8[ipOffset + 1],
            heapU8[ipOffset + 2],
            heapU8[ipOffset + 3],
        ];
        const portOffset = addrPtr + 2;
        const port = (heapU8[portOffset] << 8) | heapU8[portOffset + 1];
        return [ip, port];
    }

    recvfrom(
        fd: number,
        bufPtr: number,
        bufLen: number,
        flags: number,
        sockaddrPtr: number,
        socklenPtr: number
    ): number {
        const packet = this.incoming.pull();
        if (!packet) {
            // No data available - return EAGAIN/EWOULDBLOCK
            // In Emscripten/musl, EAGAIN = EWOULDBLOCK = 6
            this.em!.setValue(ErrNoLocation(this.em), 6, "i32");
            return -1;
        }

        const em = this.em!;
        const data = packet.data;
        const u8 =
            data instanceof Uint8Array ? data : new Uint8Array(data.buffer || data);
        const copyLen = Math.min(bufLen, u8.length);

        // Copy data into Emscripten's memory buffer
        if (copyLen > 0) {
            em.HEAPU8.set(u8.subarray(0, copyLen), bufPtr);
        }

        // Write source IP and port into the address structure
        if (sockaddrPtr) {
            const heap8 = em.HEAP8;
            const heap16 = em.HEAP16;
            const base16 = sockaddrPtr >> 1;

            const port = packet.port;
            heap16[base16] = 2; // AF_INET

            heap8[sockaddrPtr + 2] = (port >> 8) & 0xff;
            heap8[sockaddrPtr + 3] = port & 0xff;

            heap8[sockaddrPtr + 4] = packet.ip[0];
            heap8[sockaddrPtr + 5] = packet.ip[1];
            heap8[sockaddrPtr + 6] = packet.ip[2];
            heap8[sockaddrPtr + 7] = packet.ip[3];
        }

        // Set address length if provided
        if (socklenPtr) {
            em.HEAP32[socklenPtr >> 2] = 16;
        }

        return copyLen;
    }

    sendto(
        fd: number,
        bufPtr: number,
        bufLen: number,
        flags: number,
        sockaddrPtr: number,
        socklenPtr: number,
    ): number {
        const em = this.em!;
        const heapU8 = em.HEAPU8;

        const [ip, port] = this.readSockaddrFast(sockaddrPtr);

        // bufPtr is already a direct pointer to the buffer data
        const packetCopy = heapU8.subarray(bufPtr, bufPtr + bufLen);
        this.sender.sendto({ data: packetCopy, ip, port });

        return bufLen;
    }

    sendtoBatch(
        fd: number,
        bufsPtr: number,
        lensPtr: number,
        count: number,
        flags: number,
        sockaddrPtr: number,
        socklenPtr: number
    ): number {
        const em = this.em!;
        const heap32 = em.HEAP32;
        const heapU8 = em.HEAPU8;

        let totalSize = 0;
        const [ip, port] = this.readSockaddrFast(sockaddrPtr);

        for (let i = 0; i < count; ++i) {
            const size = heap32[(lensPtr >> 2) + i];
            const packetPtr = heap32[(bufsPtr >> 2) + i];
            const slice = heapU8.subarray(packetPtr, packetPtr + size);
            this.sender.sendto({
                data: slice,
                port,
                ip
            })

            totalSize += slice.length;
        }

        return totalSize;
    }

    socket(family: number, type: number, protocol: number): number {
        const id = this.lastSocketID;
        this.log(`socket() fd=${id} type=${type === 1 ? 'TCP' : 'UDP'}`);
        this.sockets.set(id, { id, family, type, protocol });
        this.lastSocketID += 1;
        return id;
    }

    gethostbyname(hostnamePtr: number): number {
        return 0;
    }

    gethostname(namePtr: number, namelenPtr: number): number {
        this.em!.writeArrayToMemory(
            this.em!.intArrayFromString(
                `${this.opts.hostname!}.${this.opts.hostID}`,
                true
            ),
            namePtr
        );
        return 0;
    }

    getsockname(fd: number, sockaddrPtr: number, socklenPtr: number): number {
        const sock = this.sockets.get(fd);
        if (!sock) return -1;
        this.em!.writeSockaddr(
            sockaddrPtr,
            sock.family,
            sock.addr?.addr ?? "0.0.0.0",
            sock.addr?.port ?? 0,
            socklenPtr
        );
        return 0;
    }

    bind(fd: number, sockaddrPtr: number, socklenPtr: number) {
        const sock = this.sockets.get(fd);
        if (!sock) return -1;
        sock.addr = this.em!.readSockaddr(sockaddrPtr, socklenPtr);
        return 0;
    }

    closesocket(fd: number) {
        const sock = this.sockets.get(fd);
        if (sock) {
            // Clean up TCP state
            if (sock.tcpConnected) {
                sock.tcpSendBuffer = undefined;
                sock.tcpRecvBuffer = undefined;
            }
            this.log(`closesocket() fd=${fd} type=${sock.type === 1 ? 'TCP' : 'UDP'}`);
        }
        return this.sockets.delete(fd) ? 0 : -1;
    }

    // Cache for addrinfo allocations to properly free them later
    protected addrinfoCache = new Map<number, number>(); // ai pointer -> sa pointer

    getaddrinfo(
        hostnamePtr: number,
        restrictPrt: number,
        hintsPtr: number,
        addrinfoPtr: number
    ) {
        const host = this.em!.AsciiToString(hostnamePtr);

        // Check if this is a peer ID (format: name.NUMBER) or a real hostname
        const parts = host.split(".");
        const lastPart = parts[parts.length - 1];
        const isPeerId = parts.length === 2 && !isNaN(Number(lastPart));

        let fakeIp: string;

        if (isPeerId) {
            // Peer ID format: hostname.ID -> maps to 101.101.x.x for WebRTC peers
            const id = Number(lastPart);
            fakeIp = `101.101.${(id >> 0) & 0xff}.${(id >> 8) & 0xff}`;
        } else {
            // Real hostname -> maps to 102.x.x.x for TCP/HTTP connections
            const hash = host.split('').reduce((a, b) => {
                a = ((a << 5) - a) + b.charCodeAt(0);
                return a & a;
            }, 0);
            fakeIp = `102.${(hash >> 16) & 0xff}.${(hash >> 8) & 0xff}.${hash & 0xff}`;
            this.hostnameMap.set(fakeIp, host);
            this.log(`getaddrinfo() ${host} -> ${fakeIp}`);
        }

        const sa = this.em!._malloc(16);
        this.em!.writeSockaddr(sa, 2, fakeIp, 0);

        // Allocate and fill addrinfo structure
        // struct addrinfo {
        //   int ai_flags;       // offset 0
        //   int ai_family;      // offset 4
        //   int ai_socktype;    // offset 8
        //   int ai_protocol;    // offset 12
        //   socklen_t ai_addrlen; // offset 16
        //   struct sockaddr *ai_addr; // offset 20
        //   char *ai_canonname; // offset 24
        //   struct addrinfo *ai_next; // offset 28
        // }
        const ai = this.em!._malloc(32);
        this.em!.HEAP32[(ai + 0) >> 2] = 0;      // ai_flags
        this.em!.HEAP32[(ai + 4) >> 2] = 2;      // ai_family = AF_INET
        this.em!.HEAP32[(ai + 8) >> 2] = 1;      // ai_socktype = SOCK_STREAM (for TCP)
        this.em!.HEAP32[(ai + 12) >> 2] = 6;     // ai_protocol = IPPROTO_TCP
        this.em!.HEAP32[(ai + 16) >> 2] = 16;    // ai_addrlen
        this.em!.HEAPU32[(ai + 20) >> 2] = sa;   // ai_addr
        this.em!.HEAPU32[(ai + 24) >> 2] = 0;    // ai_canonname = NULL
        this.em!.HEAPU32[(ai + 28) >> 2] = 0;    // ai_next = NULL

        // Store for later cleanup
        this.addrinfoCache.set(ai, sa);

        this.em!.HEAPU32[addrinfoPtr >> 2] = ai;

        return 0;
    }

    freeaddrinfo(addrinfoPtr: number) {
        const sa = this.addrinfoCache.get(addrinfoPtr);
        if (sa !== undefined) {
            this.em!._free(sa);
            this.addrinfoCache.delete(addrinfoPtr);
        }
        this.em!._free(addrinfoPtr);
    }

    // TCP/HTTP support functions

    connect(fd: number, sockaddrPtr: number, socklenPtr: number): number {
        const sock = this.sockets.get(fd);
        if (!sock) return -1;

        const [ip, port] = this.readSockaddrFast(sockaddrPtr);
        const ipStr = ip.join('.');

        // Check if this is a real hostname (102.x.x.x range for TCP/HTTP)
        if (ip[0] === 102) {
            const hostname = this.hostnameMap.get(ipStr);
            if (hostname) {
                this.log(`connect() fd=${fd} -> ${hostname}:${port}`);
                sock.tcpHost = hostname;
                sock.tcpPort = port;
                sock.tcpConnected = true;
                sock.tcpSendBuffer = [];
                sock.tcpRecvBuffer = new Uint8Array(0);
                sock.tcpRecvOffset = 0;
                return 0;
            }
        }

        // Reject TCP to peer IPs (101.101.x.x) or unmapped hosts
        return -1;
    }

    send(fd: number, bufPtr: number, bufLen: number, flags: number): number {
        const sock = this.sockets.get(fd);
        if (!sock || !sock.tcpConnected) return -1;

        const data = new Uint8Array(this.em!.HEAPU8.buffer, bufPtr, bufLen).slice();
        sock.tcpSendBuffer!.push(data);

        // Check if we have a complete HTTP request (ends with \r\n\r\n)
        const combined = this.combineBuffers(sock.tcpSendBuffer!);
        const str = new TextDecoder().decode(combined);

        if (str.includes('\r\n\r\n')) {
            this.handleHttpRequest(sock, str);
        }

        return bufLen;
    }

    private combineBuffers(buffers: Uint8Array[]): Uint8Array {
        const totalLen = buffers.reduce((sum, b) => sum + b.length, 0);
        const result = new Uint8Array(totalLen);
        let offset = 0;
        for (const buf of buffers) {
            result.set(buf, offset);
            offset += buf.length;
        }
        return result;
    }

    private async handleHttpRequest(sock: Socket, request: string) {
        const lines = request.split('\r\n');
        const [method, path] = lines[0].split(' ');
        const protocol = sock.tcpPort === 443 ? 'https' : 'http';
        const url = `${protocol}://${sock.tcpHost}${path}`;

        this.log(`HTTP ${method} ${url}`);

        try {
            const response = await fetch(url, { method, mode: 'cors' });
            const body = new Uint8Array(await response.arrayBuffer());

            // HTTP/2 and HTTP/3 don't send status text, use defaults
            const statusText = response.statusText || (response.status === 200 ? 'OK' : 'Error');
            const statusLine = `HTTP/1.1 ${response.status} ${statusText}\r\n`;

            let headers = '';
            response.headers.forEach((value, key) => {
                headers += `${key}: ${value}\r\n`;
            });
            headers += `Content-Length: ${body.length}\r\n\r\n`;

            const headerBytes = new TextEncoder().encode(statusLine + headers);
            const fullResponse = new Uint8Array(headerBytes.length + body.length);
            fullResponse.set(headerBytes, 0);
            fullResponse.set(body, headerBytes.length);

            sock.tcpRecvBuffer = fullResponse;
            sock.tcpRecvOffset = 0;
            sock.tcpSendBuffer = []; // Clear send buffer after request complete

            this.log(`HTTP response: ${response.status}, ${body.length} bytes`);
        } catch (e) {
            console.error('[Net] HTTP request failed:', e);
            sock.tcpRecvBuffer = new TextEncoder().encode(
                'HTTP/1.1 500 Internal Server Error\r\nContent-Length: 0\r\n\r\n'
            );
            sock.tcpRecvOffset = 0;
            sock.tcpSendBuffer = [];
        }
    }

    recv(fd: number, bufPtr: number, bufLen: number, flags: number): number {
        const sock = this.sockets.get(fd);
        if (!sock || !sock.tcpConnected) {
            this.em!.setValue(ErrNoLocation(this.em), 6, "i32"); // EAGAIN
            return -1;
        }

        const available = sock.tcpRecvBuffer!.length - sock.tcpRecvOffset!;
        if (available <= 0) {
            // No data available - return EAGAIN/EWOULDBLOCK (6 in Emscripten/musl)
            this.em!.setValue(ErrNoLocation(this.em), 6, "i32");
            return -1;
        }

        const toRead = Math.min(bufLen, available);
        const data = sock.tcpRecvBuffer!.subarray(sock.tcpRecvOffset!, sock.tcpRecvOffset! + toRead);
        this.em!.HEAPU8.set(data, bufPtr);
        sock.tcpRecvOffset! += toRead;

        return toRead;
    }

    select(
        nfds: number,
        readfdsPtr: number,
        writefdsPtr: number,
        exceptfdsPtr: number,
        timeoutPtr: number
    ): number {
        // Simplified select - check if any TCP sockets have data to read
        let count = 0;

        for (const [fd, sock] of this.sockets) {
            if (sock.tcpConnected && sock.tcpRecvBuffer) {
                const available = sock.tcpRecvBuffer.length - (sock.tcpRecvOffset || 0);
                if (available > 0) {
                    count++;
                }
            }
        }

        // Return number of ready fds (simplified)
        return count > 0 ? count : 0;
    }
}
