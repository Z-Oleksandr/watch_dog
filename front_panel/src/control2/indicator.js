import * as THREE from "three";

export class Indicator {
    constructor(model, mixer) {
        this.model = model;
        this.mixer = mixer;
        this.state = false;
    }

    on() {
        const light_change = 20;
        animateEmission(this.model, light_change);
        this.state = true;
    }

    off() {
        const light_change = 1;
        animateEmission(this.model, light_change);
        this.state = false;
    }

    indi_toggle() {
        const light_change = this.state ? 1 : 20;
        changeEmissionStrength(this.model, light_change);
        this.state = !this.state;
    }
}

export let indicators = [];

export function updateIndiMixers(delta) {
    indicators.forEach((indi) => {
        indi.mixer.update(delta);
    });
}

export function changeEmissionStrength(model, intensity) {
    model.traverse((child) => {
        if (child.isMesh && child.name == "Sphere") {
            child.material.emissiveIntensity = intensity;
        }
    });
}
