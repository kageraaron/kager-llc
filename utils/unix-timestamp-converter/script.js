import { epochToDate, dateToEpoch } from './lib.js';

const currentEpochEl = document.getElementById('currentEpoch');
const currentDateStrEl = document.getElementById('currentDateStr');

function updateLiveClock() {
    const now = new Date();
    currentEpochEl.textContent = Math.floor(now.getTime() / 1000);
    currentDateStrEl.textContent = now.toLocaleString();
}

setInterval(updateLiveClock, 1000);
updateLiveClock();

const epochInput = document.getElementById('epochInput');
const convertEpochBtn = document.getElementById('convertEpochBtn');
const localResult = document.getElementById('localResult');
const utcResult = document.getElementById('utcResult');
const isoResult = document.getElementById('isoResult');
const epochErrorMsg = document.getElementById('epochErrorMsg');

convertEpochBtn.addEventListener('click', () => {
    const d = epochToDate(epochInput.value.trim());
    if (!d) {
        epochErrorMsg.classList.remove('hidden');
        return;
    }
    epochErrorMsg.classList.add('hidden');
    localResult.value = d.toLocaleString();
    utcResult.value = d.toUTCString();
    isoResult.value = d.toISOString();
});

const dateInput = document.getElementById('dateInput');
const convertDateBtn = document.getElementById('convertDateBtn');
const epochResult = document.getElementById('epochResult');
const msResult = document.getElementById('msResult');

convertDateBtn.addEventListener('click', () => {
    const res = dateToEpoch(dateInput.value);
    if (!res) return;
    epochResult.value = res.seconds;
    msResult.value = res.milliseconds;
});

const tzOffset = (new Date()).getTimezoneOffset() * 60000;
dateInput.value = (new Date(Date.now() - tzOffset)).toISOString().slice(0, 16);