import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/Addons.js";

import {
    addToggleSwitch,
    updateToggleMixers,
    toggle_switches,
} from "./toggle_switch";
import { addButton3D, updateButton3DMixers, buttons } from "./button";
import { init, getScale, isMobile } from "./init";
import { Label } from "./label";
import {
    addIndicator,
    Indicator,
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

let scale;
if (isMobile() && window.innerWidth < 1080) {
    scale = getScale();
} else {
    scale = 1;
}

const INDICATOR_LABEL_TEXTS = ["conn", "stby", "error"];
const INDICATOR_TOP_Y = 4.5;
const INDICATOR_SPACING_Y = 4;
const INDICATOR_LABEL_OFFSET_Y = 1.88;
// Layout used when labels are hidden (pre-label spacing)
const INDICATOR_COMPACT_TOP_Y = 2.69;
const INDICATOR_COMPACT_SPACING_Y = 3;

// Labels are hidden when the labeled indicator stack does not fit the viewport
let indicatorContentBox = null;
let indicatorLabelsVisible = null; // null until the first fit check applies a layout
const LABEL_FIT_HYSTERESIS = 0.02; // NDC units

function measureIndicatorContent() {
    const box = new THREE.Box3();
    indicators.forEach((indi) => {
        indi.model.updateWorldMatrix(true, true);
        indi.label.getMesh().updateWorldMatrix(true, true);
        box.expandByObject(indi.model, true);
        box.expandByObject(indi.label.getMesh(), true);
    });
    indicatorContentBox = box;
}

const _corner = new THREE.Vector3();
function getProjectedYRange(box) {
    camera.updateMatrixWorld();
    let minY = Infinity;
    let maxY = -Infinity;
    for (let ix = 0; ix < 2; ix++) {
        for (let iy = 0; iy < 2; iy++) {
            for (let iz = 0; iz < 2; iz++) {
                _corner
                    .set(
                        ix ? box.max.x : box.min.x,
                        iy ? box.max.y : box.min.y,
                        iz ? box.max.z : box.min.z
                    )
                    .project(camera);
                minY = Math.min(minY, _corner.y);
                maxY = Math.max(maxY, _corner.y);
            }
        }
    }
    return { minY, maxY };
}

function updateIndicatorLabelVisibility() {
    if (!indicatorContentBox || indicatorContentBox.isEmpty()) return;

    const { minY, maxY } = getProjectedYRange(indicatorContentBox);
    const overflows = maxY > 1 || minY < -1;
    const fitsWithMargin =
        maxY <= 1 - LABEL_FIT_HYSTERESIS && minY >= -1 + LABEL_FIT_HYSTERESIS;

    if (indicatorLabelsVisible === null) {
        setIndicatorLabelsVisible(!overflows);
    } else if (indicatorLabelsVisible && overflows) {
        setIndicatorLabelsVisible(false);
    } else if (!indicatorLabelsVisible && fitsWithMargin) {
        setIndicatorLabelsVisible(true);
    }
}

function setIndicatorLabelsVisible(visible) {
    const topY = visible ? INDICATOR_TOP_Y : INDICATOR_COMPACT_TOP_Y;
    const spacingY = visible
        ? INDICATOR_SPACING_Y
        : INDICATOR_COMPACT_SPACING_Y;
    indicators.forEach((indi) => {
        indi.label.getMesh().visible = visible;
        indi.model.position.y = (topY - indi.number * spacingY) * scale;
    });
    indicatorLabelsVisible = visible;
}

renderer.setAnimationLoop(animate);

window.addEventListener("pointermove", onPointerMove);
window.addEventListener("touchmove", onPointerMoveMobile);
window.addEventListener("click", handleClick);
window.addEventListener("touchend", handleClick);

// const controls = new OrbitControls(camera, renderer.domElement);

function onWindowResize() {
    const width = control2_window.clientWidth;
    const height = control2_window.clientHeight;

    camera.left = width / -30;
    camera.right = width / 30;
    camera.top = height / 30;
    camera.bottom = height / -30;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    updateIndicatorLabelVisibility();
}

new ResizeObserver(onWindowResize).observe(control2_window);

// Time
const clock = new THREE.Clock();
let delta;

// End of setup

// const axesHelper = new THREE.AxesHelper(30);
// scene.add(axesHelper);

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
                        model.position.set(-22 * scale + i * 6.9 * scale, 0, 0);
                        model.scale.set(scale, scale, scale);
                        gltf.animations;
                        scene.add(model);

                        const mixer = new THREE.AnimationMixer(model);

                        const label = new Label(`T_Switch ${i}`, {
                            width: 590,
                            height: 120,
                            fontSize: 85,
                            backgroundColor: "#ffeeaa",
                            borderColor: "#000000",
                            textColor: "#000000",
                            borderWidth: 5,
                        });

                        const labelMesh = label.getMesh();

                        labelMesh.position.set(
                            -22 * scale + i * 6.9 * scale,
                            -4,
                            0
                        );
                        scene.add(labelMesh);

                        if (gltf.animations.length > 0) {
                            let action = mixer.clipAction(gltf.animations[0]);
                            action.loop = THREE.LoopOnce;
                            action.clampWhenFinished = true;

                            // Init in frame 0
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
                        model.position.set(22 * scale - i * 6.9 * scale, 0, 0);
                        model.scale.set(
                            2.369 * scale,
                            2.369 * scale,
                            2.369 * scale
                        );
                        gltf.animations;
                        scene.add(model);

                        const mixer = new THREE.AnimationMixer(model);

                        const label = new Label(`Button ${2 - i}`, {
                            width: 590,
                            height: 120,
                            fontSize: 85,
                            backgroundColor: "#ffeeaa",
                            borderColor: "#000000",
                            textColor: "#000000",
                            borderWidth: 5,
                        });

                        const labelMesh = label.getMesh();

                        labelMesh.position.set(
                            22 * scale - i * 6.9 * scale,
                            -4,
                            0
                        );
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
                            (INDICATOR_TOP_Y - i * INDICATOR_SPACING_Y) * scale,
                            0
                        );
                        const specific_scale = scale * 0.69;
                        model.scale.set(
                            specific_scale,
                            specific_scale,
                            specific_scale
                        );
                        gltf.animations;
                        scene.add(model);

                        const mixer = new THREE.AnimationMixer(model);

                        const label = new Label(INDICATOR_LABEL_TEXTS[i], {
                            width: 260,
                            height: 92,
                            fontSize: 63,
                            backgroundColor: "#ffeeaa",
                            borderColor: "#000000",
                            textColor: "#000000",
                            borderWidth: 5,
                        });

                        const labelMesh = label.getMesh();
                        labelMesh.visible = false;

                        labelMesh.position.set(
                            0,
                            (INDICATOR_TOP_Y -
                                i * INDICATOR_SPACING_Y -
                                INDICATOR_LABEL_OFFSET_Y) *
                                scale,
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
        console.error("One or more buttons failed to load.", error);
    }
}

loadToggleModels().then(() => {
    assign_toggle_0();
    assign_toggle_1();
    assign_toggle_2();
});

loadButtons().then(() => {
    assign_button_0();
    assign_button_1();
    assign_button_2();
});

loadIndicators().then(() => {
    measureIndicatorContent();
    updateIndicatorLabelVisibility();
    isWSConnected(getWS());
});

// const light = new THREE.AmbientLight(0x404040, 100);

// const light = new THREE.PointLight(0xff0000, 10, 100);
// light.position.set(2, 2, 12);
// scene.add(light);

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
            console.log("Clicked indicator");
            return;
        }

        console.warn("Clicked uncknown model");
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

    const intersects = raycaster.intersectObjects(scene.children);

    updateToggleMixers(delta);
    updateButton3DMixers(delta);
    updateIndiMixers(delta);

    renderer.render(scene, camera);
}

// Set the action to the last frame
// clickedToggleSwitch.action.time = clickedToggleSwitch.action.getClip().duration;

const cover = document.getElementsByClassName("cover")[0];

setTimeout(() => {
    cover.style.transform = "translateY(-100%)";
}, 5000);
