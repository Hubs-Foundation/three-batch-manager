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
  Texture,
  AxesHelper,
  Material,
  Color,
  MeshStandardMaterial
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
renderer.shadowMap.enabled = false;
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
  return new Promise((resolve, reject) =>
    new GLTFLoader().load(url, resolve, undefined, () => reject(new Error(`Failed to load glTF: "${url}"`)))
  );
}

function loadTexture(url: string): Promise<Texture> {
  return new Promise((resolve, reject) =>
    new TextureLoader().load(url, resolve, undefined, () => reject(new Error(`Failed to load image: "${url}"`)))
  );
}

const nonBactchedColor = new Color(100, 0, 100);

function addImage(texture: Texture) {
  const imageGeometry = new PlaneBufferGeometry();
  const imageMaterial = new MeshBasicMaterial({ map: texture });
  imageMaterial.side = DoubleSide;
  const imageMesh = new Mesh(imageGeometry, imageMaterial);
  scene.add(imageMesh);

  if (!batchManager.addMesh(imageMesh)) {
    const material = imageMesh.material as MeshBasicMaterial;
    material.color.add(nonBactchedColor);
  }

  return imageMesh;
}

function addGlTF(gltf: GLTF) {
  scene.add(gltf.scene);

  gltf.scene.traverse((object: any) => {
    if (object.isMesh) {
      if (!batchManager.addMesh(object)) {
        if (Array.isArray(object.material)) {
          for (const material of object.material) {
            material.color.add(nonBactchedColor);
          }
        } else {
          object.material.color.add(nonBactchedColor);
        }
      }
    }
  });

  if (gltf.animations && gltf.animations.length > 0) {
    const mixer = new AnimationMixer(gltf.scene);

    gltf.animations.forEach(clip => {
      mixer.clipAction(clip).play();
    });

    mixers.push(mixer);
  }

  return gltf.scene;
}

(async function loadScene() {
  const atriumGltf = await loadGLTF("./MozAtrium.glb");
  const blocksTruckGltf = await loadGLTF("./BlocksTruck/model.gltf");
  const firefoxLogoTexture = await loadTexture("./FirefoxLogo.png");
  const alphaBlendModeTestGltf = await loadGLTF(
    "./GLTFSampleModels/2.0/AlphaBlendModeTest/glTF-Binary/AlphaBlendModeTest.glb"
  );
  const boxAnimatedGltf = await loadGLTF("./GLTFSampleModels/2.0/BoxAnimated/glTF-Binary/BoxAnimated.glb");
  const boxInterleavedGltf = await loadGLTF("./GLTFSampleModels/2.0/BoxInterleaved/glTF-Binary/BoxInterleaved.glb");
  const boxTexturedNonPowerOfTwoGltf = await loadGLTF(
    "./GLTFSampleModels/2.0/BoxTexturedNonPowerOfTwo/glTF-Binary/BoxTexturedNonPowerOfTwo.glb"
  );
  const metalRoughSpheresGltf = await loadGLTF(
    "./GLTFSampleModels/2.0/MetalRoughSpheres/glTF-Binary/MetalRoughSpheres.glb"
  );
  const normalTangentTestGltf = await loadGLTF(
    "./GLTFSampleModels/2.0/NormalTangentTest/glTF-Binary/NormalTangentTest.glb"
  );
  const normalTangentMirrorTestGltf = await loadGLTF(
    "./GLTFSampleModels/2.0/NormalTangentMirrorTest/glTF-Binary/NormalTangentMirrorTest.glb"
  );
  const riggedSimpleGltf = await loadGLTF("./GLTFSampleModels/2.0/RiggedSimple/glTF-Binary/RiggedSimple.glb");
  const textureCoordinateTestGltf = await loadGLTF(
    "./GLTFSampleModels/2.0/TextureCoordinateTest/glTF-Binary/TextureCoordinateTest.glb"
  );
  const textureSettingsTestGltf = await loadGLTF(
    "./GLTFSampleModels/2.0/TextureSettingsTest/glTF-Binary/TextureSettingsTest.glb"
  );
  const vertexColorTestGltf = await loadGLTF("./GLTFSampleModels/2.0/VertexColorTest/glTF-Binary/VertexColorTest.glb");

  addGlTF(atriumGltf);

  const alphaBlendModeTest = addGlTF(alphaBlendModeTestGltf);
  alphaBlendModeTest.position.set(-2, 1.25, 4);
  alphaBlendModeTest.scale.setScalar(0.25);
  alphaBlendModeTest.rotateY(Math.PI);

  const truck = addGlTF(blocksTruckGltf);
  truck.position.set(3, 1.5, -2.5);
  truck.rotateY(-Math.PI / 2);
  truck.scale.setScalar(0.25);

  const boxAnimated = addGlTF(boxAnimatedGltf);
  boxAnimated.position.set(3, 0.5, -1);
  boxAnimated.rotateY(-Math.PI / 2);
  boxAnimated.scale.setScalar(0.25);

  const boxInterleaved = addGlTF(boxInterleavedGltf);
  boxInterleaved.position.set(3, 0.5, 0);
  boxInterleaved.rotateY(-Math.PI / 2);
  boxInterleaved.scale.setScalar(0.25);

  const boxTexturedNonPowerOfTwo = addGlTF(boxTexturedNonPowerOfTwoGltf);
  boxTexturedNonPowerOfTwo.position.set(3, 0.5, 1);
  boxTexturedNonPowerOfTwo.rotateY(-Math.PI / 2);
  boxTexturedNonPowerOfTwo.scale.setScalar(0.25);

  const riggedSimpleTest = addGlTF(riggedSimpleGltf);
  riggedSimpleTest.position.set(3, 0.5, 2);
  riggedSimpleTest.rotateY(-Math.PI / 2);
  riggedSimpleTest.scale.setScalar(0.25);

  const metalRoughSpheres = addGlTF(metalRoughSpheresGltf);
  metalRoughSpheres.position.set(-3, 2, 2.5);
  metalRoughSpheres.rotateY(Math.PI / 2);
  metalRoughSpheres.scale.setScalar(0.1);

  const normalTangentTest = addGlTF(normalTangentTestGltf);
  normalTangentTest.position.set(-3.75, 2, 1);
  normalTangentTest.rotateY(Math.PI / 2);
  normalTangentTest.scale.setScalar(0.5);

  const normalTangentMirrorTest = addGlTF(normalTangentMirrorTestGltf);
  normalTangentMirrorTest.position.set(-3.75, 2, -0.5);
  normalTangentMirrorTest.rotateY(Math.PI / 2);
  normalTangentMirrorTest.scale.setScalar(0.5);

  const vertexColorTest = addGlTF(vertexColorTestGltf);
  vertexColorTest.position.set(-3.75, 2, -2);
  vertexColorTest.rotateY(Math.PI / 2);
  vertexColorTest.scale.setScalar(0.5);

  const textureSettingsTest = addGlTF(textureSettingsTestGltf);
  textureSettingsTest.position.set(4, 1.5, -2.75);
  textureSettingsTest.rotateY(-Math.PI / 2);
  textureSettingsTest.scale.setScalar(0.1);

  const textureCoordinateTest = addGlTF(textureCoordinateTestGltf);
  textureCoordinateTest.position.set(4, 1.5, -1.5);
  textureCoordinateTest.rotateY(-Math.PI / 2);
  textureCoordinateTest.scale.setScalar(0.5);

  const logo1 = addImage(firefoxLogoTexture);
  logo1.position.set(4, 1.5, 1.5);
  logo1.rotateY(-Math.PI / 2);

  const logo2 = addImage(firefoxLogoTexture);
  logo2.position.set(4, 1.5, 2.75);
  logo2.rotateY(-Math.PI / 2);

  scene.add(new AxesHelper(1));
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
