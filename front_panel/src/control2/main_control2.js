import * as THREE from "three";

import {
    addToggleSwitch,
    updateToggleMixers,
    toggle_switches,
} from "./toggle_switch";
import { addButton3D, updateButton3DMixers, buttons } from "./button";
import { init } from "./init";
import { Label } from "./label";
import {
    addIndicator,
    indicators,
    updateIndiMixers,
} from "./indicator";
import { isWSConnected, getWS } from "../script";
import {
    assign_button_0,
    assign_button_1,
    assign_button_2,
} from "../button_functions/button_functions";
import {
    assign_toggle_0,
    assign_toggle_1,
    assign_toggle_2,
} from "../toggle_functions/toggle_functions";

const control2_window = document.getElementsByClassName("control2")[0];

let { camera, scene, renderer, loader, raycaster, pointer } = init();

const INDICATOR_LABEL_TEXTS = ["conn", "stby", "error"];
const INDICATOR_TOP_Y = 3.9;
const INDICATOR_SPACING_Y = 3.7;
const INDICATOR_LABEL_OFFSET_Y = 1.88;

// Pre-load fallback; refined from the measured scene bounds once models load
let content_half_w = 26;
let content_half_h = 7;

function fitFrustum() {
    const width = control2_window.clientWidth;
    const height = control2_window.clientHeight;
    if (width === 0 || height === 0) return;

    const aspect = width / height;
    let half_h = content_half_h;
    let half_w = half_h * aspect;
    if (half_w < content_half_w) {
        half_w = content_half_w;
        half_h = half_w / aspect;
    }

    camera.left = -half_w;
    camera.right = half_w;
    camera.top = half_h;
    camera.bottom = -half_h;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
}

function refitToContent() {
    const box = new THREE.Box3().setFromObject(scene);
    if (box.isEmpty()) return;
    content_half_w = Math.max(Math.abs(box.min.x), Math.abs(box.max.x)) * 1.08;
    content_half_h = Math.max(Math.abs(box.min.y), Math.abs(box.max.y)) * 1.08;
    fitFrustum();
}

fitFrustum();
new ResizeObserver(fitFrustum).observe(control2_window);

renderer.setAnimationLoop(animate);

window.addEventListener("pointermove", onPointerMove);
window.addEventListener("touchmove", onPointerMoveMobile);
window.addEventListener("click", handleClick);
window.addEventListener("touchend", handleClick);

const clock = new THREE.Clock();
let delta;

async function loadToggleModels() {
    const modelPromises = Array.from(
        { length: 3 },
        (_, i) =>
            new Promise((resolve, reject) => {
                loader.load(
                    "models/switch/switch1.gltf",
                    (gltf) => {
                        const model = gltf.scene;
                        model.rotation.set(-0.2, 1.569, 0);
                        model.position.set(-22 + i * 6.9, 0, 0);
                        scene.add(model);

                        const mixer = new THREE.AnimationMixer(model);

                        const label = new Label(`T_Switch ${i}`, {
                            width: 590,
                            height: 120,
                            fontSize: 85,
                            borderWidth: 5,
                        });

                        const labelMesh = label.getMesh();
                        labelMesh.position.set(-22 + i * 6.9, -4, 0);
                        scene.add(labelMesh);

                        if (gltf.animations.length > 0) {
                            let action = mixer.clipAction(gltf.animations[0]);
                            action.loop = THREE.LoopOnce;
                            action.clampWhenFinished = true;

                            action.play();
                            action.time = 0;
                            action.paused = true;

                            addToggleSwitch(i, model, action, mixer, label);
                        }

                        resolve();
                    },
                    null,
                    (error) => {
                        console.warn("Error loading toggle switch: " + error);
                        reject(error);
                    }
                );
            })
    );

    try {
        await Promise.all(modelPromises);
    } catch (error) {
        console.error("One or more switches failed to load.", error);
    }
}

async function loadButtons() {
    const modelPromises = Array.from(
        { length: 3 },
        (_, i) =>
            new Promise((resolve, reject) => {
                loader.load(
                    "models/button/button1.gltf",
                    (gltf) => {
                        const model = gltf.scene;
                        model.rotation.set(1.069, 0, 0);
                        model.position.set(22 - i * 6.9, 0, 0);
                        model.scale.set(2.369, 2.369, 2.369);
                        scene.add(model);

                        const mixer = new THREE.AnimationMixer(model);

                        const label = new Label(`Button ${2 - i}`, {
                            width: 590,
                            height: 120,
                            fontSize: 85,
                            borderWidth: 5,
                        });

                        const labelMesh = label.getMesh();
                        labelMesh.position.set(22 - i * 6.9, -4, 0);
                        scene.add(labelMesh);

                        if (gltf.animations.length > 0) {
                            let action = mixer.clipAction(gltf.animations[0]);
                            action.loop = THREE.LoopOnce;
                            action.clampWhenFinished = true;

                            action.timeScale = 4.2;
                            action.play();
                            action.time = 0;
                            action.paused = true;

                            addButton3D(i, model, action, mixer, label);
                        }

                        resolve();
                    },
                    null,
                    (error) => {
                        console.warn("Error loading button: " + error);
                        reject(error);
                    }
                );
            })
    );

    try {
        await Promise.all(modelPromises);
    } catch (error) {
        console.error("One or more buttons failed to load.", error);
    }
}

async function loadIndicators() {
    const modelPromises = Array.from(
        { length: 3 },
        (_, i) =>
            new Promise((resolve, reject) => {
                let model_to_load;
                if (i < 2) {
                    model_to_load = "models/indicators/indicator2.gltf";
                } else {
                    model_to_load = "models/indicators/indicator2_red.gltf";
                }
                loader.load(
                    model_to_load,
                    (gltf) => {
                        const model = gltf.scene;
                        model.rotation.set(1.069, 0, 0);
                        model.position.set(
                            0,
                            INDICATOR_TOP_Y - i * INDICATOR_SPACING_Y,
                            0
                        );
                        model.scale.set(0.69, 0.69, 0.69);
                        scene.add(model);

                        const mixer = new THREE.AnimationMixer(model);

                        const label = new Label(INDICATOR_LABEL_TEXTS[i], {
                            width: 260,
                            height: 92,
                            fontSize: 63,
                            borderWidth: 5,
                        });

                        const labelMesh = label.getMesh();
                        labelMesh.position.set(
                            0,
                            INDICATOR_TOP_Y -
                                i * INDICATOR_SPACING_Y -
                                INDICATOR_LABEL_OFFSET_Y,
                            0
                        );
                        scene.add(labelMesh);

                        addIndicator(i, model, mixer, label);
                        resolve();
                    },
                    null,
                    (error) => {
                        reject(error);
                    }
                );
            })
    );
    try {
        await Promise.all(modelPromises);
    } catch (error) {
        console.error("One or more indicators failed to load.", error);
    }
}

const toggles_ready = loadToggleModels().then(() => {
    assign_toggle_0();
    assign_toggle_1();
    assign_toggle_2();
});

const buttons_ready = loadButtons().then(() => {
    assign_button_0();
    assign_button_1();
    assign_button_2();
});

const indicators_ready = loadIndicators().then(() => {
    isWSConnected(getWS());
});

Promise.all([toggles_ready, buttons_ready, indicators_ready]).then(
    refitToContent
);

function animate() {
    delta = Math.min(clock.getDelta(), 0.1);

    render(delta);
}

function onPointerMove(event) {
    const rect = renderer.domElement.getBoundingClientRect();

    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function onPointerMoveMobile(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    const touch = event.touches ? event.touches[0] : event;

    pointer.x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;
}

function handleClick(event) {
    const clickedMesh = getClickedObject();

    if (clickedMesh) {
        let parentModel = clickedMesh;
        while (parentModel.parent && parentModel.parent.type !== "Scene") {
            parentModel = parentModel.parent;
        }

        const clickedToggleSwitch = toggle_switches.find(
            (object) => object.model === parentModel
        );

        if (clickedToggleSwitch) {
            clickedToggleSwitch.toggle();
            return;
        }

        const clickedButton = buttons.find(
            (object) => object.model === parentModel
        );

        if (clickedButton) {
            clickedButton.press();
            return;
        }

        const clickedIndicator = indicators.find(
            (object) => object.model === parentModel
        );

        if (clickedIndicator) {
            return;
        }

        console.warn("Clicked unknown model");
    }
}

function getClickedObject() {
    raycaster.setFromCamera(pointer, camera);

    const intersects = raycaster.intersectObjects(scene.children);

    if (intersects.length > 0) {
        return intersects[0].object;
    }

    return null;
}

function render(delta) {
    raycaster.setFromCamera(pointer, camera);

    updateToggleMixers(delta);
    updateButton3DMixers(delta);
    updateIndiMixers(delta);

    renderer.render(scene, camera);
}
