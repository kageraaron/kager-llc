const jsonInput = document.getElementById('jsonInput');
const jsonOutput = document.getElementById('jsonOutput');
const errorMsg = document.getElementById('errorMsg');
const formatBtn = document.getElementById('formatBtn');
const minifyBtn = document.getElementById('minifyBtn');
const clearBtn = document.getElementById('clearBtn');
const copyBtn = document.getElementById('copyBtn');

function processJson(spaces) {
    const input = jsonInput.value.trim();
    if (!input) {
        jsonOutput.value = '';
        errorMsg.classList.add('hidden');
        return;
    }

    try {
        const parsed = JSON.parse(input);
        const formatted = JSON.stringify(parsed, null, spaces);
        jsonOutput.value = formatted;
        errorMsg.classList.add('hidden');
        jsonInput.style.borderColor = '#bdc3c7';
    } catch (e) {
        errorMsg.textContent = e.message;
        errorMsg.classList.remove('hidden');
        jsonOutput.value = '';
        jsonInput.style.borderColor = '#e74c3c';
    }
}

formatBtn.addEventListener('click', () => processJson(4));
minifyBtn.addEventListener('click', () => processJson(0));

clearBtn.addEventListener('click', () => {
    jsonInput.value = '';
    jsonOutput.value = '';
    errorMsg.classList.add('hidden');
    jsonInput.style.borderColor = '#bdc3c7';
});

copyBtn.addEventListener('click', () => {
    if (!jsonOutput.value) return;
    
    navigator.clipboard.writeText(jsonOutput.value).then(() => {
        const originalText = copyBtn.textContent;
        copyBtn.textContent = 'Copied!';
        copyBtn.style.backgroundColor = '#27ae60';
        
        setTimeout(() => {
            copyBtn.textContent = originalText;
            copyBtn.style.backgroundColor = '#95a5a6';
        }, 2000);
    });
});
