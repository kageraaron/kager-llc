/**
 * Renders markdown text to HTML using the 'marked' library (expected globally).
 * @param {string} md 
 * @returns {string}
 */
export function renderMarkdown(md) {
    if (typeof marked === 'undefined') {
        console.warn('Marked library not found. Returning raw text.');
        return md;
    }
    return marked.parse(md);
}