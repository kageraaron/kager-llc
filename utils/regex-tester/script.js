import { evaluateRegex } from './lib.js';

const regexPatternInput = document.getElementById('regexPattern');
const regexFlagsInput = document.getElementById('regexFlags');
const testStringInput = document.getElementById('testString');
const highlightLayer = document.getElementById('highlightLayer');
const regexError = document.getElementById('regexError');
const matchCount = document.getElementById('matchCount');

function updateUI() {
    const pattern = regexPatternInput.value;
    const flags = regexFlagsInput.value;
    const text = testStringInput.value;

    const result = evaluateRegex(pattern, flags, text);

    if (result.error) {
        regexError.classList.remove('hidden');
        regexError.textContent = result.error;
        highlightLayer.innerHTML = result.highlightedHtml;
        matchCount.textContent = 'Error';
    } else if (result.matchesEmpty) {
        regexError.classList.add('hidden');
        highlightLayer.innerHTML = result.highlightedHtml;
        matchCount.textContent = 'Matches empty string';
    } else {
        regexError.classList.add('hidden');
        highlightLayer.innerHTML = result.highlightedHtml + '
';
        matchCount.textContent = result.matches + ' match' + (result.matches === 1 ? '' : 'es');
    }
}

regexPatternInput.addEventListener('input', updateUI);
regexFlagsInput.addEventListener('input', updateUI);
testStringInput.addEventListener('input', updateUI);
testStringInput.addEventListener('scroll', () => {
    highlightLayer.scrollTop = testStringInput.scrollTop;
});

updateUI();