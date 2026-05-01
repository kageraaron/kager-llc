/**
 * Decodes a base64url encoded string.
 */
export function base64UrlDecode(str: string): string {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    const pad = str.length % 4;
    if (pad) {
        if (pad === 1) {
            throw new Error('InvalidLengthError');
        }
        str += new Array(5 - pad).join('=');
    }
    return decodeURIComponent(escape(atob(str)));
}

/**
 * Decodes a JWT and returns its header and payload.
 */
export function decodeJWT(token: string): { header: any; payload: any } | null {
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    try {
        const header = JSON.parse(base64UrlDecode(parts[0]));
        const payload = JSON.parse(base64UrlDecode(parts[1]));
        return { header, payload };
    } catch (e) {
        return null;
    }
}