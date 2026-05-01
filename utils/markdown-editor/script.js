import { renderMarkdown } from './lib.js';

const markdownInput = document.getElementById('markdownInput');
const previewOutput = document.getElementById('previewOutput');
const clearBtn = document.getElementById('clearBtn');

function updateUI() {
    previewOutput.innerHTML = renderMarkdown(markdownInput.value);
}

markdownInput.addEventListener('input', updateUI);
updateUI();

clearBtn.addEventListener('click', () => {
    markdownInput.value = '';
    updateUI();
    markdownInput.focus();
});