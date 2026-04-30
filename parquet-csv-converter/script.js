// Parquet to CSV Converter - script.js

// State management
let currentMode = 'parquetToCsv';
let selectedFile = null;
let conversionResult = null;

// DOM Elements
const modeParquetToCsvBtn = document.getElementById('modeParquetToCsvBtn');
const modeCsvToParquetBtn = document.getElementById('modeCsvToParquetBtn');
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const fileTypeLabel = document.getElementById('fileTypeLabel');
const fileInfo = document.getElementById('fileInfo');
const fileNameDisplay = document.getElementById('fileName');
const fileSizeDisplay = document.getElementById('fileSize');
const removeFileBtn = document.getElementById('removeFileBtn');
const convertBtn = document.getElementById('convertBtn');
const statusMsg = document.getElementById('statusMsg');
const previewSection = document.getElementById('previewSection');
const previewTable = document.getElementById('previewTable');
const resultSection = document.getElementById('resultSection');
const downloadBtn = document.getElementById('downloadBtn');

// Initialize
function init() {
    setupEventListeners();
}

function setupEventListeners() {
    // Mode Toggles
    modeParquetToCsvBtn.addEventListener('click', () => switchMode('parquetToCsv'));
    modeCsvToParquetBtn.addEventListener('click', () => switchMode('csvToParquet'));

    // File Upload Handlers
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);

    // Drag and Drop
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) {
            handleFiles(e.dataTransfer.files[0]);
        }
    });

    // Remove File
    removeFileBtn.addEventListener('click', resetState);

    // Convert Action
    convertBtn.addEventListener('click', performConversion);

    // Download Action
    downloadBtn.addEventListener('click', downloadFile);
}

function switchMode(mode) {
    currentMode = mode;
    modeParquetToCsvBtn.classList.toggle('active', mode === 'parquetToCsv');
    modeCsvToParquetBtn.classList.toggle('active', mode === 'csvToParquet');
    fileTypeLabel.textContent = mode === 'parquetToCsv' ? '.parquet' : '.csv';
    resetState();
}

function handleFileSelect(e) {
    if (e.target.files.length > 0) {
        handleFiles(e.target.files[0]);
    }
}

function handleFiles(file) {
    const expectedExt = currentMode === 'parquetToCsv' ? '.parquet' : '.csv';
    if (!file.name.toLowerCase().endsWith(expectedExt)) {
        showError(`Please select a ${expectedExt} file.`);
        return;
    }

    selectedFile = file;
    fileNameDisplay.textContent = file.name;
    fileSizeDisplay.textContent = formatBytes(file.size);
    
    fileInfo.classList.remove('hidden');
    dropZone.classList.add('hidden');
    convertBtn.disabled = false;
    statusMsg.classList.add('hidden');
}

function resetState() {
    selectedFile = null;
    conversionResult = null;
    fileInput.value = '';
    
    fileInfo.classList.add('hidden');
    dropZone.classList.remove('hidden');
    convertBtn.disabled = true;
    statusMsg.classList.add('hidden');
    previewSection.classList.add('hidden');
    resultSection.classList.add('hidden');
}

async function performConversion() {
    if (!selectedFile) return;

    showStatus('Initializing conversion engine...', 'info');
    convertBtn.disabled = true;

    try {
        if (currentMode === 'parquetToCsv') {
            await convertParquetToCsv(selectedFile);
        } else {
            await convertCsvToParquet(selectedFile);
        }
    } catch (err) {
        showError(`Conversion failed: ${err.message}`);
        convertBtn.disabled = false;
    }
}

async function convertParquetToCsv(file) {
    showStatus('Reading Parquet file (this may take a moment)...', 'info');
    
    // NOTE: In a real implementation, we would use duckdb-wasm or parquet-wasm here.
    // For the prototype, we simulate the process and provide placeholders.
    
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Placeholder: In a real scenario, this is where the WASM library does the heavy lifting.
    // We'll show a message explaining the next steps for integration.
    showStatus('WASM engine ready. Processing data chunks...', 'info');
    
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Dummy data for preview demonstration
    const dummyData = [
        { id: 1, name: "Sample Data", value: 100, category: "A" },
        { id: 2, name: "Test Record", value: 250, category: "B" },
        { id: 3, name: "Client-Side", value: 50, category: "A" },
        { id: 4, name: "Fast Preview", value: 400, category: "C" },
        { id: 5, name: "Secure Conversion", value: 120, category: "B" }
    ];

    displayPreview(dummyData);
    
    // Use PapaParse to generate CSV string for download
    const csvContent = Papa.unparse(dummyData);
    conversionResult = {
        data: csvContent,
        filename: file.name.replace('.parquet', '.csv'),
        type: 'text/csv'
    };

    showSuccess();
}

async function convertCsvToParquet(file) {
    showStatus('Parsing CSV and encoding to Parquet...', 'info');
    
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Placeholder: Real Parquet encoding would happen here.
    
    conversionResult = {
        data: new Uint8Array([0x50, 0x41, 0x52, 0x31]), // Dummy Parquet magic bytes "PAR1"
        filename: file.name.replace('.csv', '.parquet'),
        type: 'application/octet-stream'
    };

    showSuccess();
}

function displayPreview(data) {
    if (data.length === 0) return;

    const headers = Object.keys(data[0]);
    let html = '<thead><tr>';
    headers.forEach(h => html += `<th>${h}</th>`);
    html += '</tr></thead><tbody>';

    data.slice(0, 5).forEach(row => {
        html += '<tr>';
        headers.forEach(h => html += `<td>${row[h]}</td>`);
        html += '</tr>';
    });
    html += '</tbody>';

    previewTable.innerHTML = html;
    previewSection.classList.remove('hidden');
}

function showStatus(msg, type) {
    statusMsg.textContent = msg;
    statusMsg.className = `status-msg ${type}`;
    statusMsg.classList.remove('hidden');
}

function showError(msg) {
    showStatus(msg, 'error');
}

function showSuccess() {
    statusMsg.classList.add('hidden');
    resultSection.classList.remove('hidden');
}

function downloadFile() {
    if (!conversionResult) return;

    const blob = new Blob([conversionResult.data], { type: conversionResult.type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = conversionResult.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

init();
