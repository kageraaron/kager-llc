# PDF Signature Tool

A client-side tool to add simple signatures to PDF documents.

## Setup & Running

1.  **Clone the repository:**
    ```bash
    git clone <repository_url>
    cd pdf-signature-tool
    ```
2.  **Install dependencies:**
    This project relies on `pdf-lib` for client-side PDF manipulation.
    ```bash
    npm install pdf-lib
    ```
3.  **Open in browser:**
    You can run a simple local server or open `index.html` directly.
    ```bash
    # If using a simple HTTP server
    # python -m http.server 8000
    # Then open http://localhost:8000
    ```

## Usage

1.  Upload the PDF file you wish to sign.
2.  Choose to either draw your signature on a canvas or type text to be used as a signature.
3.  Adjust signature color and placement on the PDF preview.
4.  Click "Sign PDF" to apply the signature.
5.  Download the signed PDF.

## License

This project is licensed under the MIT License.
