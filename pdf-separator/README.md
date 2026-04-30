# PDF Separator

A client-side tool to split a multi-page PDF into individual PDF files per page.

## Setup & Running

1.  **Clone the repository:**
    ```bash
    git clone <repository_url>
    cd pdf-separator
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

1.  Upload a multi-page PDF file using the file input or drag-and-drop.
2.  Choose whether to split all pages or specify a range.
3.  Click the "Split PDF" button.
4.  Download the individual PDF files for each page.

## License

This project is licensed under the MIT License.
