function base64UrlDecode(str) {
    const padded = str.replace(/-/g, '+').replace(/_/g, '/');
    const padding = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
    try {
        return JSON.parse(atob(padded + padding));
    } catch (e) {
        return null;
    }
}

export function decodeJWT(token) {
    const parts = token.trim().split('.');
    if (parts.length !== 3) {
        return { error: 'Invalid JWT: expected 3 dot-separated parts' };
    }
    const header = base64UrlDecode(parts[0]);
    const payload = base64UrlDecode(parts[1]);
    if (!header || !payload) {
        return { error: 'Invalid JWT: could not decode header or payload' };
    }
    const now = Math.floor(Date.now() / 1000);
    return {
        header,
        payload,
        signature: parts[2],
        isExpired: payload.exp != null ? payload.exp < now : null,
        expiresAt: payload.exp != null ? new Date(payload.exp * 1000) : null,
        issuedAt: payload.iat != null ? new Date(payload.iat * 1000) : null,
        notBefore: payload.nbf != null ? new Date(payload.nbf * 1000) : null,
    };
}
