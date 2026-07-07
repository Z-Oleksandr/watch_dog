import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/Addons.js";
import { drawSunburstTexture } from "../deco_gauge/theme";

export function init() {
    const control2_window = document.getElementsByClassName("control2")[0];

    const scene = new THREE.Scene();
    const width = control2_window.clientWidth;
    const height = control2_window.clientHeight;

    const camera = new THREE.OrthographicCamera(-26, 26, 7, -7, 0.01, 1000);
    camera.position.set(0, 1, 5);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
        canvas: document.getElementById("control2"),
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);

    const loader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath("/three/examples/jsm/libs/draco");
    loader.setDRACOLoader(dracoLoader);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const sunburst = new THREE.CanvasTexture(drawSunburstTexture(1024));
    sunburst.colorSpace = THREE.SRGBColorSpace;
    scene.background = sunburst;
    scene.backgroundIntensity = 0.9;

    const directionalLight = new THREE.DirectionalLight(0xffe0b0, 7);
    directionalLight.position.set(-5, 5, 5).normalize();
    scene.add(directionalLight);

    const ambientLight = new THREE.AmbientLight(0x50452f, 18);
    scene.add(ambientLight);

    return { camera, scene, renderer, loader, raycaster, pointer };
}

export function isMobile() {
    const regex =
        /Mobi|Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
    return regex.test(navigator.userAgent);
}
