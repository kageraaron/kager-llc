const modeEncodeBtn = document.getElementById('modeEncodeBtn');
const modeDecodeBtn = document.getElementById('modeDecodeBtn');
const inputLabel = document.getElementById('inputLabel');
const outputLabel = document.getElementById('outputLabel');
const inputText = document.getElementById('inputText');
const outputText = document.getElementById('outputText');
const convertBtn = document.getElementById('convertBtn');
const clearBtn = document.getElementById('clearBtn');
const copyBtn = document.getElementById('copyBtn');
const errorMsg = document.getElementById('errorMsg');

let isEncodeMode = true;

// Toggle Mode
function setMode(encode) {
    isEncodeMode = encode;
    if (encode) {
        modeEncodeBtn.classList.add('active');
        modeDecodeBtn.classList.remove('active');
        inputLabel.textContent = 'Plain Text';
        outputLabel.textContent = 'Base64 Output';
        convertBtn.textContent = 'Encode';
    } else {
        modeDecodeBtn.classList.add('active');
        modeEncodeBtn.classList.remove('active');
        inputLabel.textContent = 'Base64 Input';
        outputLabel.textContent = 'Plain Text Output';
        convertBtn.textContent = 'Decode';
    }
    // Clear on swap
    inputText.value = outputText.value;
    outputText.value = '';
    errorMsg.classList.add('hidden');
    inputText.style.borderColor = '#bdc3c7';
}

modeEncodeBtn.addEventListener('click', () => {
    if (!isEncodeMode) setMode(true);
});

modeDecodeBtn.addEventListener('click', () => {
    if (isEncodeMode) setMode(false);
});

// Conversion Logic
convertBtn.addEventListener('click', () => {
    const input = inputText.value;
    if (!input) {
        outputText.value = '';
        return;
    }

    errorMsg.classList.add('hidden');
    inputText.style.borderColor = '#bdc3c7';

    try {
        if (isEncodeMode) {
            // Encode (handling utf-8 characters properly)
            const encoded = btoa(unescape(encodeURIComponent(input)));
            outputText.value = encoded;
        } else {
            // Decode
            const decoded = decodeURIComponent(escape(atob(input)));
            outputText.value = decoded;
        }
    } catch (e) {
        errorMsg.textContent = 'Invalid Input: Cannot process string.';
        errorMsg.classList.remove('hidden');
        inputText.style.borderColor = '#e74c3c';
        outputText.value = '';
    }
});

// Utilities
clearBtn.addEventListener('click', () => {
    inputText.value = '';
    outputText.value = '';
    errorMsg.classList.add('hidden');
    inputText.style.borderColor = '#bdc3c7';
});

copyBtn.addEventListener('click', () => {
    if (!outputText.value) return;
    
    navigator.clipboard.writeText(outputText.value).then(() => {
        const originalText = copyBtn.textContent;
        copyBtn.textContent = 'Copied!';
        copyBtn.style.backgroundColor = '#27ae60';
        
        setTimeout(() => {
            copyBtn.textContent = originalText;
            copyBtn.style.backgroundColor = '#27ae60'; // stay green a bit
        }, 500);
        
        setTimeout(() => {
            copyBtn.style.backgroundColor = '';
        }, 2000);
    });
});
