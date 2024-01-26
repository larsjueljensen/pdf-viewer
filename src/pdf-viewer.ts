import * as pdfjs from "pdfjs-dist"
import {PageViewport, PDFDocumentProxy, PDFPageProxy, RenderTask} from "pdfjs-dist"
import {RenderParameters, PDFDocumentLoadingTask, OnProgressParameters} from "pdfjs-dist/types/src/display/api";
import workerContents from "pdfjs-dist/build/pdf.worker.min.mjs"

if (typeof window !== "undefined" && 'Worker' in window) {
    pdfjs.GlobalWorkerOptions.workerPort = new Worker(
        URL.createObjectURL(new Blob([workerContents], {type: "text/javascript"})),
        {type: 'module'}
    );
}

declare global {
    interface HTMLElement {
        connectedCallback?(): void;
        disconnectedCallback?(): void;
        adoptedCallback?(): void;
        attributeChangedCallback?(name: string, oldValue: string | null, newValue: string | null): void;
    }
}

class PdfViewer extends HTMLElement implements HTMLElement{

    private pdf? :PDFDocumentProxy;
    private page? :PDFPageProxy;
    private viewport?:PageViewport;

    private pageNumber: number;
    private rotation: number;
    private scale: number;
    private renderTask: RenderTask | undefined;

    static get observedAttributes(): string[] {
        return ["src", "page", "rotation", "scale"]
    }

    constructor() {
        super();
        this.pageNumber = 1;
        this.rotation = 0;
        this.scale = 1;
    }

    get numPages(): number | undefined {
        if (this.pdf) {
            return this.pdf.numPages;
        }
    }

    connectedCallback() {

        this.attachShadow({mode: "open"});

        if (this.shadowRoot) {
            this.shadowRoot.innerHTML = `
              <style>
                :host {
                    display: flex;
                    overflow: auto;
                    padding: 10px;
                }
                                
                #container { margin: auto; }
                #component { }
                canvas { 
                    box-shadow: 0 3px 6px #0004; 
                    border-radius: 0px; 
                }
                                
                canvas.frontbuffer {
                    display: inline;
                }
                
                canvas.backbuffer {
                    display: none;
                }
                
              </style>    
              <div id="container">
                  <div id="component">
                    <canvas id="canvasA" class="frontbuffer"></canvas>
                    <canvas id="canvasB" class="backbuffer"></canvas>
                  </div>
              </div>
            `;

        }
    }

    flipCanvas() {
        if (this.shadowRoot) {
            this.shadowRoot.querySelectorAll("canvas").forEach(
                (canvas) => {
                    canvas.classList.toggle("frontbuffer");
                    canvas.classList.toggle("backbuffer");
                }
            )
        }
    }

    attributeChangedCallback(attr: string, oldValue: string | null, newValue: string | null) {

        const hasChanged = (attributeName:string) => {
            return attr.toLowerCase() === attributeName.toLowerCase() && newValue != null && newValue !== oldValue;
        }

        if (hasChanged("src")) { this.setSrc(newValue!).catch(console.log); }
        if (hasChanged("page")) { this.setPage(Number(newValue)).catch(console.log); }
        if (hasChanged("rotation")) { this.setRotation(Number(newValue)).catch(console.log); }
        if (hasChanged("scale")) { this.setScale(Number(newValue)).catch(console.log); }

    }

    async browse(step:number) {
        const wantedPageNumber = this.pageNumber + step;
        const newPageNumber = Math.max(1, Math.min(this.numPages || 0, wantedPageNumber));
        this.setAttribute("page", String(newPageNumber));
    }

    async setSrc(src: string | URL | undefined) {

        if (this.pdf) {
            await this.pdf.destroy();
            this.setAttribute("page", "1");
        }

        const loadingTask : PDFDocumentLoadingTask = pdfjs.getDocument({
            url: src,
            disableStream: true,
            disableAutoFetch: true
        });

        loadingTask.promise
            .then(pdfDocument => this.pdf = pdfDocument)
            .then(() => this.render())
            .then(() => console.log(`PDF Document [${src}] loaded and rendered`));
    }

    async setPage(page:number) {
        this.pageNumber = page;
        if (this.pdf) await this.render();
    }

    async setRotation(rotation:number) {
        this.rotation = rotation;
        if (this.pdf) await this.render();
    }

    async setScale(scale:number) {
        this.scale = scale;
        if (this.pdf) await this.render();
    }

    async render() {

        if (this.pdf) {

            if (this.renderTask) await this.renderTask.promise;

            this.page = await this.pdf.getPage(this.pageNumber);
            const outputScale = window.devicePixelRatio || 1;
            this.viewport = this.page.getViewport({
                scale: this.scale,
                rotation: this.rotation
            });
            const transform = [outputScale, 0, 0, outputScale, 0, 0];

            const canvas:HTMLCanvasElement | null = this.shadowRoot?.querySelector("canvas.backbuffer") as HTMLCanvasElement | null

            if (canvas) {

                canvas.width = Math.floor(this.viewport.width * outputScale);
                canvas.height = Math.floor(this.viewport.height * outputScale);
                canvas.style.width = Math.floor(this.viewport.width) + "px";
                canvas.style.height = Math.floor(this.viewport.height) + "px";

                const ctx = canvas.getContext("2d");
                const renderCtx:RenderParameters = {
                    canvasContext: ctx!,
                    transform: transform,
                    viewport: this.viewport
                };

                this.renderTask = this.page.render(renderCtx);
                this.renderTask.promise.then(() => this.flipCanvas());
                return this.renderTask.promise;
            }
        }

        return Promise.reject("Missing PDF");
    }
}

customElements.define("pdf-viewer", PdfViewer);
