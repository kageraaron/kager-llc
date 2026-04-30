const urlInput = document.getElementById('urlInput');
const urlError = document.getElementById('urlError');
const parsedResults = document.getElementById('parsedResults');

const compProtocol = document.getElementById('compProtocol');
const compHostname = document.getElementById('compHostname');
const compPort = document.getElementById('compPort');
const compPathname = document.getElementById('compPathname');
const compHash = document.getElementById('compHash');

const queryParamsBody = document.getElementById('queryParamsBody');
const noParamsMsg = document.getElementById('noParamsMsg');
const queryParamsTable = document.getElementById('queryParamsTable');

let currentUrlObj = null;

function parseUrl() {
    const rawUrl = urlInput.value.trim();
    if (!rawUrl) {
        parsedResults.classList.add('hidden');
        urlError.classList.add('hidden');
        urlInput.style.borderColor = '#bdc3c7';
        return;
    }

    try {
        currentUrlObj = new URL(rawUrl);
        urlError.classList.add('hidden');
        urlInput.style.borderColor = '#bdc3c7';
        parsedResults.classList.remove('hidden');

        // Populate components
        compProtocol.value = currentUrlObj.protocol;
        compHostname.value = currentUrlObj.hostname;
        compPort.value = currentUrlObj.port || (currentUrlObj.protocol === 'https:' ? '443' : '80');
        compPathname.value = currentUrlObj.pathname;
        compHash.value = currentUrlObj.hash;

        // Populate Query Params
        queryParamsBody.innerHTML = '';
        const params = Array.from(currentUrlObj.searchParams.entries());

        if (params.length === 0) {
            queryParamsTable.classList.add('hidden');
            noParamsMsg.classList.remove('hidden');
        } else {
            queryParamsTable.classList.remove('hidden');
            noParamsMsg.classList.add('hidden');

            params.forEach(([key, value]) => {
                const tr = document.createElement('tr');
                
                const tdKey = document.createElement('td');
                const keyInput = document.createElement('input');
                keyInput.type = 'text';
                keyInput.value = key;
                keyInput.readOnly = true; // Key editing is complex for this simple tool
                tdKey.appendChild(keyInput);

                const tdVal = document.createElement('td');
                const valInput = document.createElement('input');
                valInput.type = 'text';
                valInput.value = value;
                valInput.addEventListener('input', (e) => updateParam(key, e.target.value));
                tdVal.appendChild(valInput);

                tr.appendChild(tdKey);
                tr.appendChild(tdVal);
                queryParamsBody.appendChild(tr);
            });
        }
    } catch (e) {
        urlError.classList.remove('hidden');
        urlInput.style.borderColor = '#e74c3c';
        parsedResults.classList.add('hidden');
    }
}

function updateParam(key, newValue) {
    if (!currentUrlObj) return;
    currentUrlObj.searchParams.set(key, newValue);
    // Update the main input visually
    const oldPos = urlInput.selectionStart;
    urlInput.value = currentUrlObj.toString();
    // Don't re-parse entirely to avoid losing focus
}

urlInput.addEventListener('input', parseUrl);

// Try to parse initial empty state
parseUrl();
