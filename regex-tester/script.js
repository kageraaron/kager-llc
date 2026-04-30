const regexPatternInput = document.getElementById('regexPattern');
const regexFlagsInput = document.getElementById('regexFlags');
const testStringInput = document.getElementById('testString');
const highlightLayer = document.getElementById('highlightLayer');
const regexError = document.getElementById('regexError');
const matchCount = document.getElementById('matchCount');

function escapeHtml(text) {
    return text.replace(/&/g, "&amp;")
               .replace(/</g, "&lt;")
               .replace(/>/g, "&gt;")
               .replace(/"/g, "&quot;")
               .replace(/'/g, "&#039;");
}

function evaluateRegex() {
    const patternStr = regexPatternInput.value;
    const flagsStr = regexFlagsInput.value;
    const textStr = testStringInput.value;

    if (!patternStr) {
        highlightLayer.innerHTML = escapeHtml(textStr);
        regexError.classList.add('hidden');
        matchCount.textContent = '0 matches';
        return;
    }

    let regex;
    try {
        regex = new RegExp(patternStr, flagsStr);
        regexError.classList.add('hidden');
    } catch (e) {
        regexError.classList.remove('hidden');
        highlightLayer.innerHTML = escapeHtml(textStr);
        matchCount.textContent = 'Error';
        return;
    }

    if (!regex.global) {
        // Force global flag to count all matches for visualizer
        try {
            regex = new RegExp(patternStr, flagsStr + (flagsStr.includes('g') ? '' : 'g'));
        } catch(e) {}
    }

    // A pattern that matches empty strings can cause infinite loops in replace/matchAll
    if (regex.test('')) {
        highlightLayer.innerHTML = escapeHtml(textStr);
        matchCount.textContent = 'Matches empty string';
        return;
    }

    let matches = 0;
    const highlightedText = textStr.replace(regex, (match) => {
        matches++;
        return `<mark class="highlight">${escapeHtml(match)}</mark>`;
    });

    // We must ensure the text aligns perfectly with the textarea underneath
    highlightLayer.innerHTML = highlightedText + '\n'; // Add trailing newline to fix scrolling sync
    matchCount.textContent = `${matches} match${matches === 1 ? '' : 'es'}`;
}

function syncScroll() {
    highlightLayer.scrollTop = testStringInput.scrollTop;
}

regexPatternInput.addEventListener('input', evaluateRegex);
regexFlagsInput.addEventListener('input', evaluateRegex);
testStringInput.addEventListener('input', evaluateRegex);
testStringInput.addEventListener('scroll', syncScroll);

// Default example
regexPatternInput.value = '\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b';
regexFlagsInput.value = 'g';
testStringInput.value = 'Contact us at info@example.com or support@test.org for more information.';
evaluateRegex();
