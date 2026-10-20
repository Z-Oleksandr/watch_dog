import {
    AmbientLight,
    CanvasTexture,
    DirectionalLight,
    OrthographicCamera,
    Raycaster,
    SRGBColorSpace,
    Scene,
    Vector2,
    WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { drawSunburstTexture } from "../gauge/drawing.js";

const MAX_DPR = 2;
const FRUSTUM_HALF_W = 26;
const FRUSTUM_HALF_H = 7;
const KEY_LIGHT = 0xffe0b0;
const FILL_LIGHT = 0x50452f;

/**
 * Builds the WebGL scene for the control panel.
 * @param {HTMLCanvasElement} canvas
 * @param {{ width: number, height: number }} size
 */
export function createScene(canvas, { width, height }) {
    const scene = new Scene();

    const camera = new OrthographicCamera(
        -FRUSTUM_HALF_W,
        FRUSTUM_HALF_W,
        FRUSTUM_HALF_H,
        -FRUSTUM_HALF_H,
        0.01,
        1000
    );
    camera.position.set(0, 1, 5);
    camera.lookAt(0, 0, 0);

    const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: "low-power" });
    renderer.setPixelRatio(Math.min(MAX_DPR, window.devicePixelRatio || 1));
    renderer.setSize(width, height, false);

    const background = new CanvasTexture(drawSunburstTexture(1024));
    background.colorSpace = SRGBColorSpace;
    scene.background = background;
    scene.backgroundIntensity = 0.9;

    const keyLight = new DirectionalLight(KEY_LIGHT, 7);
    keyLight.position.set(-5, 5, 5).normalize();
    scene.add(keyLight);
    scene.add(new AmbientLight(FILL_LIGHT, 18));

    return {
        scene,
        camera,
        renderer,
        loader: new GLTFLoader(),
        raycaster: new Raycaster(),
        pointer: new Vector2(),
        background,
        dispose() {
            background.dispose();
            renderer.dispose();
        },
    };
}

/**
 * Loads a GLTF file as a promise; the loader's callback API otherwise makes
 * the error path easy to forget.
 * @param {GLTFLoader} loader
 * @param {string} url
 */
export function loadGltf(loader, url) {
    return new Promise((resolve, reject) => {
        loader.load(url, resolve, undefined, (err) =>
            reject(
                err instanceof Error
                    ? err
                    : new Error(`failed to load ${url}: ${err && err.message}`)
            )
        );
    });
}

/** Releases geometry, materials and textures below an object. */
export function disposeObject(object) {
    object.traverse((child) => {
        if (child.geometry) {
            child.geometry.dispose();
        }
        const materials = Array.isArray(child.material)
            ? child.material
            : child.material
              ? [child.material]
              : [];
        for (const material of materials) {
            for (const value of Object.values(material)) {
                if (
                    value &&
                    typeof value === "object" &&
                    typeof value.dispose === "function" &&
                    value.isTexture
                ) {
                    value.dispose();
                }
            }
            material.dispose();
        }
    });
}
