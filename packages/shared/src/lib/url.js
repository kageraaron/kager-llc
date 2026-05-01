/**
 * Parses a URL string into its components.
 * @param {string} urlStr 
 * @returns {object|null}
 */
export function parseURL(urlStr) {
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

/**
 * Updates a query parameter in a URL string.
 * @param {string} urlStr 
 * @param {string} key 
 * @param {string} value 
 * @returns {string} The updated URL string.
 */
export function updateURLParam(urlStr, key, value) {
    try {
        const url = new URL(urlStr);
        url.searchParams.set(key, value);
        return url.toString();
    } catch (e) {
        return urlStr;
    }
}