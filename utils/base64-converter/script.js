import { base64Encode, base64Decode } from './lib.js';

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
        inputLabel.textContent = i18n.t('input_label_plain');
        outputLabel.textContent = i18n.t('output_label_base64');
        convertBtn.textContent = i18n.t('convert_btn_encode');
    } else {
        modeDecodeBtn.classList.add('active');
        modeEncodeBtn.classList.remove('active');
        inputLabel.textContent = i18n.t('input_label_base64');
        outputLabel.textContent = i18n.t('output_label_plain');
        convertBtn.textContent = i18n.t('convert_btn_decode');
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
            outputText.value = base64Encode(input);
        } else {
            outputText.value = base64Decode(input);
        }
    } catch (e) {
        errorMsg.textContent = i18n.t('error_invalid');
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
        copyBtn.textContent = i18n.t('copied');
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
