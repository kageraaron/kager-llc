export function base64Encode(input: string): string {
    return btoa(unescape(encodeURIComponent(input)));
}

export function base64Decode(input: string): string {
    return decodeURIComponent(escape(atob(input)));
}