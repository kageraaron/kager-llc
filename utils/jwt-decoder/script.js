import { decodeJWT } from './lib.js';

const jwtInput = document.getElementById('jwtInput');
const headerOutput = document.getElementById('headerOutput');
const payloadOutput = document.getElementById('payloadOutput');
const errorMsg = document.getElementById('errorMsg');
const clearBtn = document.getElementById('clearBtn');

function updateUI() {
    const token = jwtInput.value.trim();
    if (!token) {
        headerOutput.textContent = '{}';
        payloadOutput.textContent = '{}';
        errorMsg.classList.add('hidden');
        return;
    }

    const decoded = decodeJWT(token);
    
    if (!decoded) {
        showError();
        return;
    }

    headerOutput.textContent = JSON.stringify(decoded.header, null, 4);
    payloadOutput.textContent = JSON.stringify(decoded.payload, null, 4);
    errorMsg.classList.add('hidden');
}

function showError() {
    headerOutput.textContent = 'Invalid Data';
    payloadOutput.textContent = 'Invalid Data';
    errorMsg.classList.remove('hidden');
}

jwtInput.addEventListener('input', updateUI);

clearBtn.addEventListener('click', () => {
    jwtInput.value = '';
    updateUI();
    jwtInput.focus();
});