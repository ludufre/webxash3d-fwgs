import { Em } from "../generated/xash";

/**
 * Interface for networking bindings used by the Xash3D WASM engine.
 * Provides low-level socket and packet operations, mirroring POSIX-style APIs.
 */
export interface EmNet {
    /**
     * Initialize the networking layer with the active Emscripten instance.
     * @param em - Emscripten runtime
     */
    init(em: Em): void

    /**
     * Receive a packet from a socket.
     * @param fd - Socket file descriptor
     * @param bufPtr - Pointer to buffer for received data
     * @param bufLen - Maximum buffer length
     * @param flags - Socket flags
     * @param sockaddrPtr - Pointer to sockaddr structure
     * @param socklenPtr - Pointer to length of sockaddr structure
     * @returns Number of bytes received or error code
     */
    recvfrom(fd: number, bufPtr: number, bufLen: number, flags: number, sockaddrPtr: number, socklenPtr: number): number

    /**
     * Send a packet to a remote host.
     * @param fd - Socket file descriptor
     * @param bufPtr - Pointer to buffer with data
     * @param bufLen - Length of data in buffer
     * @param flags - Socket flags
     * @param sockaddrPtr - Pointer to sockaddr structure
     * @param socklenPtr - Size of sockaddr structure
     * @returns Number of bytes sent or error code
     */
    sendto(fd: number, bufPtr: number, bufLen: number, flags: number, sockaddrPtr: number, socklenPtr: number): number

    /**
     * Send multiple packets in a single batch.
     * @param fd - Socket file descriptor
     * @param bufsPtr - Pointer to array of buffer pointers
     * @param lensPtr - Pointer to array of buffer lengths
     * @param count - Number of buffers
     * @param flags - Socket flags
     * @param sockaddrPtr - Pointer to sockaddr structure
     * @param socklenPtr - Size of sockaddr structure
     * @returns Total number of bytes sent or error code
     */
    sendtoBatch(fd: number, bufsPtr: number, lensPtr: number, count: number, flags: number, sockaddrPtr: number, socklenPtr: number): number

    /**
     * Create a new socket.
     * @param family - Address family (e.g. AF_INET)
     * @param type - Socket type (e.g. SOCK_DGRAM)
     * @param protocol - Protocol number
     * @returns Socket file descriptor or error code
     */
    socket(family: number, type: number, protocol: number): number

    /**
     * Resolve a hostname into an address.
     * @param hostnamePtr - Pointer to hostname string
     * @returns Pointer to hostent structure or error code
     */
    gethostbyname(hostnamePtr: number): number

    /**
     * Get the local hostname.
     * @param namePtr - Pointer to buffer to receive hostname
     * @param namelenPtr - Maximum length of buffer
     * @returns 0 on success or error code
     */
    gethostname(namePtr: number, namelenPtr: number): number

    /**
     * Get the local address of a socket.
     * @param fd - Socket file descriptor
     * @param sockaddrPtr - Pointer to sockaddr structure
     * @param socklenPtr - Size of sockaddr structure
     * @returns 0 on success or error code
     */
    getsockname(fd: number, sockaddrPtr: number, socklenPtr: number): number

    /**
     * Bind a socket to a local address.
     * @param fd - Socket file descriptor
     * @param sockaddrPtr - Pointer to sockaddr structure
     * @param socklenPtr - Size of sockaddr structure
     * @returns 0 on success or error code
     */
    bind(fd: number, sockaddrPtr: number, socklenPtr: number): number

    /**
     * Close a socket.
     * @param fd - Socket file descriptor
     * @returns 0 on success or error code
     */
    closesocket(fd: number): number

    /**
     * Resolve a hostname or service into one or more addresses.
     * @param hostnamePtr - Pointer to hostname string
     * @param restrictPrt - Pointer to service string or null
     * @param hintsPtr - Pointer to addrinfo hints structure
     * @param addrinfoPtr - Pointer to addrinfo result structure
     * @returns 0 on success or error code
     */
    getaddrinfo(hostnamePtr: number, restrictPrt: number, hintsPtr: number, addrinfoPtr: number): number

    /**
     * Free address info structure allocated by getaddrinfo.
     * @param addrinfoPtr - Pointer to addrinfo structure to free
     */
    freeaddrinfo(addrinfoPtr: number): void

    /**
     * Connect a socket to a remote address (TCP).
     * @param fd - Socket file descriptor
     * @param sockaddrPtr - Pointer to sockaddr structure
     * @param socklenPtr - Size of sockaddr structure
     * @returns 0 on success or error code
     */
    connect(fd: number, sockaddrPtr: number, socklenPtr: number): number

    /**
     * Send data on a connected socket (TCP).
     * @param fd - Socket file descriptor
     * @param bufPtr - Pointer to buffer with data
     * @param bufLen - Length of data
     * @param flags - Socket flags
     * @returns Number of bytes sent or error code
     */
    send(fd: number, bufPtr: number, bufLen: number, flags: number): number

    /**
     * Receive data from a connected socket (TCP).
     * @param fd - Socket file descriptor
     * @param bufPtr - Pointer to buffer for received data
     * @param bufLen - Maximum buffer length
     * @param flags - Socket flags
     * @returns Number of bytes received or error code
     */
    recv(fd: number, bufPtr: number, bufLen: number, flags: number): number

    /**
     * Wait for activity on sockets.
     * @param nfds - Highest socket fd + 1
     * @param readfdsPtr - Pointer to read fd set
     * @param writefdsPtr - Pointer to write fd set
     * @param exceptfdsPtr - Pointer to exception fd set
     * @param timeoutPtr - Pointer to timeout structure
     * @returns Number of ready fds or error code
     */
    select(nfds: number, readfdsPtr: number, writefdsPtr: number, exceptfdsPtr: number, timeoutPtr: number): number
}
