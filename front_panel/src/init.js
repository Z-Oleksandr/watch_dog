import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/Addons.js";

export function init() {
    const control2_window = document.getElementsByClassName("control2")[0];

    const scene = new THREE.Scene();
    let width = control2_window.clientWidth;
    let height = control2_window.clientHeight;

    // Camera
    const camera = new THREE.OrthographicCamera(
        width / -30,
        width / 30,
        height / 30,
        height / -30,
        0.01,
        1000
    );
    camera.position.set(0, 1, 5);
    camera.lookAt(0, 0, 0);

    // Renderer
    const renderer = new THREE.WebGLRenderer({
        canvas: document.getElementById("control2"),
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(control2_window.clientWidth, control2_window.clientHeight);

    // Model loader
    const loader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath("/three/examples/jsm/libs/draco");
    loader.setDRACOLoader(dracoLoader);

    // Raycaster for detecting clicks
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    // Background
    const iron_plate = new THREE.TextureLoader().load("/img/iron_plate2.jpg");
    scene.background = iron_plate;

    scene.backgroundIntensity = 0.42;

    // Light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 7);
    directionalLight.position.set(-5, 5, 5).normalize();
    scene.add(directionalLight);

    const ambientLight = new THREE.AmbientLight(0x404040, 20); // Soft global light
    scene.add(ambientLight);

    return { camera, scene, renderer, loader, raycaster, pointer };
}

export function getScale() {
    return 0.00041 * window.innerWidth + 0.22;
}

export function isMobile() {
    const regex =
        /Mobi|Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
    return regex.test(navigator.userAgent);
}
