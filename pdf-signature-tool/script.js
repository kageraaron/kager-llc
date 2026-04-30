// Ensure PDFLib and Fabric are loaded (via CDN in index.html)
const { PDFDocument } = PDFLib;

const pdfUploadInput = document.getElementById('pdfUpload');
const pdfCanvasContainer = document.getElementById('pdfCanvas');
const pdfCanvas = pdfCanvasContainer; // The canvas itself
const ctx = pdfCanvas.getContext('2d');

const signatureCanvas = document.getElementById('signatureCanvas');
const sigCtx = signatureCanvas.getContext('2d');
const clearSignatureBtn = document.getElementById('clearSignatureBtn');
const signatureColorInput = document.getElementById('signatureColor');
const textSignatureSection = document.getElementById('textSignatureSection');
const textSignatureInput = document.getElementById('textSignatureInput');
const signatureFontSelect = document.getElementById('signatureFont');
const textColorInput = document.getElementById('textColor');
const toggleSignatureTypeBtn = document.getElementById('toggleSignatureType');

const pdfPreviewContainer = document.getElementById('pdfPreviewContainer');
const signPdfBtn = document.getElementById('signPdfBtn');
const downloadSignedPdfBtn = document.getElementById('downloadSignedPdfBtn');
const uploadSection = document.querySelector('.upload-section');

let pdfDoc = null;
let currentPageNumber = 0; // 0-indexed page number
let currentScale = 1.0;
let pdfFileName = '';
let isDrawing = false;
let lastPoint = null;
let currentSignatureType = 'draw'; // 'draw' or 'text'
let fabricCanvas = null; // For text signature placement

// --- PDF Loading and Rendering ---
pdfUploadInput.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (file && file.type === 'application/pdf') {
        pdfFileName = file.name.replace('.pdf', '');
        const reader = new FileReader();
        reader.onload = async () => {
            const pdfBytes = reader.result;
            try {
                pdfDoc = await PDFDocument.load(pdfBytes);
                currentPageNumber = 0; // Start with the first page
                await renderPage(currentPageNumber);
                pdfPreviewContainer.hidden = false;
                signPdfBtn.disabled = false;
                downloadSignedPdfBtn.hidden = true;
                // Hide signature options initially, show after first page render
                document.getElementById('signatureOverlay').style.display = 'block';
                document.getElementById('textSignatureSection').hidden = true;
                document.getElementById('signaturePadContainer').hidden = false;
                currentSignatureType = 'draw';
                toggleSignatureTypeBtn.textContent = 'Use Text Signature';

            } catch (error) {
                alert("Error loading PDF. Please try again.");
                console.error("PDF Load Error:", error);
            }
        };
        reader.readAsArrayBuffer(file);
    } else if (file) {
        alert("Please upload a valid PDF file.");
    }
});

async function renderPage(pageNumber) {
    if (!pdfDoc) return;
    const pages = pdfDoc.getPages();
    if (pageNumber < 0 || pageNumber >= pages.length) return;

    const page = pages[pageNumber];
    const viewport = page.scale(currentScale); // Use scale from PDFPage

    pdfCanvas.height = viewport.height;
    pdfCanvas.width = viewport.width;

    const pdfContext = pdfCanvas.getContext('2d');
    const pdfImage = await page.render({
        canvasContext: pdfContext,
        viewport: viewport
    });

    // Setup signature canvas on top of PDF canvas
    setupSignatureOverlay(viewport.width, viewport.height);

    // Clear and redraw Fabric canvas if it exists
    if (fabricCanvas) {
        fabricCanvas.dispose();
        fabricCanvas = null;
    }
}

function setupSignatureOverlay(width, height) {
    // Adjust signature canvas and overlay size to match PDF page
    document.getElementById('signatureOverlay').style.width = `${width}px`;
    document.getElementById('signatureOverlay').style.height = `${height}px`;
    signatureCanvas.width = width;
    signatureCanvas.height = height;
    sigCtx.clearRect(0, 0, width, height); // Clear previous drawings

    // Initialize Fabric.js for text signatures
    if (!fabricCanvas) {
        fabricCanvas = new fabric.Canvas('signatureCanvas', {
            width: width,
            height: height,
            isDrawingMode: true // This sets it to drawing mode initially
        });
        // Set drawing color and line width from inputs
        fabricCanvas.freeDrawingBrush.color = signatureColorInput.value;
        fabricCanvas.freeDrawingBrush.width = 4; // Default drawing width

        fabricCanvas.on('path:created', () => {
            signPdfBtn.disabled = false; // Enable apply button when drawing
        });
    } else {
        fabricCanvas.setDimensions({ width: width, height: height });
        fabricCanvas.clear(); // Clear Fabric canvas
        fabricCanvas.freeDrawingBrush.color = signatureColorInput.value;
        fabricCanvas.freeDrawingBrush.width = 4;
        fabricCanvas.isDrawingMode = true; // Ensure it's in drawing mode
    }

    // Hide text signature section if it was previously shown
    textSignatureSection.hidden = true;
    signaturePadContainer.hidden = false;
    currentSignatureType = 'draw';
    toggleSignatureTypeBtn.textContent = 'Use Text Signature';
}


// --- Signature Drawing ---
clearSignatureBtn.addEventListener('click', () => {
    fabricCanvas.clear();
    signPdfBtn.disabled = true; // Disable until drawing or text is added
});

signatureColorInput.addEventListener('change', (e) => {
    if (fabricCanvas) {
        fabricCanvas.freeDrawingBrush.color = e.target.value;
    }
});

// --- Text Signature Handling ---
toggleSignatureTypeBtn.addEventListener('click', () => {
    if (currentSignatureType === 'draw') {
        // Switch to text mode
        currentSignatureType = 'text';
        signaturePadContainer.hidden = true;
        textSignatureSection.hidden = false;
        toggleSignatureTypeBtn.textContent = 'Use Drawn Signature';
        signPdfBtn.disabled = false; // Enable apply if text is typed
        updateTextSignature(); // Apply initial text/font/color if available
    } else {
        // Switch to draw mode
        currentSignatureType = 'draw';
        textSignatureSection.hidden = true;
        signaturePadContainer.hidden = false;
        toggleSignatureTypeBtn.textContent = 'Use Text Signature';
        // Re-enable drawing mode and clear if needed
        if (fabricCanvas) {
            fabricCanvas.isDrawingMode = true;
            // Re-apply color if it changed while in text mode
            fabricCanvas.freeDrawingBrush.color = signatureColorInput.value;
        }
    }
});

textSignatureInput.addEventListener('input', updateTextSignature);
signatureFontSelect.addEventListener('change', updateTextSignature);
textColorInput.addEventListener('change', updateTextSignature);

function updateTextSignature() {
    const text = textSignatureInput.value.trim();
    const font = signatureFontSelect.value;
    const color = textColorInput.value;

    if (fabricCanvas) {
        fabricCanvas.clear(); // Clear previous drawings/text
        if (text) {
            const textObject = new fabric.Text(text, {
                left: fabricCanvas.getWidth() / 2,
                top: fabricCanvas.getHeight() / 2,
                originX: 'center',
                originY: 'center',
                fontFamily: font,
                fill: color,
                fontSize: 50, // Default size, might need adjustment
                selectable: true, // Allow moving/resizing
                evented: true // Make it interactive
            });
            fabricCanvas.add(textObject);
            fabricCanvas.isDrawingMode = false; // Disable drawing mode for text
            signPdfBtn.disabled = false;
        } else {
            fabricCanvas.isDrawingMode = true; // Re-enable drawing mode if text is empty
            signPdfBtn.disabled = true;
        }
        fabricCanvas.renderAll();
    }
}

// --- Apply Signature and Download ---
signPdfBtn.addEventListener('click', async () => {
    if (!pdfDoc) {
        alert("Please upload a PDF first.");
        return;
    }

    signPdfBtn.disabled = true;
    signPdfBtn.textContent = 'Applying...';

    // Get the signature as an image data URL
    let signatureDataUrl = null;
    let signatureWidth = 0;
    let signatureHeight = 0;

    if (currentSignatureType === 'draw') {
        // For drawn signatures, use Fabric.js canvas
        signatureDataUrl = fabricCanvas.toDataURL({
            format: 'png',
            quality: 1 // highest quality
        });
        signatureWidth = fabricCanvas.getWidth();
        signatureHeight = fabricCanvas.getHeight();
    } else {
        // For text signatures, draw it onto a temporary canvas
        const text = textSignatureInput.value.trim();
        const font = signatureFontSelect.value;
        const color = textColorInput.value;
        if (text) {
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            tempCanvas.width = 300; // Adjust as needed
            tempCanvas.height = 100; // Adjust as needed
            tempCtx.font = `50px ${font}`; // Needs to match fabric font size approx
            tempCtx.fillStyle = color;
            tempCtx.textAlign = 'center';
            tempCtx.textBaseline = 'middle';
            tempCtx.fillText(text, tempCanvas.width / 2, tempCanvas.height / 2);

            signatureDataUrl = tempCanvas.toDataURL('image/png');
            signatureWidth = tempCanvas.width;
            signatureHeight = tempCanvas.height;
        }
    }

    if (!signatureDataUrl) {
        alert("No signature created. Please draw or type one.");
        signPdfBtn.textContent = 'Apply Signature';
        signPdfBtn.disabled = false;
        return;
    }

    try {
        const signatureImageBytes = await fetch(signatureDataUrl).then(res => res.arrayBuffer());
        const signatureImage = await pdfDoc.embedPng(signatureImageBytes);

        const pages = pdfDoc.getPages();
        if (currentPageNumber >= pages.length) {
            alert("Error: Current page number is invalid.");
            return;
        }
        const page = pages[currentPageNumber];

        // Get the PDF page dimensions for scaling
        const { width, height } = page.getSize();

        // Scale the signature image to fit a reasonable portion of the page
        const scaleFactor = Math.min(width, height) * 0.25 / signatureImage.height; // Signature height is 25% of smaller page dimension
        const scaledSignatureWidth = signatureImage.width * scaleFactor;
        const scaledSignatureHeight = signatureImage.height * scaleFactor;

        // Position the signature on the bottom right of the page (adjust as needed)
        const signatureX = width - scaledSignatureWidth - 20; // 20px margin from right
        const signatureY = height - scaledSignatureHeight - 20; // 20px margin from bottom

        page.drawImage(signatureImage, {
            x: signatureX,
            y: signatureY,
            width: scaledSignatureWidth,
            height: scaledSignatureHeight,
        });

        // Re-render the page with the signature
        await renderPage(currentPageNumber);
        // The signature overlay will be re-drawn by renderPage, so hide it for now.
        document.getElementById('signatureOverlay').style.display = 'none';


        downloadSignedPdfBtn.hidden = false;
        downloadSignedPdfBtn.disabled = false; // Enable download
        signPdfBtn.textContent = 'Signature Applied';
        signPdfBtn.disabled = true; // Already applied, can't apply again

    } catch (error) {
        console.error("Error applying signature:", error);
        alert(`Error applying signature: ${error.message}`);
        signPdfBtn.textContent = 'Apply Signature';
        signPdfBtn.disabled = false;
    }
});

downloadSignedPdfBtn.addEventListener('click', async () => {
    if (!pdfDoc) return;

    try {
        const pdfBytes = await pdfDoc.save();
        const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(pdfBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${pdfFileName}_signed.pdf`;
        link.click();

        // Clean up
        URL.revokeObjectURL(url);
        downloadSignedPdfBtn.hidden = true;
        signPdfBtn.textContent = 'Signature Applied';
        signPdfBtn.disabled = true;
        pdfDoc = null; // Reset document for next upload
        pdfUploadInput.value = ''; // Clear file input

    } catch (error) {
        console.error("Error downloading PDF:", error);
        alert(`Error downloading PDF: ${error.message}`);
    }
});

// Navigation buttons (add these if you implement page navigation)
// For now, assuming only the first page is editable
// const prevPageBtn = document.getElementById('prevPageBtn');
// const nextPageBtn = document.getElementById('nextPageBtn');

// prevPageBtn.addEventListener('click', () => {
//     if (currentPageNumber > 0) {
//         currentPageNumber--;
//         renderPage(currentPageNumber);
//     }
// });

// nextPageBtn.addEventListener('click', () => {
//     if (pdfDoc && currentPageNumber < pdfDoc.getPageCount() - 1) {
//         currentPageNumber++;
//         renderPage(currentPageNumber);
//     }
// });


// Initial setup
pdfUploadInput.value = ''; // Clear any previous file selection
signPdfBtn.disabled = true;
downloadSignedPdfBtn.hidden = true;
