# PDF Assembler

A client-side tool to merge multiple PDF files into a single document.

## Setup & Running

1.  **Clone the repository:**
    ```bash
    git clone <repository_url>
    cd pdf-assembler
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

1.  Use the file input or drag-and-drop to upload multiple PDF files.
2.  Arrange the files in the desired merge order using drag-and-drop or arrow buttons.
3.  Click the "Merge PDFs" button to start the process.
4.  Download the combined PDF file.

## License

This project is licensed under the MIT License.
