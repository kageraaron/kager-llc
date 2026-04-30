const markdownInput = document.getElementById('markdownInput');
const previewOutput = document.getElementById('previewOutput');
const clearBtn = document.getElementById('clearBtn');

// Initialize with a default value
const defaultValue = `# Welcome to Markdown Editor

This is a fast, client-side live preview editor.

## Features
- **Bold** and *Italic* text.
- Live rendering.
- Code blocks:
\`\`\`javascript
console.log("Hello, World!");
\`\`\`
- [Link to Google](https://google.com)
`;

markdownInput.value = defaultValue;

function renderMarkdown() {
    const rawText = markdownInput.value;
    const html = marked.parse(rawText);
    previewOutput.innerHTML = html;
}

// Listen to input events for live preview
markdownInput.addEventListener('input', renderMarkdown);

// Initial render
renderMarkdown();

clearBtn.addEventListener('click', () => {
    markdownInput.value = '';
    renderMarkdown();
    markdownInput.focus();
});
