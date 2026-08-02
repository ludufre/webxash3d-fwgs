import type {JWTPayload} from "./types";

// ============================================
// Utility Functions
// ============================================

/** Decodes a JWT payload without verifying the signature. */
export function decodeJWT(token: string): JWTPayload | null {
    try {
        const base64Url = token.split(".")[1];
        const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
        const jsonPayload = decodeURIComponent(
            atob(base64)
                .split("")
                .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
                .join(""),
        );
        return JSON.parse(jsonPayload) as JWTPayload;
    } catch {
        return null;
    }
}

/** Hashes a password with the server-provided salt (SHA-512). */
export async function hashPassword(password: string, salt: string): Promise<string> {
    const data = new TextEncoder().encode(password + salt);
    const hashBuffer = await crypto.subtle.digest("SHA-512", data);
    return Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

/** Escapes HTML to prevent XSS when injecting log text. */
export function escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

/** Removes ANSI escape codes from text. */
export function stripAnsiCodes(text: string): string {
    return text.replace(/\x1b\[[0-9;]*m/g, "");
}

/**
 * Splits a leading `[HH:MM:SS]` timestamp off a log line.
 * Returns `[timestamp, message]`; the timestamp is empty when absent.
 */
export function extractTimestamp(message: string): [string, string] {
    const match = message.match(/^\[(\d{2}:\d{2}:\d{2})\]/);
    if (!match) return ["", message];

    return [`[${match[1]}]`, message.substring(match[0].length).trim()];
}

/** Reads a form control's value, normalising checkboxes to "1"/"0". */
export function getInputValue(element: HTMLInputElement | HTMLSelectElement): string {
    if (element.type === "checkbox") {
        return (element as HTMLInputElement).checked ? "1" : "0";
    }
    return element.value;
}
