import { Mesh, RawShaderMaterial, BufferGeometry, Matrix4, Color, BufferAttribute, DoubleSide, CanvasTexture } from "three";

function createShader(maxMeshes) {
  return {
    vertexShader: `
    precision highp float;
    precision highp int;

    #define MAX_MESHES ${maxMeshes}

    uniform mat4 viewMatrix;
    uniform mat4 projectionMatrix;
    uniform mat4 transforms[MAX_MESHES];
    uniform vec3 colors[MAX_MESHES];

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
    `,

    fragmentShader: `
    precision highp float;
    precision highp int;
    
    uniform sampler2D map;
    
    varying vec2 vUv;
    varying vec3 vColor;
    
    void main() {
      gl_FragColor = texture2D(map, vUv) * vec4(vColor, 1.0);
    }
    `
  };
};

export class UnlitBatch extends Mesh {
  constructor(options = {}) {
    const _options = Object.assign({
      textureResolution: 1024,
      atlasSize: 4,
      maxVertsPerDraw: 65536,
      enableVertexColors: false
    }, options);

    const maxMeshes = _options.atlasSize * _options.atlasSize;

    const geometry = new BufferGeometry();
    geometry.addAttribute("instance", new BufferAttribute(new Float32Array(_options.maxVertsPerDraw), 1));
    geometry.addAttribute("position", new BufferAttribute(new Float32Array(_options.maxVertsPerDraw * 3), 3));

    if (_options.enableVertexColors) {
      geometry.addAttribute("color", new BufferAttribute(new Float32Array(_options.maxVertsPerDraw * 3), 3));
    }

    geometry.addAttribute("uv", new BufferAttribute(new Float32Array(_options.maxVertsPerDraw * 2), 2));
    geometry.setIndex(new BufferAttribute(new Uint16Array(_options.maxVertsPerDraw), 1));
    geometry.setDrawRange(0, 0);

    const transforms = [];
    const colors = [];

    for (let i = 0; i < maxMeshes; i++) {
      transforms.push(new Matrix4());
      colors.push(new Color());
    }

    const baseColorMapCanvas = document.createElement("canvas");
    const baseColorMapTexture = new CanvasTexture(baseColorMapCanvas);
    baseColorMapTexture.flipY = false; // GLTFLoader sets this to false

    const material = new RawShaderMaterial({
      ...createShader(maxMeshes),
      uniforms: {
        map: { value: baseColorMapTexture },
        transforms: { value: transforms },
        colors: { value: colors }
      }
    });

    super(geometry, material);

    this.textureResolution = _options.textureResolution;
    this.atlasSize = _options.atlasSize;
    this.maxVertsPerDraw = _options.maxVertsPerDraw;
    this.enableVertexColors = _options.enableVertexColors;
    this.maxMeshes = maxMeshes;

    this.vertCount = 0;
    this.instanceCount = 0;

    this.meshes = [];
    this.frustumCulled = false;

    this.baseColorMapCanvas = baseColorMapCanvas;
    this.baseColorMapCanvas.width = this.textureResolution * this.atlasSize;
    this.baseColorMapCanvas.height = this.textureResolution * this.atlasSize;
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

    for (let i = 0; i < meshIndicesCount; i++) {
      batchIndices[batchIndicesOffset + i] = meshIndices[i] + this.vertCount;
    }
    
    this.geometry.attributes.instance.array.fill(this.instanceCount, this.vertCount, this.vertCount + meshVertCount);
    this.geometry.attributes.instance.needsUpdate = true;
    
    this.geometry.attributes.position.array.set(geometry.attributes.position.array, this.vertCount * 3);
    this.geometry.attributes.position.needsUpdate = true;

    if (this.vertexColors && geometry.attributes.color) {
      this.geometry.attributes.color.array.set(geometry.attributes.color.array, this.vertCount * 3);
      this.geometry.attributes.color.needsUpdate = true;
    }

    if (geometry.attributes.uv) {
      const batchUvArray = this.geometry.attributes.uv.array;
      const meshUvArray = geometry.attributes.uv.array;
      const uvCount = geometry.attributes.uv.count;
      const texIdxX = this.instanceCount % this.atlasSize;
      const texIdxY = Math.floor(this.instanceCount / this.atlasSize);
      const sOffset = texIdxX / this.atlasSize;
      const tOffset = texIdxY / this.atlasSize;

      for (let i = 0; i < uvCount; i++) {
        const normalizedS =  meshUvArray[i * 2] / this.atlasSize;
        const normalizedT = meshUvArray[i * 2 + 1] / this.atlasSize;
        batchUvArray[(this.vertCount + i) * 2] = normalizedS + sOffset;
        batchUvArray[(this.vertCount + i) * 2 + 1] = normalizedT + tOffset;
      }

      this.geometry.attributes.uv.needsUpdate = true;
    }

    this.vertCount += meshVertCount;

    this.geometry.setDrawRange(0, this.geometry.drawRange.count + geometry.index.count);
    
    this.geometry.index.needsUpdate = true;

    const material = mesh.material;

    if (material.map && material.map.image) {
      this.baseColorMapCtx.globalCompositeOperation = "source-over"
      this.baseColorMapCtx.drawImage(
        material.map.image,
        this.instanceCount % this.atlasSize * this.textureResolution,
        Math.floor(this.instanceCount / this.atlasSize) * this.textureResolution,
        this.textureResolution,
        this.textureResolution
      );
    }

    if (material.emissiveMap && material.emissiveMap.image) {
      this.baseColorMapCtx.globalCompositeOperation = "lighter"
      this.baseColorMapCtx.drawImage(
        material.emissiveMap.image,
        this.instanceCount % this.atlasSize * this.textureResolution,
        Math.floor(this.instanceCount / this.atlasSize) * this.textureResolution,
        this.textureResolution,
        this.textureResolution
      );
    }

    // TODO: Find a way to add just the occlusion (Red) channel
    // Maybe move to creating the texture with WebGL?
    // if (material.aoMap && material.aoMap.image) {
    //   this.baseColorMapCtx.globalCompositeOperation = "lighter"
    //   this.baseColorMapCtx.drawImage(
    //     material.aoMap.image,
    //     this.instanceCount % this.atlasSize * this.textureResolution,
    //     Math.floor(this.instanceCount / this.atlasSize) * this.textureResolution,
    //     this.textureResolution,
    //     this.textureResolution
    //   );
    // }

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
      uniforms.colors.value[i].copy(mesh.material.color);
    }
  }
}

export class BatchManager {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.batches = [];
  }

  addMesh(mesh) {
    let nextBatch = null;

    const batches = this.batches;
  
    for (let i = 0; i < this.batches.length; i++) {
      const batch = batches[i];
      if (batch.instanceCount < batch.maxMeshes - 1) {
        nextBatch = batch;
        break;
      }
    }

    if (nextBatch === null) {
      nextBatch = new UnlitBatch();
      this.scene.add(nextBatch);
      this.batches.push(nextBatch);
    }

    nextBatch.addMesh(mesh);
  }

  update() {
    const batches = this.batches;

    for (let i = 0; i < batches.length; i ++) {
      batches[i].update();
    }
  }
}