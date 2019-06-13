import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { BatchManager } from "../src/index";

const canvas = document.getElementById("canvas");
const context = canvas.getContext("webgl2", { antialias: true });

const renderer = new THREE.WebGLRenderer({ canvas, context });
renderer.debug.checkShaderErrors = true;
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();

scene.add(new THREE.AmbientLight(0x404040));

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(1, 10, 0);
directionalLight.castShadow = true;
directionalLight.shadow.camera.near = 1;
directionalLight.shadow.camera.far = 100;
directionalLight.shadow.camera.right = 10;
directionalLight.shadow.camera.left = -10;
directionalLight.shadow.camera.top = 10;
directionalLight.shadow.camera.bottom = -10;
directionalLight.shadow.mapSize.width = 1024;
directionalLight.shadow.mapSize.height = 1024;
directionalLight.shadow.bias = -0.00025;
scene.add(directionalLight);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(3.42, 3.4, 2.38);
camera.lookAt(0, 0, 0);
scene.add(camera);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.update();

const batchManager = new BatchManager(scene, renderer);

const mixers = [];

new GLTFLoader().load("./MozAtrium.glb", gltf => {
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(object => {
    if (object.isMesh && !object.material.transparent) {
      batchManager.addMesh(object);
    }
  });

  if (gltf.animations && gltf.animations.length > 0) {
    const mixer = new THREE.AnimationMixer(gltf.scene);

    gltf.animations.forEach(clip => {
      mixer.clipAction(clip).play();
    });

    mixers.push(mixer);
  }

  scene.add(gltf.scene);
});

const clock = new THREE.Clock();

function render() {
  const dt = clock.getDelta();

  for (let i = 0; i < mixers.length; i++) {
    mixers[i].update(dt);
  }
  batchManager.update();
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(render);

window.renderer = renderer;
window.scene = scene;
