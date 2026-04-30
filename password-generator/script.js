const passwordResult = document.getElementById('passwordResult');
const copyBtn = document.getElementById('copyBtn');
const pwdLength = document.getElementById('pwdLength');
const lengthVal = document.getElementById('lengthVal');
const includeUpper = document.getElementById('includeUpper');
const includeLower = document.getElementById('includeLower');
const includeNumbers = document.getElementById('includeNumbers');
const includeSymbols = document.getElementById('includeSymbols');
const generateBtn = document.getElementById('generateBtn');

const UPPERCASE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWERCASE_CHARS = 'abcdefghijklmnopqrstuvwxyz';
const NUMBER_CHARS = '0123456789';
const SYMBOL_CHARS = '!@#$%^&*()_+~`|}{[]:;?><,./-=';

// Update length display
pwdLength.addEventListener('input', () => {
    lengthVal.textContent = pwdLength.value;
});

// Generate random number using Crypto API
function getSecureRandom(max) {
    const array = new Uint32Array(1);
    window.crypto.getRandomValues(array);
    return array[0] % max;
}

function generatePassword() {
    let charPool = '';
    
    if (includeUpper.checked) charPool += UPPERCASE_CHARS;
    if (includeLower.checked) charPool += LOWERCASE_CHARS;
    if (includeNumbers.checked) charPool += NUMBER_CHARS;
    if (includeSymbols.checked) charPool += SYMBOL_CHARS;

    if (charPool === '') {
        alert('Please select at least one character type.');
        return;
    }

    const length = parseInt(pwdLength.value);
    let password = '';
    
    // Ensure at least one of each selected type is included
    if (includeUpper.checked) password += UPPERCASE_CHARS[getSecureRandom(UPPERCASE_CHARS.length)];
    if (includeLower.checked) password += LOWERCASE_CHARS[getSecureRandom(LOWERCASE_CHARS.length)];
    if (includeNumbers.checked) password += NUMBER_CHARS[getSecureRandom(NUMBER_CHARS.length)];
    if (includeSymbols.checked) password += SYMBOL_CHARS[getSecureRandom(SYMBOL_CHARS.length)];

    // Fill the rest randomly
    for (let i = password.length; i < length; i++) {
        password += charPool[getSecureRandom(charPool.length)];
    }

    // Shuffle the password so guaranteed characters aren't always at the start
    password = password.split('').sort(() => getSecureRandom(3) - 1).join('');

    passwordResult.value = password;
}

// Copy to clipboard
copyBtn.addEventListener('click', () => {
    if (!passwordResult.value) return;
    
    navigator.clipboard.writeText(passwordResult.value).then(() => {
        const originalText = copyBtn.textContent;
        copyBtn.textContent = 'Copied!';
        copyBtn.style.backgroundColor = '#27ae60';
        
        setTimeout(() => {
            copyBtn.textContent = originalText;
            copyBtn.style.backgroundColor = '#95a5a6';
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy!', err);
    });
});

// Initial generation
generateBtn.addEventListener('click', generatePassword);

// Generate on load
generatePassword();
