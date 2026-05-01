const imageUpload = document.getElementById('imageUpload');
const dropZone = document.getElementById('dropZone');
const uploadLabel = document.querySelector('.upload-label');
const workspace = document.getElementById('workspace');
const imageCanvas = document.getElementById('imageCanvas');
const selectionBox = document.getElementById('selectionBox');
const removeWatermarkBtn = document.getElementById('removeWatermarkBtn');
const resetBtn = document.getElementById('resetBtn');
const downloadBtn = document.getElementById('downloadBtn');
const instructionText = document.getElementById('instructionText');

const ctx = imageCanvas.getContext('2d', { willReadFrequently: true });

let originalImage = null;
let canvasScaleFactor = 1;

// Selection state
let isSelecting = false;
let startX = 0;
let startY = 0;
let selRect = { x: 0, y: 0, width: 0, height: 0 };

// --- Drag and Drop Handling ---
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => uploadLabel.classList.add('dragover'), false);
});

['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => uploadLabel.classList.remove('dragover'), false);
});

dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length) handleFile(files[0]);
});

imageUpload.addEventListener('change', (e) => {
    if (e.target.files.length) handleFile(e.target.files[0]);
});

function handleFile(file) {
    if (!file.type.startsWith('image/')) {
        alert("Please upload an image file.");
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            originalImage = img;
            initWorkspace();
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function initWorkspace() {
    dropZone.classList.add('hidden');
    workspace.classList.remove('hidden');
    downloadBtn.classList.add('hidden');
    removeWatermarkBtn.classList.remove('hidden');
    
    // Calculate display scale
    const maxWidth = document.querySelector('.canvas-wrapper').clientWidth;
    const maxHeight = window.innerHeight * 0.6;
    
    let displayWidth = originalImage.width;
    let displayHeight = originalImage.height;

    const ratio = Math.min(maxWidth / displayWidth, maxHeight / displayHeight);
    
    if (ratio < 1) {
        displayWidth = originalImage.width * ratio;
        displayHeight = originalImage.height * ratio;
    }

    // Set canvas dimensions to ACTUAL image dimensions for processing
    imageCanvas.width = originalImage.width;
    imageCanvas.height = originalImage.height;
    
    // Apply CSS dimensions for display
    imageCanvas.style.width = displayWidth + 'px';
    imageCanvas.style.height = displayHeight + 'px';
    
    canvasScaleFactor = originalImage.width / displayWidth;

    resetCanvas();
}

function resetCanvas() {
    ctx.drawImage(originalImage, 0, 0);
    clearSelection();
    downloadBtn.classList.add('hidden');
    removeWatermarkBtn.classList.remove('hidden');
    removeWatermarkBtn.disabled = true;
    instructionText.innerText = "Draw a box around the watermark to remove it";
}

resetBtn.addEventListener('click', resetCanvas);

// --- Selection Logic ---
imageCanvas.addEventListener('mousedown', (e) => {
    const rect = imageCanvas.getBoundingClientRect();
    // Coordinates relative to CSS display size
    const cssX = e.clientX - rect.left;
    const cssY = e.clientY - rect.top;
    
    startX = cssX;
    startY = cssY;
    isSelecting = true;
    
    selectionBox.style.left = cssX + 'px';
    selectionBox.style.top = cssY + 'px';
    selectionBox.style.width = '0px';
    selectionBox.style.height = '0px';
    selectionBox.classList.remove('hidden');
    removeWatermarkBtn.disabled = true;
});

window.addEventListener('mousemove', (e) => {
    if (!isSelecting) return;
    
    const rect = imageCanvas.getBoundingClientRect();
    let cssX = e.clientX - rect.left;
    let cssY = e.clientY - rect.top;
    
    // Clamp to canvas bounds
    cssX = Math.max(0, Math.min(cssX, rect.width));
    cssY = Math.max(0, Math.min(cssY, rect.height));

    const width = Math.abs(cssX - startX);
    const height = Math.abs(cssY - startY);
    const left = Math.min(cssX, startX);
    const top = Math.min(cssY, startY);

    selectionBox.style.left = left + 'px';
    selectionBox.style.top = top + 'px';
    selectionBox.style.width = width + 'px';
    selectionBox.style.height = height + 'px';
    
    // Store actual canvas pixel coordinates for processing
    selRect = {
        x: Math.floor(left * canvasScaleFactor),
        y: Math.floor(top * canvasScaleFactor),
        width: Math.ceil(width * canvasScaleFactor),
        height: Math.ceil(height * canvasScaleFactor)
    };
});

window.addEventListener('mouseup', () => {
    if (isSelecting) {
        isSelecting = false;
        if (selRect.width > 5 && selRect.height > 5) {
            removeWatermarkBtn.disabled = false;
        } else {
            clearSelection();
        }
    }
});

function clearSelection() {
    selectionBox.classList.add('hidden');
    selRect = { x: 0, y: 0, width: 0, height: 0 };
    removeWatermarkBtn.disabled = true;
}

// --- Watermark Removal Algorithm (Inpainting / Smart Blur) ---
removeWatermarkBtn.addEventListener('click', () => {
    if (selRect.width === 0 || selRect.height === 0) return;
    
    instructionText.innerText = "Processing...";
    removeWatermarkBtn.disabled = true;
    
    // Use a small timeout to allow UI to update to "Processing..."
    setTimeout(() => {
        applyWatermarkRemoval();
        clearSelection();
        instructionText.innerText = "Watermark removed. You can download the image.";
        removeWatermarkBtn.classList.add('hidden');
        downloadBtn.classList.remove('hidden');
    }, 50);
});

function applyWatermarkRemoval() {
    const imgData = ctx.getImageData(0, 0, imageCanvas.width, imageCanvas.height);
    const data = imgData.data;
    
    const { x, y, width, height } = selRect;
    
    // Fast box blur over the selected area heavily mixed with edge colors
    const blurRadius = 15; 
    const iterations = 4;  
    
    for (let iter = 0; iter < iterations; iter++) {
        const tempData = new Uint8ClampedArray(data);
        
        for (let cy = y; cy < y + height; cy++) {
            for (let cx = x; cx < x + width; cx++) {
                let r = 0, g = 0, b = 0, a = 0, count = 0;
                
                // Sample surrounding pixels
                for (let dy = -blurRadius; dy <= blurRadius; dy++) {
                    for (let dx = -blurRadius; dx <= blurRadius; dx++) {
                        let sx = cx + dx;
                        let sy = cy + dy;
                        
                        // If sample point is outside image, skip
                        if (sx < 0 || sx >= imageCanvas.width || sy < 0 || sy >= imageCanvas.height) continue;
                        
                        const index = (sy * imageCanvas.width + sx) * 4;
                        r += tempData[index];
                        g += tempData[index + 1];
                        b += tempData[index + 2];
                        a += tempData[index + 3];
                        count++;
                    }
                }
                
                const outIndex = (cy * imageCanvas.width + cx) * 4;
                data[outIndex] = r / count;
                data[outIndex + 1] = g / count;
                data[outIndex + 2] = b / count;
                data[outIndex + 3] = a / count;
            }
        }
    }
    
    ctx.putImageData(imgData, 0, 0);
}

// --- Download Handling ---
downloadBtn.addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = 'watermark-removed.png';
    link.href = imageCanvas.toDataURL('image/png', 1.0);
    link.click();
});
