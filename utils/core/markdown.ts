declare const marked: any;

export function renderMarkdown(md: string): string {
    if (typeof marked === 'undefined') {
        return md;
    }
    return marked.parse(md);
}