import {
  Vector3,
  TextureLoader,
  MeshBasicMaterial,
  PlaneBufferGeometry,
  Mesh,
  DoubleSide,
  AnimationMixer,
  WebGLRenderer,
  Scene,
  PCFSoftShadowMap,
  AmbientLight,
  PerspectiveCamera,
  Clock,
  DirectionalLight
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { BatchManager } from "../src/index";

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const context = canvas.getContext("webgl2", { antialias: true });

const renderer = new WebGLRenderer({ canvas, context });
renderer.debug.checkShaderErrors = true;
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFSoftShadowMap;

const scene = new Scene();

scene.add(new AmbientLight(0x404040));

const directionalLight = new DirectionalLight(0xffffff, 1);
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

const camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(3.42, 3.4, 2.38);
camera.lookAt(0, 0, 0);
scene.add(camera);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.update();

const batchManager = new BatchManager(scene, renderer);

const mixers: AnimationMixer[] = [];

function loadGLTF(url: string, position: Vector3, scale: number) {
  new GLTFLoader().load(url, gltf => {
    gltf.scene.position.copy(position);
    gltf.scene.scale.setScalar(scale);
    gltf.scene.updateMatrixWorld(true);

    scene.add(gltf.scene);

    gltf.scene.traverse((object: any) => {
      if (object.isMesh && !object.material.transparent) {
        batchManager.addMesh(object);
      }
    });

    if (gltf.animations && gltf.animations.length > 0) {
      const mixer = new AnimationMixer(gltf.scene);

      gltf.animations.forEach(clip => {
        mixer.clipAction(clip).play();
      });

      mixers.push(mixer);
    }
  });
}

function loadImage(url: string, position: Vector3, scale: number) {
  new TextureLoader().load(url, texture => {
    const imageGeometry = new PlaneBufferGeometry();
    const imageMaterial = new MeshBasicMaterial({ map: texture });
    imageMaterial.side = DoubleSide;
    const imageMesh = new Mesh(imageGeometry, imageMaterial);
    imageMesh.position.copy(position);
    imageMesh.scale.setScalar(scale);
    scene.add(imageMesh);
    batchManager.addMesh(imageMesh);
  });
}

loadGLTF("./MozAtrium.glb", new Vector3(), 1);
loadGLTF("./BlocksTruck/model.gltf", new Vector3(0, 1, 0), 0.1);
loadImage("./FirefoxLogo.png", new Vector3(1, 1, 0), 1);

const clock = new Clock();

function render() {
  const dt = clock.getDelta();

  for (let i = 0; i < mixers.length; i++) {
    mixers[i].update(dt);
  }
  batchManager.update();
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(render);

(window as any).renderer = renderer;
(window as any).scene = scene;