// Live Clock
const currentEpochEl = document.getElementById('currentEpoch');
const currentDateStrEl = document.getElementById('currentDateStr');

function updateLiveClock() {
    const now = new Date();
    const epoch = Math.floor(now.getTime() / 1000);
    currentEpochEl.textContent = epoch;
    currentDateStrEl.textContent = now.toLocaleString();
}

setInterval(updateLiveClock, 1000);
updateLiveClock();

// Epoch to Date Conversion
const epochInput = document.getElementById('epochInput');
const convertEpochBtn = document.getElementById('convertEpochBtn');
const localResult = document.getElementById('localResult');
const utcResult = document.getElementById('utcResult');
const isoResult = document.getElementById('isoResult');
const epochErrorMsg = document.getElementById('epochErrorMsg');

function convertEpochToDate() {
    const val = epochInput.value.trim();
    if (!val) return;

    // Handle both seconds and milliseconds
    let epoch = parseInt(val, 10);
    if (isNaN(epoch)) {
        epochErrorMsg.classList.remove('hidden');
        return;
    }
    epochErrorMsg.classList.add('hidden');

    // If it looks like seconds (e.g. 1714521600), convert to ms
    // A 10-digit number is typically seconds until year 2286
    if (epoch < 100000000000) {
        epoch *= 1000;
    }

    const d = new Date(epoch);
    if (isNaN(d.getTime())) {
        epochErrorMsg.classList.remove('hidden');
        localResult.value = '';
        utcResult.value = '';
        isoResult.value = '';
        return;
    }

    localResult.value = d.toLocaleString();
    utcResult.value = d.toUTCString();
    isoResult.value = d.toISOString();
}

convertEpochBtn.addEventListener('click', convertEpochToDate);

// Date to Epoch Conversion
const dateInput = document.getElementById('dateInput');
const convertDateBtn = document.getElementById('convertDateBtn');
const epochResult = document.getElementById('epochResult');
const msResult = document.getElementById('msResult');

function convertDateToEpoch() {
    const val = dateInput.value;
    if (!val) return;

    const d = new Date(val);
    if (isNaN(d.getTime())) {
        return;
    }

    const ms = d.getTime();
    const sec = Math.floor(ms / 1000);

    epochResult.value = sec;
    msResult.value = ms;
}

convertDateBtn.addEventListener('click', convertDateToEpoch);

// Set default value for date input to current local time
const tzOffset = (new Date()).getTimezoneOffset() * 60000;
const localISOTime = (new Date(Date.now() - tzOffset)).toISOString().slice(0, 16);
dateInput.value = localISOTime;
