import { Mesh, RawShaderMaterial, BufferGeometry, Matrix4, Color, BufferAttribute, DoubleSide, CanvasTexture } from "three";

const MAX_VERTS_PER_DRAW_CALL = 65536;
const MAX_OBJECTS = 16;
const BASE_COLOR_MAP_SIZE = 1024;
const TEXTURE_ATLAS_SIZE = 4; // 4 x 4

const vertexShader = `
precision highp float;
precision highp int;

#define MAX_OBJECTS ${MAX_OBJECTS}

uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform mat4 transforms[MAX_OBJECTS];
uniform vec3 colors[MAX_OBJECTS];

attribute vec3 position;
attribute float instance;
attribute vec2 uv;

varying vec2 vUv;
varying vec3 vColor;

void main() {
  highp int instanceIndex = int(instance);
  vUv = uv;
  vColor = colors[instanceIndex];
  gl_Position = projectionMatrix * viewMatrix * transforms[instanceIndex] * vec4(position, 1.0);
}

`;

const fragmentShader = `
precision highp float;
precision highp int;

uniform sampler2D map;

varying vec2 vUv;
varying vec3 vColor;

void main() {
  gl_FragColor = texture2D(map, vUv) * vec4(vColor, 1.0);
}

`;

export class Batch extends Mesh {
  constructor() {
    const geometry = new BufferGeometry();
    geometry.addAttribute("instance", new BufferAttribute(new Float32Array(MAX_VERTS_PER_DRAW_CALL), 1));
    geometry.addAttribute("position", new BufferAttribute(new Float32Array(MAX_VERTS_PER_DRAW_CALL * 3), 3));
    geometry.addAttribute("normal", new BufferAttribute(new Float32Array(MAX_VERTS_PER_DRAW_CALL * 3), 3));
    geometry.addAttribute("tangent", new BufferAttribute(new Float32Array(MAX_VERTS_PER_DRAW_CALL * 4), 4));
    geometry.addAttribute("uv", new BufferAttribute(new Float32Array(MAX_VERTS_PER_DRAW_CALL * 2), 2));
    geometry.setIndex(new BufferAttribute(new Uint16Array(MAX_VERTS_PER_DRAW_CALL), 1));
    geometry.setDrawRange(0, 0);

    const transforms = [];
    const colors = [];

    for (let i = 0; i < MAX_OBJECTS; i++) {
      transforms.push(new Matrix4());
      colors.push(new Color());
    }

    const baseColorMapCanvas = document.createElement("canvas");
    const baseColorMapTexture = new CanvasTexture(baseColorMapCanvas);
    baseColorMapTexture.flipY = false; // GLTFLoader sets this to false

    const material = new RawShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        map: { value: baseColorMapTexture },
        transforms: { value: transforms },
        colors: { value: colors }
      }
    });

    super(geometry, material);

    this.vertCount = 0;
    this.uvCount = 0;
    this.instanceCount = 0;

    this.meshes = [];
    this.frustumCulled = false;

    this.baseColorMapCanvas = baseColorMapCanvas;
    this.baseColorMapCanvas.width = BASE_COLOR_MAP_SIZE * TEXTURE_ATLAS_SIZE;
    this.baseColorMapCanvas.height = BASE_COLOR_MAP_SIZE * TEXTURE_ATLAS_SIZE;
    this.baseColorMapCtx = this.baseColorMapCanvas.getContext("2d");
  }

  addMesh(mesh) {
    mesh.updateMatrixWorld(true);

    const geometry = mesh.geometry;
    const meshIndices = geometry.index.array;
    const meshIndicesCount = geometry.index.count;
    const meshVertCount = geometry.attributes.position.count;
    const batchIndices = this.geometry.index.array;
    const batchIndicesOffset = this.geometry.drawRange.count;
    
    this.geometry.attributes.instance.array.fill(this.instanceCount, this.vertCount, this.vertCount + meshVertCount);
    this.geometry.attributes.position.array.set(geometry.attributes.position.array, this.vertCount * 3);
    this.geometry.attributes.normal.array.set(geometry.attributes.normal.array, this.vertCount * 3);
    this.geometry.attributes.tangent.array.set(geometry.attributes.tangent.array, this.vertCount * 4);


    const batchUvArray = this.geometry.attributes.uv.array;
    const meshUvArray = geometry.attributes.uv.array;
    const uvCount = geometry.attributes.uv.count;
    const texIdxX = this.instanceCount % TEXTURE_ATLAS_SIZE;
    const texIdxY = Math.floor(this.instanceCount / TEXTURE_ATLAS_SIZE);
    const sOffset = texIdxX / TEXTURE_ATLAS_SIZE;
    const tOffset = texIdxY / TEXTURE_ATLAS_SIZE;

    for (let i = 0; i < uvCount; i++) {
      const normalizedS =  meshUvArray[i * 2] / TEXTURE_ATLAS_SIZE;
      const normalizedT = meshUvArray[i * 2 + 1] / TEXTURE_ATLAS_SIZE;
      batchUvArray[(this.uvCount + i) * 2] = normalizedS + sOffset;
      batchUvArray[(this.uvCount + i) * 2 + 1] = normalizedT + tOffset;
    }

    for (let i = 0; i < meshIndicesCount; i++) {
      batchIndices[batchIndicesOffset + i] = meshIndices[i] + this.vertCount;
    }
    this.vertCount += meshVertCount;
    this.uvCount += uvCount;

    this.geometry.setDrawRange(0, this.geometry.drawRange.count + geometry.index.count);
    this.geometry.attributes.instance.needsUpdate = true;
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.normal.needsUpdate = true;
    this.geometry.attributes.tangent.needsUpdate = true;
    this.geometry.attributes.uv.needsUpdate = true;
    this.geometry.index.needsUpdate = true;

    const material = mesh.material;

    if (material.map && material.map.image) {
      this.baseColorMapCtx.globalCompositeOperation = "source-over"
      this.baseColorMapCtx.drawImage(
        material.map.image,
        this.instanceCount % TEXTURE_ATLAS_SIZE * BASE_COLOR_MAP_SIZE,
        Math.floor(this.instanceCount / TEXTURE_ATLAS_SIZE) * BASE_COLOR_MAP_SIZE,
        BASE_COLOR_MAP_SIZE,
        BASE_COLOR_MAP_SIZE
      );
    }

    if (material.emissiveMap && material.emissiveMap.image) {
      this.baseColorMapCtx.globalCompositeOperation = "lighter"
      this.baseColorMapCtx.drawImage(
        material.emissiveMap.image,
        this.instanceCount % TEXTURE_ATLAS_SIZE * BASE_COLOR_MAP_SIZE,
        Math.floor(this.instanceCount / TEXTURE_ATLAS_SIZE) * BASE_COLOR_MAP_SIZE,
        BASE_COLOR_MAP_SIZE,
        BASE_COLOR_MAP_SIZE
      );
    }

    if (material.aoMap && material.aoMap.image) {
      this.baseColorMapCtx.globalCompositeOperation = "lighter"
      this.baseColorMapCtx.drawImage(
        material.aoMap.image,
        this.instanceCount % TEXTURE_ATLAS_SIZE * BASE_COLOR_MAP_SIZE,
        Math.floor(this.instanceCount / TEXTURE_ATLAS_SIZE) * BASE_COLOR_MAP_SIZE,
        BASE_COLOR_MAP_SIZE,
        BASE_COLOR_MAP_SIZE
      );
    }

    this.material.uniforms.map.value.needsUpdate = true;

    const uniforms = this.material.uniforms;
    uniforms.transforms.value[this.instanceCount].copy(mesh.matrixWorld);
    uniforms.colors.value[this.instanceCount].copy(material.color);
    this.material.needsUpdate = true;

    mesh.visible = false;
    this.instanceCount++;

    this.meshes.push(mesh);
  }

  update() {
    const uniforms = this.material.uniforms;

    for (let i = 0; i < this.meshes.length; i++) {
      const mesh = this.meshes[i];
      mesh.updateMatrixWorld();
      uniforms.transforms.value[i].copy(mesh.matrixWorld);
    }
  }
}