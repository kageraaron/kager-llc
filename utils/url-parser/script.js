import { parseURL, updateURLParam } from './lib.js';

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

function updateUI() {
    const rawUrl = urlInput.value.trim();
    if (!rawUrl) {
        parsedResults.classList.add('hidden');
        urlError.classList.add('hidden');
        return;
    }

    const parsed = parseURL(rawUrl);
    if (!parsed) {
        urlError.classList.remove('hidden');
        parsedResults.classList.add('hidden');
        return;
    }

    urlError.classList.add('hidden');
    parsedResults.classList.remove('hidden');

    compProtocol.value = parsed.protocol;
    compHostname.value = parsed.hostname;
    compPort.value = parsed.port;
    compPathname.value = parsed.pathname;
    compHash.value = parsed.hash;

    queryParamsBody.innerHTML = '';
    if (parsed.params.length === 0) {
        queryParamsTable.classList.add('hidden');
        noParamsMsg.classList.remove('hidden');
    } else {
        queryParamsTable.classList.remove('hidden');
        noParamsMsg.classList.add('hidden');

        parsed.params.forEach(([key, value]) => {
            const tr = document.createElement('tr');
            const tdKey = document.createElement('td');
            const keyInput = document.createElement('input');
            keyInput.type = 'text';
            keyInput.value = key;
            keyInput.readOnly = true;
            tdKey.appendChild(keyInput);

            const tdVal = document.createElement('td');
            const valInput = document.createElement('input');
            valInput.type = 'text';
            valInput.value = value;
            valInput.addEventListener('input', (e) => {
                urlInput.value = updateURLParam(urlInput.value, key, e.target.value);
            });
            tdVal.appendChild(valInput);

            tr.appendChild(tdKey);
            tr.appendChild(tdVal);
            queryParamsBody.appendChild(tr);
        });
    }
}

urlInput.addEventListener('input', updateUI);
updateUI();