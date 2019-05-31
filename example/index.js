import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { Batch } from "../src/index";

const canvas = document.getElementById("canvas");

const renderer = new THREE.WebGLRenderer({ antialias: true, canvas });
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
directionalLight.shadow.camera.top	= 10;
directionalLight.shadow.camera.bottom = -10;
directionalLight.shadow.mapSize.width = 1024;
directionalLight.shadow.mapSize.height = 1024;
directionalLight.shadow.bias = -0.00025;
scene.add(directionalLight);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 2, 5);
camera.lookAt(0, 0, 0);
scene.add(camera);

const plane = new THREE.Mesh(
  new THREE.PlaneBufferGeometry(10, 10, 10),
  new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.9,
    metalness: 0.01
  })
);
plane.castShadow = true;
plane.receiveShadow = true;
plane.rotation.set(-Math.PI / 2, 0, 0);
scene.add(plane);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.update();

const batch = new Batch();

new GLTFLoader().load("./building_octagonal_shiny/scene.gltf", (gltf) => {
  gltf.scene.traverse(object => {
    if (object.isMesh) {
      object.position.set(5, 0, 0);
      object.scale.set(0.001, 0.001, 0.001);
      object.material.color.setRGB(1, 0, 0);
      batch.addMesh(object);
    }
  });
});

new GLTFLoader().load("./building_beveled_corners_shiny/scene.gltf", (gltf) => {
  
  gltf.scene.traverse(object => {
    if (object.isMesh) {
      object.position.set(-5, 0, 0);
      object.scale.set(0.001, 0.001, 0.001);
      object.material.color.setRGB(0, 1, 0);
      batch.addMesh(object);
    }
  });
});

scene.add(batch);

function render() {
  batch.update();
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(render);