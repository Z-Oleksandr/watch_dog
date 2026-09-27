import { AnimationMixer, Box3, Clock, LoopOnce } from "three";

import { log } from "../../util/logger.js";
import { Button } from "./button.js";
import { Indicator } from "./indicator.js";
import { Label } from "./label.js";
import { createScene, disposeObject, loadGltf } from "./scene.js";
import { ToggleSwitch } from "./toggle_switch.js";

const MODELS = Object.freeze({
    toggle: "models/switch/switch1.gltf",
    button: "models/button/button1.gltf",
    indicator: "models/indicators/indicator2.gltf",
    indicatorRed: "models/indicators/indicator2_red.gltf",
});

const CONTROL_COUNT = 3;
const CONTROL_SPACING_X = 6.9;
const TOGGLE_START_X = -22;
const BUTTON_START_X = 22;
const LABEL_Y = -4;
const BUTTON_SCALE = 2.369;
const BUTTON_ANIM_SPEED = 4.2;
const INDICATOR_SCALE = 0.69;
const INDICATOR_TOP_Y = 3.9;
const INDICATOR_SPACING_Y = 3.7;
const INDICATOR_LABEL_OFFSET_Y = 1.88;
const INDICATOR_LABELS = ["conn", "stby", "error"];
const CONTROL_LABEL = { width: 590, height: 120, fontSize: 85, borderWidth: 5 };
const INDICATOR_LABEL = { width: 260, height: 92, fontSize: 63, borderWidth: 5 };
const CONTENT_MARGIN = 1.08;
const MAX_DELTA_S = 0.1;
/** Frames rendered after the last animation ends, so clamped poses settle. */
const IDLE_TAIL_FRAMES = 2;

/**
 * The 3D control panel: three toggles, three buttons, three indicator lamps.
 * Renders on demand (while an animation runs or a redraw was requested) and
 * never while the tab is hidden.
 */
export class ControlPanel {
    #root;
    #ctx;
    #abort = new AbortController();
    #clock = new Clock();
    #rafId = null;
    #tailFrames = 0;
    #contentHalfW = 26;
    #contentHalfH = 7;
    #resizeObserver = null;
    #contextLost = false;
    #onUnassigned;

    buttons = [];
    toggles = [];
    indicators = [];
    /** Resolves to true when every model loaded, false when the panel is degraded. */
    ready;

    /**
     * @param {HTMLElement} root  The `.control2` container.
     * @param {HTMLCanvasElement} canvas
     * @param {{ onUnassigned?: (kind: string) => void }} [options]
     */
    constructor(root, canvas, { onUnassigned } = {}) {
        this.#root = root;
        this.#onUnassigned = onUnassigned || (() => {});
        this.#ctx = createScene(canvas, { width: root.clientWidth, height: root.clientHeight });

        const { signal } = this.#abort;
        canvas.addEventListener("click", (e) => this.#onClick(e), { signal });
        canvas.addEventListener(
            "webglcontextlost",
            (e) => {
                e.preventDefault();
                this.#contextLost = true;
                log.warn("controls", "WebGL context lost");
                this.#stopLoop();
            },
            { signal }
        );
        canvas.addEventListener(
            "webglcontextrestored",
            () => {
                this.#contextLost = false;
                log.info("controls", "WebGL context restored");
                this.requestRender();
            },
            { signal }
        );
        document.addEventListener(
            "visibilitychange",
            () => {
                if (document.visibilityState === "hidden") {
                    this.#stopLoop();
                } else {
                    this.requestRender();
                }
            },
            { signal }
        );

        this.#fitFrustum();
        if (globalThis.ResizeObserver) {
            this.#resizeObserver = new ResizeObserver(() => {
                this.#fitFrustum();
                this.requestRender();
            });
            this.#resizeObserver.observe(root);
        }

        this.ready = this.#loadAll();
    }

    /** Asks for at least one more frame. */
    requestRender() {
        this.#tailFrames = IDLE_TAIL_FRAMES;
        this.#startLoop();
    }

    destroy() {
        this.#abort.abort();
        this.#stopLoop();
        if (this.#resizeObserver) {
            this.#resizeObserver.disconnect();
        }
        for (const control of [...this.buttons, ...this.toggles, ...this.indicators]) {
            control.destroy();
            control.label.dispose();
            disposeObject(control.model);
        }
        this.#ctx.dispose();
    }

    async #loadAll() {
        const results = await Promise.allSettled([
            this.#loadToggles(),
            this.#loadButtons(),
            this.#loadIndicators(),
        ]);
        const failed = results.filter((r) => r.status === "rejected");
        for (const failure of failed) {
            log.error("controls", "model group failed to load", { err: failure.reason });
        }
        this.#refitToContent();
        this.requestRender();
        return failed.length === 0;
    }

    async #loadToggles() {
        const { scene, loader } = this.#ctx;
        await Promise.all(
            Array.from({ length: CONTROL_COUNT }, async (_, i) => {
                const gltf = await loadGltf(loader, MODELS.toggle);
                const model = gltf.scene;
                const x = TOGGLE_START_X + i * CONTROL_SPACING_X;
                model.rotation.set(-0.2, 1.569, 0);
                model.position.set(x, 0, 0);
                scene.add(model);

                const mixer = new AnimationMixer(model);
                const label = new Label(`T_Switch ${i}`, CONTROL_LABEL);
                label.mesh.position.set(x, LABEL_Y, 0);
                scene.add(label.mesh);

                const animation = this.#clipAction(mixer, gltf, 1);
                this.toggles.push(new ToggleSwitch(i, model, animation, mixer, label));
            })
        );
        this.toggles.sort((a, b) => a.number - b.number);
    }

    async #loadButtons() {
        const { scene, loader } = this.#ctx;
        await Promise.all(
            Array.from({ length: CONTROL_COUNT }, async (_, i) => {
                const gltf = await loadGltf(loader, MODELS.button);
                const model = gltf.scene;
                const x = BUTTON_START_X - i * CONTROL_SPACING_X;
                model.rotation.set(1.069, 0, 0);
                model.position.set(x, 0, 0);
                model.scale.set(BUTTON_SCALE, BUTTON_SCALE, BUTTON_SCALE);
                scene.add(model);

                const mixer = new AnimationMixer(model);
                const label = new Label(`Button ${CONTROL_COUNT - 1 - i}`, CONTROL_LABEL);
                label.mesh.position.set(x, LABEL_Y, 0);
                scene.add(label.mesh);

                const animation = this.#clipAction(mixer, gltf, BUTTON_ANIM_SPEED);
                this.buttons.push(new Button(i, model, animation, mixer, label));
            })
        );
        // Button 0 is the rightmost, matching the historical layout.
        this.buttons.sort((a, b) => b.number - a.number);
    }

    async #loadIndicators() {
        const { scene, loader } = this.#ctx;
        await Promise.all(
            Array.from({ length: CONTROL_COUNT }, async (_, i) => {
                const url = i < CONTROL_COUNT - 1 ? MODELS.indicator : MODELS.indicatorRed;
                const gltf = await loadGltf(loader, url);
                const model = gltf.scene;
                const y = INDICATOR_TOP_Y - i * INDICATOR_SPACING_Y;
                model.rotation.set(1.069, 0, 0);
                model.position.set(0, y, 0);
                model.scale.set(INDICATOR_SCALE, INDICATOR_SCALE, INDICATOR_SCALE);
                scene.add(model);

                const mixer = new AnimationMixer(model);
                const label = new Label(INDICATOR_LABELS[i], INDICATOR_LABEL);
                label.mesh.position.set(0, y - INDICATOR_LABEL_OFFSET_Y, 0);
                scene.add(label.mesh);

                this.indicators.push(
                    new Indicator(i, model, mixer, label, { onChange: () => this.requestRender() })
                );
            })
        );
        this.indicators.sort((a, b) => a.number - b.number);
    }

    #clipAction(mixer, gltf, timeScale) {
        if (gltf.animations.length === 0) {
            return null;
        }
        const action = mixer.clipAction(gltf.animations[0]);
        action.loop = LoopOnce;
        action.clampWhenFinished = true;
        action.timeScale = timeScale;
        action.play();
        action.time = 0;
        action.paused = true;
        return action;
    }

    #fitFrustum() {
        const width = this.#root.clientWidth;
        const height = this.#root.clientHeight;
        if (width === 0 || height === 0) return;
        const { camera, renderer } = this.#ctx;

        const aspect = width / height;
        let halfH = this.#contentHalfH;
        let halfW = halfH * aspect;
        if (halfW < this.#contentHalfW) {
            halfW = this.#contentHalfW;
            halfH = halfW / aspect;
        }
        camera.left = -halfW;
        camera.right = halfW;
        camera.top = halfH;
        camera.bottom = -halfH;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
    }

    #refitToContent() {
        const box = new Box3().setFromObject(this.#ctx.scene);
        if (box.isEmpty()) return;
        this.#contentHalfW = Math.max(Math.abs(box.min.x), Math.abs(box.max.x)) * CONTENT_MARGIN;
        this.#contentHalfH = Math.max(Math.abs(box.min.y), Math.abs(box.max.y)) * CONTENT_MARGIN;
        this.#fitFrustum();
    }

    #startLoop() {
        if (this.#rafId !== null || this.#contextLost || document.visibilityState === "hidden") {
            return;
        }
        this.#clock.getDelta();
        this.#rafId = requestAnimationFrame((t) => this.#frame(t));
    }

    #stopLoop() {
        if (this.#rafId !== null) {
            cancelAnimationFrame(this.#rafId);
            this.#rafId = null;
        }
    }

    #frame() {
        this.#rafId = null;
        const delta = Math.min(this.#clock.getDelta(), MAX_DELTA_S);
        let animating = false;
        for (const control of [...this.toggles, ...this.buttons]) {
            control.mixer.update(delta);
            if (control.animation && control.animation.isRunning()) {
                animating = true;
            }
        }
        for (const indicator of this.indicators) {
            indicator.mixer.update(delta);
        }
        this.#ctx.renderer.render(this.#ctx.scene, this.#ctx.camera);

        if (animating) {
            this.#tailFrames = IDLE_TAIL_FRAMES;
        } else if (this.#tailFrames > 0) {
            this.#tailFrames -= 1;
        }
        if (animating || this.#tailFrames > 0) {
            this.#startLoop();
        }
    }

    #onClick(event) {
        const { renderer, raycaster, pointer, camera, scene } = this.#ctx;
        const rect = renderer.domElement.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObjects(scene.children);
        if (hits.length === 0) return;

        let target = hits[0].object;
        while (target.parent && target.parent !== scene) {
            target = target.parent;
        }

        const toggle = this.toggles.find((t) => t.model === target);
        if (toggle) {
            this.requestRender();
            toggle.toggle().then((ran) => {
                if (!ran) this.#onUnassigned("toggle");
            });
            return;
        }
        const button = this.buttons.find((b) => b.model === target);
        if (button) {
            this.requestRender();
            if (!button.press()) {
                this.#onUnassigned("button");
            }
        }
    }
}
