import './pdf-viewer';
import * as pdfjs from "pdfjs-dist";

pdfjs.GlobalWorkerOptions.workerSrc = "dist/pdf.worker.bundle.js";