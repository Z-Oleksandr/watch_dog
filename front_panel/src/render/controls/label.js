import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry } from "three";

import { getTheme } from "../../util/theme.js";

const UNITS_PER_PX = 1 / 100;

/** A text plaque drawn on a canvas texture, placed beneath a control. */
export class Label {
    #canvas;
    #ctx;
    #texture;
    #mesh;
    #text;
    #width;
    #height;
    #fontSize;
    #borderWidth;

    constructor(text, { width = 200, height = 100, fontSize = 18, borderWidth = 4 } = {}) {
        this.#text = text;
        this.#width = width;
        this.#height = height;
        this.#fontSize = fontSize;
        this.#borderWidth = borderWidth;

        this.#canvas = document.createElement("canvas");
        this.#canvas.width = width;
        this.#canvas.height = height;
        this.#ctx = this.#canvas.getContext("2d");
        this.#texture = new CanvasTexture(this.#canvas);

        const geometry = new PlaneGeometry(width * UNITS_PER_PX, height * UNITS_PER_PX);
        const material = new MeshBasicMaterial({ map: this.#texture, transparent: true });
        this.#mesh = new Mesh(geometry, material);

        this.draw();
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(() => this.draw());
        }
    }

    get mesh() {
        return this.#mesh;
    }

    get text() {
        return this.#text;
    }

    setText(text) {
        this.#text = text;
        this.draw();
    }

    draw() {
        const theme = getTheme();
        const ctx = this.#ctx;
        const w = this.#width;
        const h = this.#height;
        const bw = this.#borderWidth;

        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = theme.lacquerWarm;
        ctx.fillRect(0, 0, w, h);

        if (bw > 0) {
            ctx.strokeStyle = theme.brass;
            ctx.lineWidth = bw;
            ctx.strokeRect(bw / 2, bw / 2, w - bw, h - bw);
            const inset = bw * 2.5;
            ctx.lineWidth = Math.max(1, bw / 3);
            ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
        }

        ctx.fillStyle = theme.cream;
        ctx.font = `600 ${this.#fontSize}px ${theme.fontBody}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(this.#text, w / 2, h / 2 + this.#fontSize * 0.08);
        this.#texture.needsUpdate = true;
    }

    dispose() {
        this.#texture.dispose();
        this.#mesh.geometry.dispose();
        this.#mesh.material.dispose();
    }
}
