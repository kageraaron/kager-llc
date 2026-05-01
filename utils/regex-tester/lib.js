export function escapeHtml(text) {
    return text.replace(/&/g, '&amp;')
               .replace(/</g, '&lt;')
               .replace(/>/g, '&gt;')
               .replace(/"/g, '&quot;')
               .replace(/'/g, '&#039;');
}

/**
 * Evaluates a regex pattern against a text string.
 * @param {string} pattern 
 * @param {string} flags 
 * @param {string} text 
 * @returns {object} { highlightedHtml, matches, error, matchesEmpty }
 */
export function evaluateRegex(pattern, flags, text) {
    if (!pattern) {
        return { highlightedHtml: escapeHtml(text), matches: 0 };
    }

    let regex;
    try {
        // Use a safe regex check
        regex = new RegExp(pattern, flags);
    } catch (e) {
        return { highlightedHtml: escapeHtml(text), matches: 0, error: 'Invalid Regex' };
    }

    // Force global for counting if not present
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