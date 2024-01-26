# pdf-viewer

A robust PDF viewer implemented as a web component. Based on [PDF.js by Mozilla](https://mozilla.github.io/pdf.js/).

Some of the features includes:
  * Easy to use. Just include the script file and include the <pdf-viewer> tag.
  * Double buffered flicker-free rendering.
  * Handles large PDF documents (tested up to 1GB)

## How to use

Include the script like this: 
>`<script type="module" src="pdf-viewer.js"></script>`

and then use the viewer in your HTML page like this:

>`<pdf-viewer src="document.pdf" page="1" rotation="0" scale="1.0"></pdf-viewer>`

