const imageUpload = document.getElementById('imageUpload');
const imageCanvas = document.getElementById('imageCanvas');
const imagePreviewContainer = document.getElementById('imagePreviewContainer');
const colorPickerOverlay = document.getElementById('colorPickerOverlay');
const colorInfoSection = document.getElementById('colorInfoSection');
const pickedColorDisplay = document.getElementById('pickedColorDisplay');
const hexValueSpan = document.getElementById('hexValue');
const rgbValueSpan = document.getElementById('rgbValue');
const hslValueSpan = document.getElementById('hslValue');
const resetBtn = document.getElementById('resetBtn');
const canvasContext = imageCanvas.getContext('2d');

let originalImage = null;

// --- Event Listeners ---
imageUpload.addEventListener('change', handleImageUpload);
imagePreviewContainer.addEventListener('click', handleCanvasClick);
colorInfoSection.addEventListener('click', handleColorValueCopy);
resetBtn.addEventListener('click', resetTool);

// --- Drag and Drop ---
const uploadSection = document.querySelector('.upload-section');
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    uploadSection.addEventListener(eventName, preventDefaults, false);
    uploadSection.style.borderColor = '#bdc3c7'; // Reset color
});

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

uploadSection.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleImageUpload({ target: { files } });
    }
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

// --- Image Handling ---
function handleImageUpload(event) {
    const files = event.target.files;
    if (files && files.length > 0) {
        const file = files[0];
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                originalImage = img;
                drawImageOnCanvas(img);
                imagePreviewContainer.hidden = false;
                colorInfoSection.hidden = true; // Hide color info until a color is picked
                resetBtn.hidden = false;
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
}

function drawImageOnCanvas(img) {
    const aspectRatio = img.width / img.height;
    const maxWidth = 700;
    const maxHeight = 500;

    let canvasWidth = img.width;
    let canvasHeight = img.height;

    if (canvasWidth > maxWidth) {
        canvasWidth = maxWidth;
        canvasHeight = canvasWidth / aspectRatio;
    }
    if (canvasHeight > maxHeight) {
        canvasHeight = maxHeight;
        canvasWidth = canvasHeight * aspectRatio;
    }

    imageCanvas.width = canvasWidth;
    imageCanvas.height = canvasHeight;
    canvasContext.drawImage(img, 0, 0, canvasWidth, canvasHeight);
}

// --- Color Picking ---
function handleCanvasClick(event) {
    if (!originalImage) return;

    const rect = imageCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const pixelData = canvasContext.getImageData(x, y, 1, 1).data;
    const [r, g, b] = pixelData;
    const rgba = `rgba(${r}, ${g}, ${b}, 1)`; // Alpha is 1 for opaque

    updateColorDisplay(r, g, b);
    colorInfoSection.hidden = false;
}

function updateColorDisplay(r, g, b) {
    const hex = rgbToHex(r, g, b);
    const hsl = rgbToHsl(r, g, b);

    pickedColorDisplay.style.backgroundColor = hex;
    hexValueSpan.textContent = hex;
    rgbValueSpan.textContent = `rgb(${r}, ${g}, ${b})`;
    hslValueSpan.textContent = `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;

    // Make color values copyable
    hexValueSpan.dataset.value = hex;
    rgbValueSpan.dataset.value = `rgb(${r}, ${g}, ${b})`;
    hslValueSpan.dataset.value = `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
}

// --- Color Conversion Utilities ---
function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
}

function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0; // achromatic
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

// --- Copy to Clipboard ---
function handleColorValueCopy(event) {
    const target = event.target;
    if (target.classList.contains('copyable')) {
        const value = target.dataset.value;
        navigator.clipboard.writeText(value).then(() => {
            const originalText = target.textContent;
            target.textContent = 'Copied!';
            setTimeout(() => {
                target.textContent = originalText;
            }, 1500);
        }).catch(err => {
            console.error('Failed to copy: ', err);
            alert('Could not copy text. Please copy manually.');
        });
    }
}

// --- Reset Functionality ---
function resetTool() {
    originalImage = null;
    imageCanvas.width = 0;
    imageCanvas.height = 0;
    canvasContext.clearRect(0, 0, imageCanvas.width, imageCanvas.height);
    imagePreviewContainer.hidden = true;
    colorInfoSection.hidden = true;
    resetBtn.hidden = true;
    imageUpload.value = ''; // Clear file input
}

// --- Initial State ---
imagePreviewContainer.hidden = true;
colorInfoSection.hidden = true;
resetBtn.hidden = true;
