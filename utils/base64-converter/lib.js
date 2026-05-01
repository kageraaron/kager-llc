export function base64Encode(input) {
    return btoa(unescape(encodeURIComponent(input)));
}

export function base64Decode(input) {
    return decodeURIComponent(escape(atob(input)));
}
