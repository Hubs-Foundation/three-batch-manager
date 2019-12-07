import {
  TextureLoader,
  MeshBasicMaterial,
  PlaneBufferGeometry,
  Mesh,
  DoubleSide,
  WebGLRenderer,
  Scene,
  AmbientLight,
  PerspectiveCamera,
  Clock,
  Texture,
  AxesHelper,
  Color
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { BatchManager } from "../src/index";

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const context = canvas.getContext("webgl2", { antialias: true });

const renderer = new WebGLRenderer({ canvas, context });
renderer.debug.checkShaderErrors = true;
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new Scene();

scene.add(new AmbientLight(0x404040));

const camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(3.42, 3.4, 2.38);
camera.lookAt(0, 0, 0);
scene.add(camera);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.update();

const batchManager = new BatchManager(scene, renderer);

function loadTexture(url: string): Promise<Texture> {
  return new Promise((resolve, reject) =>
    new TextureLoader().load(url, resolve, undefined, () => reject(new Error(`Failed to load image: "${url}"`)))
  );
}

let lastFrame = 0;
const nonBatchedColor = new Color().setRGB(Math.random() * 10, Math.random() * 10, Math.random() * 10);
const nonBatchedMatrials: MeshBasicMaterial[] = [];

function addImage(texture: Texture) {
  const imageGeometry = new PlaneBufferGeometry();
  const imageMaterial = new MeshBasicMaterial({ map: texture });
  imageMaterial.side = DoubleSide;
  const imageMesh = new Mesh(imageGeometry, imageMaterial);
  scene.add(imageMesh);

  if (!batchManager.addMesh(imageMesh)) {
    const material = imageMesh.material as MeshBasicMaterial;
    nonBatchedMatrials.push(material);
  }

  return imageMesh;
}

(async function loadScene() {
  const firefoxLogoTexture = await loadTexture("./FirefoxLogo.png");

  const logo1 = addImage(firefoxLogoTexture);
  logo1.position.set(0, 1.5, 0);

  const logo2 = addImage(firefoxLogoTexture);
  logo2.position.set(2, 1.5, 0);

  scene.add(new AxesHelper(1));
})().catch(console.error);

const clock = new Clock();

function render() {
  const time = clock.getElapsedTime();

  const curFrame = Math.round(time) % 2;

  if (lastFrame !== curFrame) {
    lastFrame = curFrame;
    nonBatchedColor.setRGB(Math.random() * 10, Math.random() * 10, Math.random() * 10);
  }

  for (let i = 0; i < nonBatchedMatrials.length; i++) {
    nonBatchedMatrials[i].color.copy(nonBatchedColor);
  }

  batchManager.update(time);

  renderer.render(scene, camera);
}

renderer.setAnimationLoop(render);

(window as any).renderer = renderer;
(window as any).scene = scene;
(window as any).batchManager = batchManager;
