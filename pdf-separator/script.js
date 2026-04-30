const pdfUpload = document.getElementById('pdfUpload');
const uploadSection = document.querySelector('.upload-section');
const fileInfoSection = document.getElementById('fileInfo');
const selectedFileName = document.getElementById('selectedFileName');
const totalPagesSpan = document.getElementById('totalPages');
const optionsSection = document.getElementById('optionsSection');
const splitAllRadio = document.getElementById('splitAll');
const splitRangeRadio = document.getElementById('splitRange');
const startPageInput = document.getElementById('startPage');
const endPageInput = document.getElementById('endPage');
const splitPdfBtn = document.getElementById('splitPdfBtn');
const downloadAllBtn = document.getElementById('downloadAllBtn');
const downloadLinksSection = document.getElementById('downloadLinksSection');
const downloadLinksList = document.getElementById('downloadLinksList');

let currentPdfBytes = null;
let currentPdfDocument = null;
let currentPdfName = '';
let splitPdfs = []; // Array to store { name, blob, bytes }

// --- File Upload & Drag-and-Drop ---
uploadSection.addEventListener('click', (e) => {
    if (e.target !== pdfUpload && e.target !== document.querySelector('.upload-button')) {
        pdfUpload.click();
    }
});

uploadSection.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadSection.style.borderColor = '#3498db';
    uploadSection.style.backgroundColor = '#ecf0f1';
});

uploadSection.addEventListener('dragleave', (e) => {
    e.preventDefault();
    uploadSection.style.borderColor = '#bdc3c7';
    uploadSection.style.backgroundColor = '#f8f9fa';
});

uploadSection.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadSection.style.borderColor = '#bdc3c7';
    uploadSection.style.backgroundColor = '#f8f9fa';
    if (e.dataTransfer.files.length) {
        handleFile(e.dataTransfer.files[0]);
    }
});

pdfUpload.addEventListener('change', (e) => {
    if (e.target.files.length) {
        handleFile(e.target.files[0]);
    }
});

async function handleFile(file) {
    if (file.type !== 'application/pdf') {
        alert('Please upload a valid PDF file.');
        return;
    }

    currentPdfName = file.name.replace('.pdf', '');
    selectedFileName.textContent = file.name;

    try {
        const arrayBuffer = await file.arrayBuffer();
        currentPdfBytes = new Uint8Array(arrayBuffer);
        currentPdfDocument = await PDFLib.PDFDocument.load(currentPdfBytes);
        
        const pageCount = currentPdfDocument.getPageCount();
        totalPagesSpan.textContent = pageCount;

        // Reset UI
        endPageInput.max = pageCount;
        startPageInput.max = pageCount;
        startPageInput.value = 1;
        endPageInput.value = pageCount;
        
        fileInfoSection.hidden = false;
        optionsSection.hidden = false;
        splitPdfBtn.disabled = false;
        downloadLinksSection.hidden = true;
        downloadAllBtn.hidden = true;
        downloadLinksList.innerHTML = '';
        splitPdfs = [];

    } catch (error) {
        console.error("Error loading PDF:", error);
        alert('Failed to load the PDF. It might be corrupted or password-protected.');
    }
}

// --- Radio Button Logic ---
splitAllRadio.addEventListener('change', () => {
    startPageInput.disabled = true;
    endPageInput.disabled = true;
});

splitRangeRadio.addEventListener('change', () => {
    startPageInput.disabled = false;
    endPageInput.disabled = false;
});

// --- Split Logic ---
splitPdfBtn.addEventListener('click', async () => {
    if (!currentPdfDocument) return;

    splitPdfBtn.disabled = true;
    splitPdfBtn.textContent = 'Processing...';
    downloadLinksList.innerHTML = '';
    splitPdfs = [];
    
    try {
        const pageCount = currentPdfDocument.getPageCount();
        let start = 1;
        let end = pageCount;

        if (splitRangeRadio.checked) {
            start = parseInt(startPageInput.value) || 1;
            end = parseInt(endPageInput.value) || pageCount;
            
            // Validate range
            if (start < 1) start = 1;
            if (end > pageCount) end = pageCount;
            if (start > end) {
                alert('Start page must be less than or equal to end page.');
                resetSplitButton();
                return;
            }
        }

        // Process pages
        for (let i = start - 1; i < end; i++) {
            const newPdf = await PDFLib.PDFDocument.create();
            const [copiedPage] = await newPdf.copyPages(currentPdfDocument, [i]);
            newPdf.addPage(copiedPage);

            const pdfBytes = await newPdf.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            
            const fileName = `${currentPdfName}_page_${i + 1}.pdf`;
            splitPdfs.push({ name: fileName, blob, bytes: pdfBytes });
            
            const url = URL.createObjectURL(blob);
            
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            a.textContent = `Download ${fileName}`;
            li.appendChild(a);
            downloadLinksList.appendChild(li);
        }

        downloadLinksSection.hidden = false;
        if (splitPdfs.length > 1) {
            downloadAllBtn.hidden = false;
        }

    } catch (error) {
        console.error("Error splitting PDF:", error);
        alert('An error occurred while splitting the PDF.');
    } finally {
        resetSplitButton();
    }
});

function resetSplitButton() {
    splitPdfBtn.disabled = false;
    splitPdfBtn.textContent = 'Split PDF';
}

// --- Download All Logic (JSZip) ---
downloadAllBtn.addEventListener('click', async () => {
    if (splitPdfs.length === 0) return;

    downloadAllBtn.disabled = true;
    downloadAllBtn.textContent = 'Zipping...';

    try {
        const zip = new JSZip();
        
        splitPdfs.forEach(pdf => {
            zip.file(pdf.name, pdf.bytes);
        });

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(zipBlob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `${currentPdfName}_separated.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error("Error creating ZIP:", error);
        alert('An error occurred while creating the ZIP file.');
    } finally {
        downloadAllBtn.disabled = false;
        downloadAllBtn.textContent = 'Download All Pages';
    }
});
