import * as THREE from "three";

export class Label {
    constructor(text, options = {}) {
        this.text = text;
        this.width = options.width || 200;
        this.height = options.height || 100;
        this.fontSize = options.fontSize || 18;
        this.backgroundColor = options.backgroundColor || "#14120c";
        this.borderColor = options.borderColor || "#c9a227";
        this.borderWidth = options.borderWidth || 4;
        this.textColor = options.textColor || "#f2e8c9";

        this.canvas = document.createElement("canvas");
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.context = this.canvas.getContext("2d");

        this.texture = new THREE.CanvasTexture(this.canvas);

        const geometry = new THREE.PlaneGeometry(
            this.width / 100,
            this.height / 100
        );
        const material = new THREE.MeshBasicMaterial({
            map: this.texture,
            transparent: true,
        });
        this.mesh = new THREE.Mesh(geometry, material);

        this.drawText();
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(() => this.drawText());
        }
    }

    drawText() {
        const ctx = this.context;

        ctx.clearRect(0, 0, this.width, this.height);

        ctx.fillStyle = this.backgroundColor;
        ctx.fillRect(0, 0, this.width, this.height);

        if (this.borderWidth > 0) {
            ctx.strokeStyle = this.borderColor;
            ctx.lineWidth = this.borderWidth;
            ctx.strokeRect(
                this.borderWidth / 2,
                this.borderWidth / 2,
                this.width - this.borderWidth,
                this.height - this.borderWidth
            );
            const inset = this.borderWidth * 2.5;
            ctx.lineWidth = Math.max(1, this.borderWidth / 3);
            ctx.strokeRect(
                inset,
                inset,
                this.width - inset * 2,
                this.height - inset * 2
            );
        }

        ctx.fillStyle = this.textColor;
        ctx.font = `600 ${this.fontSize}px 'Josefin Sans', sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(this.text, this.width / 2, this.height / 2 + this.fontSize * 0.08);

        this.texture.needsUpdate = true;
    }

    updateText(newText) {
        this.text = newText;
        this.drawText();
    }

    getMesh() {
        return this.mesh;
    }
}
