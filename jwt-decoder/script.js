const jwtInput = document.getElementById('jwtInput');
const headerOutput = document.getElementById('headerOutput');
const payloadOutput = document.getElementById('payloadOutput');
const errorMsg = document.getElementById('errorMsg');
const clearBtn = document.getElementById('clearBtn');

function base64UrlDecode(str) {
    // Replace non-url compatible chars with base64 standard chars
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    // Pad with standard base64 required padding characters
    const pad = str.length % 4;
    if (pad) {
        if (pad === 1) {
            throw new Error('InvalidLengthError: Input base64url string is the wrong length to determine padding');
        }
        str += new Array(5 - pad).join('=');
    }
    // Decode base64 to string using UTF-8 support
    return decodeURIComponent(escape(atob(str)));
}

function decodeJWT() {
    const token = jwtInput.value.trim();
    if (!token) {
        headerOutput.textContent = '{}';
        payloadOutput.textContent = '{}';
        errorMsg.classList.add('hidden');
        return;
    }

    const parts = token.split('.');
    
    if (parts.length !== 3) {
        showError();
        return;
    }

    try {
        const headerJson = JSON.parse(base64UrlDecode(parts[0]));
        const payloadJson = JSON.parse(base64UrlDecode(parts[1]));

        headerOutput.textContent = JSON.stringify(headerJson, null, 4);
        payloadOutput.textContent = JSON.stringify(payloadJson, null, 4);
        errorMsg.classList.add('hidden');
    } catch (e) {
        showError();
    }
}

function showError() {
    headerOutput.textContent = 'Invalid Data';
    payloadOutput.textContent = 'Invalid Data';
    errorMsg.classList.remove('hidden');
}

// Live decoding
jwtInput.addEventListener('input', decodeJWT);

// Clear button
clearBtn.addEventListener('click', () => {
    jwtInput.value = '';
    decodeJWT();
    jwtInput.focus();
});
