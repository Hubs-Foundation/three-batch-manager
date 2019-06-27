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
  DirectionalLight,
  Texture
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { GLTFLoader, GLTF } from "three/examples/jsm/loaders/GLTFLoader";
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

function loadGLTF(url: string): Promise<GLTF> {
  return new Promise((resolve, reject) => new GLTFLoader().load(url, resolve, undefined, reject));
}

function loadTexture(url: string): Promise<Texture> {
  return new Promise((resolve, reject) => new TextureLoader().load(url, resolve, undefined, reject));
}

function addImage(texture: Texture, position: Vector3, scale: number) {
  const imageGeometry = new PlaneBufferGeometry();
  const imageMaterial = new MeshBasicMaterial({ map: texture });
  imageMaterial.side = DoubleSide;
  const imageMesh = new Mesh(imageGeometry, imageMaterial);
  imageMesh.position.copy(position);
  imageMesh.scale.setScalar(scale);
  scene.add(imageMesh);
  batchManager.addMesh(imageMesh);
}

function addGlTF(gltf: GLTF, position: Vector3, scale: number) {
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
}

(async function loadScene() {
  const atriumGltf = await loadGLTF("./MozAtrium.glb");
  const blocksTruckGltf = await loadGLTF("./BlocksTruck/model.gltf");
  const firefoxLogoTexture = await loadTexture("./FirefoxLogo.png");

  addGlTF(atriumGltf, new Vector3(), 1);
  addGlTF(blocksTruckGltf, new Vector3(0, 1, 0), 0.1);
  addImage(firefoxLogoTexture, new Vector3(1, 1, 0), 1);
  addImage(firefoxLogoTexture, new Vector3(3, 1, 0), 1);
})().catch(console.error);

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
