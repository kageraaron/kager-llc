export function escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;')
               .replace(/</g, '&lt;')
               .replace(/>/g, '&gt;')
               .replace(/"/g, '&quot;')
               .replace(/'/g, '&#039;');
}

export interface RegexResult {
    highlightedHtml: string;
    matches: number;
    error?: string;
    matchesEmpty?: boolean;
}

export function evaluateRegex(pattern: string, flags: string, text: string): RegexResult {
    if (!pattern) {
        return { highlightedHtml: escapeHtml(text), matches: 0 };
    }

    let regex: RegExp;
    try {
        regex = new RegExp(pattern, flags);
    } catch (e) {
        return { highlightedHtml: escapeHtml(text), matches: 0, error: 'Invalid Regex' };
    }

    let countingRegex = regex;
    if (!regex.global) {
        try {
            countingRegex = new RegExp(pattern, flags + 'g');
        } catch (e) {}
    }

    if (countingRegex.test('')) {
        return { highlightedHtml: escapeHtml(text), matches: 0, matchesEmpty: true };
    }

    let matchCount = 0;
    const highlightedHtml = text.replace(countingRegex, (match) => {
        matchCount++;
        return '<mark class="highlight">' + escapeHtml(match) + '</mark>';
    });

    return { highlightedHtml, matches: matchCount };
}