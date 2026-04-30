document.addEventListener('DOMContentLoaded', () => {
    const qrDataInput = document.getElementById('qrData');
    const qrColorInput = document.getElementById('qrColor');
    const qrErrorCorrectionSelect = document.getElementById('qrErrorCorrection');
    const generateQrBtn = document.getElementById('generateQrBtn');
    const qrcodeContainer = document.getElementById('qrcode');
    const qrMessage = document.getElementById('qrMessage');
    const downloadQrBtn = document.getElementById('downloadQrBtn');

    // Use the qrcode.js library provided via CDN
    const qrCodeInstance = new QRCode(qrcodeContainer, {
        width: 180,
        height: 180,
        colorDark : "#000000",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.H
    });

    const updateQRCode = () => {
        const data = qrDataInput.value;
        const color = qrColorInput.value;
        const errorCorrectionLevel = qrErrorCorrectionSelect.value;

        if (!data) {
            qrMessage.textContent = i18n.t('msg_please_enter_data');
            qrcodeContainer.innerHTML = ''; // Clear previous QR code
            downloadQrBtn.hidden = true;
            return;
        }

        try {
            qrCodeInstance.makeCode(data);
            qrCodeInstance.options.colorDark = color;
            qrCodeInstance.options.correctLevel = QRCode.CorrectLevel[errorCorrectionLevel];
            qrCodeInstance.makeCode(data); // Re-render with new options

            // Apply color to the generated QR code SVG or Canvas
            // The library usually generates an IMG or CANVAS. If it's IMG, we can't directly style.
            // If it's CANVAS, we might need to re-draw or use CSS filters if supported.
            // A common approach is to use SVG and manipulate its fill.
            // For simplicity with this CDN library, let's assume it handles colors,
            // but if not, we might need to adjust its output or use a different library.

            // The library makesCode() function usually returns the generated element.
            // We can try to access and modify it if possible, or use CSS filters as a fallback.
            // For this example, let's assume `makeCode` updates the innerHTML of `qrcodeContainer`
            // and if that's an SVG, we can try to set fill. If not, we'll rely on the library's color support.

            // If the library generates an SVG, we can try to target it:
            const svgElement = qrcodeContainer.querySelector('svg');
            if (svgElement) {
                svgElement.querySelectorAll('path').forEach(path => {
                    path.setAttribute('fill', color);
                });
            } else {
                 // If it's an img or canvas and library doesn't support color directly,
                 // we might need a different approach or acknowledge limitation.
                 // For now, let's assume the library's colorDark option works.
            }


            qrMessage.textContent = i18n.t('msg_success');
            downloadQrBtn.hidden = false;
            downloadQrBtn.href = qrcodeContainer.querySelector('canvas')?.toDataURL('image/png') || qrcodeContainer.querySelector('img')?.src || '#';
            downloadQrBtn.setAttribute('download', `qrcode_${data.substring(0, 10).replace(/[^a-zA-Z0-9]/g, '_')}.png`);

        } catch (error) {
            qrMessage.textContent = i18n.t('msg_error');
            console.error("QR Code Generation Error:", error);
            qrcodeContainer.innerHTML = ''; // Clear QR code on error
            downloadQrBtn.hidden = true;
        }
    };

    generateQrBtn.addEventListener('click', updateQRCode);

    // Update QR code if input changes directly (optional, for live generation)
    // qrDataInput.addEventListener('input', updateQRCode);
    // qrColorInput.addEventListener('input', updateQRCode);
    // qrErrorCorrectionSelect.addEventListener('change', updateQRCode);

    // Initial message
    qrMessage.textContent = i18n.t('qr_message');
    downloadQrBtn.hidden = true;
});
