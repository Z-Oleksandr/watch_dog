import * as THREE from "three";

export class Indicator {
    constructor(number, model, mixer) {
        this.number = number;
        this.model = model;
        this.mixer = mixer;
        this.state = false;
        this.blinking_state = false;
        this.interval;
    }

    on() {
        if (this.blinking_state) {
            clearInterval(this.interval);
            this.blinking_state = false;
        }
        const light_change = 20;
        changeEmissionStrength(this.model, light_change);
        this.state = true;
    }

    off() {
        if (this.blinking_state) {
            clearInterval(this.interval);
            this.blinking_state = false;
        }
        const light_change = 1;
        changeEmissionStrength(this.model, light_change);
        this.state = false;
    }

    indi_toggle() {
        const light_change = this.state ? 1 : 20;
        changeEmissionStrength(this.model, light_change);
        this.state = !this.state;
    }

    blinking() {
        console.log("Blinking");
        if (this.blinking_state) return;
        this.blinking_state = true;
        this.interval = setInterval(() => this.indi_toggle(), 500);
    }
}

export let indicators = [];

export function updateIndiMixers(delta) {
    indicators.forEach((indi) => {
        indi.mixer.update(delta);
    });
}

export function addIndicator(i, model, mixer) {
    const indicator = new Indicator(i, model, mixer);
    indicators.push(indicator);
    indicators.sort((a, b) => a.number - b.number);
}

export function changeEmissionStrength(model, intensity) {
    model.traverse((child) => {
        if (child.isMesh && child.name == "Sphere") {
            child.material.emissiveIntensity = intensity;
        }
    });
}
