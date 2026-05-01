import { formatBytes, convertParquetToCsv, convertCsvToParquet } from './lib.js';

const modeParquetToCsvBtn = document.getElementById('modeParquetToCsvBtn');
const modeCsvToParquetBtn = document.getElementById('modeCsvToParquetBtn');
const fileInput = document.getElementById('fileInput');
const fileNameDisplay = document.getElementById('fileName');
const fileSizeDisplay = document.getElementById('fileSize');
const fileInfo = document.getElementById('fileInfo');
const convertBtn = document.getElementById('convertBtn');
const statusMsg = document.getElementById('statusMsg');
const previewSection = document.getElementById('previewSection');
const previewTable = document.getElementById('previewTable');
const resultSection = document.getElementById('resultSection');
const downloadBtn = document.getElementById('downloadBtn');

let currentMode = 'parquetToCsv';
let selectedFile = null;
let conversionResult = null;

function switchMode(mode) {
    currentMode = mode;
    modeParquetToCsvBtn.classList.toggle('active', mode === 'parquetToCsv');
    modeCsvToParquetBtn.classList.toggle('active', mode === 'csvToParquet');
    resetState();
}

function resetState() {
    selectedFile = null;
    conversionResult = null;
    fileInfo.classList.add('hidden');
    previewSection.classList.add('hidden');
    resultSection.classList.add('hidden');
    statusMsg.classList.add('hidden');
}

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        selectedFile = e.target.files[0];
        fileNameDisplay.textContent = selectedFile.name;
        fileSizeDisplay.textContent = formatBytes(selectedFile.size);
        fileInfo.classList.remove('hidden');
        convertBtn.disabled = false;
    }
});

convertBtn.addEventListener('click', async () => {
    if (!selectedFile) return;
    statusMsg.textContent = 'Converting...';
    statusMsg.classList.remove('hidden');
    
    try {
        if (currentMode === 'parquetToCsv') {
            const res = await convertParquetToCsv(selectedFile);
            conversionResult = { content: res.csv, filename: res.filename, type: res.type };
            displayPreview(res.data);
        } else {
            const res = await convertCsvToParquet(selectedFile);
            conversionResult = { content: res.data, filename: res.filename, type: res.type };
        }
        statusMsg.textContent = 'Conversion successful!';
        resultSection.classList.remove('hidden');
    } catch (err) {
        statusMsg.textContent = 'Error: ' + err.message;
    }
});

function displayPreview(data) {
    if (!data.length) return;
    const headers = Object.keys(data[0]);
    previewTable.innerHTML = '<thead><tr>' + headers.map(h => '<th>'+h+'</th>').join('') + '</tr></thead>' +
        '<tbody>' + data.map(row => '<tr>' + headers.map(h => '<td>'+row[h]+'</td>').join('') + '</tr>').join('') + '</tbody>';
    previewSection.classList.remove('hidden');
}

downloadBtn.addEventListener('click', () => {
    if (!conversionResult) return;
    const blob = new Blob([conversionResult.content], { type: conversionResult.type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = conversionResult.filename;
    a.click();
});

modeParquetToCsvBtn.addEventListener('click', () => switchMode('parquetToCsv'));
modeCsvToParquetBtn.addEventListener('click', () => switchMode('csvToParquet'));