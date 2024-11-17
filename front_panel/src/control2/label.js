import * as THREE from "three";

export class Label {
    constructor(text, options = {}) {
        this.text = text;
        this.width = options.width || 200;
        this.height = options.height || 100;
        this.fontSize = options.fontSize || 18;
        this.backgroundColor = options.backgroundColor || "#ffffff";
        this.borderColor = options.borderColor || "#000000";
        this.borderWidth = options.borderWidth || 4;
        this.textColor = options.textColor || "#000000";

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
    }

    drawText() {
        const ctx = this.context;

        ctx.clearRect(0, 0, this.width, this.height);

        ctx.fillStyle = this.backgroundColor;
        ctx.fillRect(0, 0, this.width, this.height);

        if (this.borderWidth > 0) {
            ctx.strokeStyle = this.borderColor;
            ctx.lineWidth = this.borderWidth;
            ctx.strokeRect(0, 0, this.width, this.height);
        }

        ctx.fillStyle = this.textColor;
        ctx.font = `800 ${this.fontSize}px orbitron`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(this.text, this.width / 2, this.height / 2);

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
