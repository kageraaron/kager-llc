// --- File Upload and List Management ---
const pdfUploadInput = document.getElementById('pdfUpload');
const pdfFileListUl = document.getElementById('pdfFileList');
const mergePdfBtn = document.getElementById('mergePdfBtn');
const downloadPdfBtn = document.getElementById('downloadPdfBtn');
const uploadSection = document.querySelector('.upload-section');

let pdfFiles = []; // Stores File objects

// Prevent default drag behaviors
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    uploadSection.addEventListener(eventName, preventDefaults, false);
    uploadSection.style.borderColor = '#bdc3c7'; // Reset color
});

// Highlight drop area when dragging over
['dragenter', 'dragover'].forEach(eventName => {
    uploadSection.addEventListener(eventName, () => {
        uploadSection.style.borderColor = '#3498db';
    });
});

['dragleave', 'drop'].forEach(eventName => {
    uploadSection.addEventListener(eventName, () => {
        uploadSection.style.borderColor = '#bdc3c7';
    });
});


function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

pdfUploadInput.addEventListener('change', handleFiles);
uploadSection.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    handleFiles({ target: { files } });
});

function handleFiles(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach(file => {
        if (file.type === "application/pdf") {
            pdfFiles.push(file);
            renderFileList();
        } else {
            alert(`Skipping file: ${file.name}. Only PDF files are supported.`);
        }
    });
    updateButtonState();
}

function renderFileList() {
    pdfFileListUl.innerHTML = ''; // Clear current list
    pdfFiles.forEach((file, index) => {
        const li = document.createElement('li');
        li.innerHTML = `
            <div class="file-info">
                <span class="file-icon">📄</span>
                <span class="file-name">${file.name}</span>
            </div>
            <div class="file-actions">
                <button class="move-up-btn" data-index="${index}">⬆️</button>
                <button class="move-down-btn" data-index="${index}">⬇️</button>
                <button class="remove-btn" data-index="${index}">❌</button>
            </div>
        `;
        pdfFileListUl.appendChild(li);
    });
    addEventListenersToFileActions();
}

function addEventListenersToFileActions() {
    document.querySelectorAll('.remove-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const indexToRemove = parseInt(e.target.dataset.index);
            pdfFiles.splice(indexToRemove, 1);
            renderFileList();
            updateButtonState();
        });
    });

    document.querySelectorAll('.move-up-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const indexToMove = parseInt(e.target.dataset.index);
            if (indexToMove > 0) {
                [pdfFiles[indexToMove], pdfFiles[indexToMove - 1]] = [pdfFiles[indexToMove - 1], pdfFiles[indexToMove]];
                renderFileList();
                updateButtonState();
            }
        });
    });

    document.querySelectorAll('.move-down-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const indexToMove = parseInt(e.target.dataset.index);
            if (indexToMove < pdfFiles.length - 1) {
                [pdfFiles[indexToMove], pdfFiles[indexToMove + 1]] = [pdfFiles[indexToMove + 1], pdfFiles[indexToMove]];
                renderFileList();
                updateButtonState();
            }
        });
    });
}

function updateButtonState() {
    if (pdfFiles.length >= 2) { // Need at least 2 files to merge
        mergePdfBtn.disabled = false;
    } else {
        mergePdfBtn.disabled = true;
    }
}

// --- PDF Merging Logic ---
mergePdfBtn.addEventListener('click', async () => {
    if (pdfFiles.length < 2) {
        alert("Please select at least two PDF files to merge.");
        return;
    }

    mergePdfBtn.disabled = true;
    mergePdfBtn.textContent = 'Merging...';
    downloadPdfBtn.hidden = true;

    try {
        const mergedDoc = await PDFLib.PDFDocument.create();

        for (const file of pdfFiles) {
            const pdfBytes = await file.arrayBuffer();
            const pdfDoc = await PDFLib.PDFDocument.load(pdfBytes);

            const copiedPages = await mergedDoc.copyPages(pdfDoc, pdfDoc.getPageIndices());
            copiedPages.forEach(page => mergedDoc.addPage(page));
        }

        const pdfBytes = await mergedDoc.save();
        const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(pdfBlob);

        downloadPdfBtn.href = url;
        downloadPdfBtn.hidden = false;
        downloadPdfBtn.textContent = 'Download Merged PDF';
        mergePdfBtn.textContent = 'Merge PDFs'; // Reset button text
        alert('PDFs merged successfully!');

    } catch (error) {
        console.error("Error merging PDFs:", error);
        alert(`Error merging PDFs: ${error.message}`);
        mergePdfBtn.textContent = 'Merge PDFs'; // Reset button text on error
        mergePdfBtn.disabled = false; // Re-enable if error occurred
    }
});

// --- Download Button Logic ---
// The href is set dynamically when merging is complete.
// We can add a click handler to ensure it triggers the download properly.
downloadPdfBtn.addEventListener('click', () => {
    // The URL is already set by the mergePdfBtn listener.
    // We can add a small delay to ensure the browser has time to process.
    setTimeout(() => {
        URL.revokeObjectURL(downloadPdfBtn.href); // Clean up object URL after download
        downloadPdfBtn.hidden = true; // Hide after download initiated
        mergePdfBtn.disabled = false; // Re-enable merge button
        pdfFiles = []; // Clear the list after successful merge and download
        renderFileList(); // Update UI to show empty list
    }, 500);
});

// Initialize the file list and button state on page load
renderFileList();
updateButtonState();
