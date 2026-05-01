export function parseURL(urlStr: string) {
    try {
        const url = new URL(urlStr);
        return {
            protocol: url.protocol,
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? '443' : '80'),
            pathname: url.pathname,
            hash: url.hash,
            origin: url.origin,
            params: Array.from(url.searchParams.entries()),
            toString: () => url.toString()
        };
    } catch (e) {
        return null;
    }
}

export function updateURLParam(urlStr: string, key: string, value: string): string {
    try {
        const url = new URL(urlStr);
        url.searchParams.set(key, value);
        return url.toString();
    } catch (e) {
        return urlStr;
    }
}