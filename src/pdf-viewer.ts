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

const scrollbarWidth = (function getScrollBarWidth() {
    var inner = document.createElement('p');
    inner.style.width = "100%";
    inner.style.height = "200px";

    var outer = document.createElement('div');
    outer.style.position = "absolute";
    outer.style.top = "0px";
    outer.style.left = "0px";
    outer.style.visibility = "hidden";
    outer.style.width = "200px";
    outer.style.height = "150px";
    outer.style.overflow = "hidden";
    outer.appendChild(inner);

    document.body.appendChild(outer);
    var w1 = inner.offsetWidth;
    outer.style.overflow = 'scroll';
    var w2 = inner.offsetWidth;
    if (w1 == w2) w2 = outer.clientWidth;

    document.body.removeChild(outer);

    return (w1 - w2);
}());

class PdfViewer extends HTMLElement implements HTMLElement{

    private pdf? :PDFDocumentProxy;
    private page? :PDFPageProxy;
    private viewport?:PageViewport;
    private resizeObserver?:ResizeObserver;

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
                    display: block;
                    overflow: hidden;
                }
                
                #container {
                    position: relative;
                    width: 100%;
                    height: 100%;
                    background-color: rgba(0,0,0,0.15);                    
                    border: 1px solid rgba(0,0,0,0.15);
                }
                
                #shadow-overlay {
                    position: absolute;
                    pointer-events: none;
                    top:0;
                    left:0;
                    right:${scrollbarWidth};
                    bottom:${scrollbarWidth};
                    z-index:1000;
                    box-shadow: inset 0px 0px 8px 8px rgba(0,0,0,0.5);
                }
                
                #scroll-container {
                    position: absolute;
                    display: grid;
                    place-items: center;
                    top:0;
                    left:0;
                    right:0;
                    bottom:0;
                    overflow: auto;
                    z-index: 1;
                    scrollbar-color: rgba(255, 255, 255, 0.5) rgba(0,0,0,0.15);
                }
                
                @keyframes spin {
                    from { transform: rotate(var(--start-rotation, 0deg)); }
                    to { transform: rotate(var(--rotation, 0deg)); }
                }
                
                .animate-rotation {
                    animation-name: spin;
                    animation-duration: var(--duration, 0s);
                    animation-timing-function: ease-in-out;
                    animation-fill-mode: forwards;
                }
                               
                canvas { 
                    box-shadow: 0 3px 6px #0004; 
                    border-radius: 0px; 
                    transform: rotate(var(--rotation, 0deg));
                }
                                
                canvas.frontbuffer {
                    display: inline;
                }
                
                canvas.backbuffer {
                    display: none;
                }
                
              </style>
              <div id="container">
                  <div id="shadow-overlay"></div>
                  <div id="scroll-container">
                    <canvas id="canvasA" class="frontbuffer"></canvas>
                    <canvas id="canvasB" class="backbuffer"></canvas>
                  </div>
              </div>
            `;

            const container = this.shadowRoot.querySelector('#scroll-container');
            if (container) {
                this.resizeObserver = new ResizeObserver(() => {
                    this.adjustOverlayForScrollbars();
                });
                this.resizeObserver.observe(container);
            }

            window.addEventListener('resize', () => this.adjustOverlayForScrollbars());
        }
    }

    disconnectedCallback() {
        if (this.resizeObserver && this.shadowRoot) {
            this.resizeObserver.disconnect();
        }
        window.removeEventListener('resize', () => this.adjustOverlayForScrollbars());
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
            .then(() => this.dispatchEvent(new CustomEvent("onpagechanged", {bubbles: true, cancelable: false, detail: {page: this.pageNumber}})))
            .then(() => this.dispatchEvent(new CustomEvent("onsrcchanged", {bubbles: true, cancelable: false, detail: {src}})));
    }

    async setPage(page:number) {
        this.pageNumber = page;
        if (this.pdf) await this.render();
        this.dispatchEvent(new CustomEvent("onpagechanged", {bubbles: true, cancelable: false, detail: {page}}));
    }

    async setRotation(rotation:number) {

        const rotateCanvas = (canvas : HTMLCanvasElement | null, rotationStart : number, rotationEnd : number, duration : number) => {
            if (canvas)  {
                canvas.style.setProperty('--start-rotation', `${rotationStart}deg`);
                canvas.style.setProperty('--rotation', `${rotationEnd}deg`);
                canvas.style.setProperty('--duration', `${duration}s`);
                canvas.classList.add('animate-rotation')
                canvas.addEventListener('animationend', () => {
                     canvas.classList.remove('animate-rotation');
                }, {once: true});
            }
        };

        const rotationStart:number = this.rotation;
        const rotationEnd:number = rotation;
        const duration = 0.5; //Math.abs(rotationEnd - rotationStart) / 180;


        rotateCanvas(this.shadowRoot?.querySelector("canvas.backbuffer") as HTMLCanvasElement | null, rotationStart, rotationEnd, duration);
        rotateCanvas(this.shadowRoot?.querySelector("canvas.frontbuffer") as HTMLCanvasElement | null, rotationStart, rotationEnd, duration);

        this.rotation = rotation;
    }

    async setScale(scale:number) {
        this.scale = scale;
        if (this.pdf) await this.render();
        this.dispatchEvent(new CustomEvent("onscalechanged", {bubbles: true, cancelable: false, detail: {scale}}))
    }

    adjustOverlayForScrollbars() {
        const container:HTMLDivElement | null | undefined = this.shadowRoot?.querySelector('#scroll-container');
        const overlay:HTMLDivElement | null | undefined = this.shadowRoot?.querySelector('#shadow-overlay');

        if (!container || !overlay) return;

        // Reset styles to default
        overlay.style.right = '0';
        overlay.style.bottom = '0';

        // Detect scrollbars
        const hasVerticalScrollbar = container.scrollHeight > container.clientHeight;
        const hasHorizontalScrollbar = container.scrollWidth > container.clientWidth;

        // Adjust overlay or container padding based on scrollbar presence
        if (hasVerticalScrollbar) {
            overlay.style.right = `${scrollbarWidth - 0.5}px`;
        }
        if (hasHorizontalScrollbar) {
            overlay.style.bottom = `${scrollbarWidth - 0.5}px`;
        }
    }

    async render() {

        if (this.pdf) {

            if (this.renderTask) await this.renderTask.promise;

            this.page = await this.pdf.getPage(this.pageNumber);
            const outputScale = window.devicePixelRatio || 1;
            this.viewport = this.page.getViewport({
                scale: this.scale,
                rotation: 0
            });
            const transform = [outputScale, 0, 0, outputScale, 0, 0];

            const canvas:HTMLCanvasElement | null = this.shadowRoot?.querySelector("canvas.backbuffer") as HTMLCanvasElement | null

            if (canvas) {

                canvas.width = Math.floor(this.viewport.width * outputScale);
                canvas.height = Math.floor(this.viewport.height * outputScale);
                //canvas.style.transform = `rotate(${this.rotation}deg)`;
                canvas.style.width = Math.floor(this.viewport.width) + "px";
                canvas.style.height = Math.floor(this.viewport.height) + "px";

                const ctx = canvas.getContext("2d");
                const renderCtx:RenderParameters = {
                    canvasContext: ctx!,
                    transform: transform,
                    viewport: this.viewport
                };

                this.renderTask = this.page.render(renderCtx);
                this.renderTask.promise.then(() => this.flipCanvas()).then(() => {
                    this.dispatchEvent(new CustomEvent("onrenderdone", {bubbles: true, cancelable: false}));
                });
                return this.renderTask.promise;
            }
        }

        return Promise.reject("Missing PDF");
    }
}

customElements.define("pdf-viewer", PdfViewer);
