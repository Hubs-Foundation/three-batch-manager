import { Mesh, RawShaderMaterial, BufferGeometry, Matrix4, Matrix3, Color, BufferAttribute, DoubleSide, CanvasTexture } from "three";

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
    uniform mat3 uvTransforms[MAX_MESHES];

    attribute vec3 position;
    attribute float instance;
    attribute vec3 color;
    attribute vec2 uv;

    varying vec2 vUv;
    varying vec2 vUvMin;
    varying vec2 vUvScale;
    varying vec3 vColor;

    void main() {
      highp int instanceIndex = int(instance);
      mat3 uvTransform = uvTransforms[instanceIndex];
      vUv = (uvTransform * vec3( uv, 1 )).xy;
      vUvMin = uvTransform[2].xy;
      vUvScale = vec2(uvTransform[0][0], uvTransform[1][1]);
      vColor = color * colors[instanceIndex];
      gl_Position = projectionMatrix * viewMatrix * transforms[instanceIndex] * vec4(position, 1.0);
    }
    `,

    fragmentShader: `
    precision highp float;
    precision highp int;
    
    uniform sampler2D map;
    
    varying vec2 vUv;
    varying vec2 vUvMin;
    varying vec2 vUvScale;
    varying vec3 vColor;
    
    void main() {
      vec2 uv = vUv;
      uv = fract((uv - vUvMin) / vUvScale) * vUvScale + vUvMin;
      gl_FragColor = texture2D(map, uv) * vec4(vColor, 1.0);
    }
    `
  };
};

const HIDE_MATRIX = new Matrix4().makeScale(0,0,0);

export class UnlitBatch extends Mesh {
  constructor(options = {}) {
    const _options = Object.assign({
      textureResolution: 1024,
      atlasSize: 4,
      maxVertsPerDraw: 65536,
      enableVertexColors: true
    }, options);

    const maxMeshes = _options.atlasSize * _options.atlasSize;

    const geometry = new BufferGeometry();
    geometry.addAttribute("instance", new BufferAttribute(new Float32Array(_options.maxVertsPerDraw), 1));
    geometry.addAttribute("position", new BufferAttribute(new Float32Array(_options.maxVertsPerDraw * 3), 3));

    if (_options.enableVertexColors) {
      geometry.addAttribute("color", new BufferAttribute(new Float32Array(_options.maxVertsPerDraw * 3).fill(1), 3));
    }

    geometry.addAttribute("uv", new BufferAttribute(new Float32Array(_options.maxVertsPerDraw * 2), 2));
    geometry.setIndex(new BufferAttribute(new Uint16Array(_options.maxVertsPerDraw), 1));
    geometry.setDrawRange(0, 0);

    const transforms = [];
    const uvTransforms = [];
    const colors = [];

    for (let i = 0; i < maxMeshes; i++) {
      transforms.push(new Matrix4());
      uvTransforms.push(new Matrix3());
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
        colors: { value: colors },
        uvTransforms: { value: uvTransforms }
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
    const geometry = mesh.geometry;
    const material = mesh.material;
    const batchUniforms = this.material.uniforms;

    mesh.updateMatrixWorld(true);

    const meshIndiciesAttribute = geometry.index;
    const meshIndices = geometry.index.array;
    const meshIndicesCount = geometry.index.count;
    const meshVertCount = geometry.attributes.position.count;
    const batchIndicesArray = this.geometry.index.array;
    const batchIndicesOffset = this.geometry.drawRange.count;

    for (let i = 0; i < meshIndicesCount; i++) {
      batchIndicesArray[batchIndicesOffset + i] = meshIndices[i] + this.vertCount;
    }
    // meshIndiciesAttribute.setArray(batchIndicesArray.subarray(batchIndicesOffset, batchIndicesOffset + meshIndicesCount))
    
    this.geometry.attributes.instance.array.fill(this.instanceCount, this.vertCount, this.vertCount + meshVertCount);
    this.geometry.attributes.instance.needsUpdate = true;
    
    const meshPositionsAttribute = geometry.attributes.position;
    const batchPositionsArray = this.geometry.attributes.position.array;
    for (let i = 0; i < meshVertCount; i++) {
      batchPositionsArray[(this.vertCount + i) * 3] = meshPositionsAttribute.getX(i);
      batchPositionsArray[(this.vertCount + i) * 3 + 1] = meshPositionsAttribute.getY(i);
      batchPositionsArray[(this.vertCount + i) * 3 + 2] = meshPositionsAttribute.getZ(i);
    }

    // meshPositionsAttribute.setArray(batchPositionsArray.subarray(this.vertCount * 3, this.vertCount * 3 + meshVertCount * 3))
    this.geometry.attributes.position.needsUpdate = true;

    if (this.enableVertexColors && geometry.attributes.color) {
      const meshColorAttribute = geometry.attributes.color;
      const batchColorArray = this.geometry.attributes.color.array;

      for (let i = 0; i < meshVertCount; i++) {
        batchColorArray[(this.vertCount + i) * 3] = meshColorAttribute.getX(i);
        batchColorArray[(this.vertCount + i) * 3 + 1] = meshColorAttribute.getY(i);
        batchColorArray[(this.vertCount + i) * 3 + 2] = meshColorAttribute.getZ(i);
      }

      // meshColorAttribute.setArray(batchColorArray.subarray(this.vertCount * 3, this.vertCount * 3 + meshVertCount * 3 ))
      this.geometry.attributes.color.needsUpdate = true;
    }

    if (geometry.attributes.uv) {
      const batchUvArray = this.geometry.attributes.uv.array;
      const meshUvAttribute = geometry.attributes.uv;
      const uvCount = geometry.attributes.uv.count;
      const texIdxX = this.instanceCount % this.atlasSize;
      const texIdxY = Math.floor(this.instanceCount / this.atlasSize);
      const sOffset = texIdxX / this.atlasSize;
      const tOffset = texIdxY / this.atlasSize;

      batchUniforms.uvTransforms.value[this.instanceCount].setUvTransform(sOffset, tOffset, 1 / this.atlasSize, 1 / this.atlasSize, 0, 0, 0);

      for (let i = 0; i < uvCount; i++) {
        batchUvArray[(this.vertCount + i) * 2] = meshUvAttribute.getX(i) ;
        batchUvArray[(this.vertCount + i) * 2 + 1] = meshUvAttribute.getY(i);
      }

      // meshUvAttribute.setArray(batchUvArray.subarray(this.vertCount * 2, this.vertCount * 2 + uvCount * 2))
      this.geometry.attributes.uv.needsUpdate = true;
    }

    this.vertCount += meshVertCount;

    this.geometry.setDrawRange(0, this.geometry.drawRange.count + geometry.index.count);
    
    this.geometry.index.needsUpdate = true;

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

    batchUniforms.map.value.needsUpdate = true;

    batchUniforms.transforms.value[this.instanceCount].copy(mesh.matrixWorld);

    if (material.color) {
      batchUniforms.colors.value[this.instanceCount].copy(material.color);
    } else {
      batchUniforms.colors.value[this.instanceCount].setRGB(1, 1, 1);
    }
    this.material.needsUpdate = true;

    // TODO this is how we are excluding the original mesh from renderlist for now, maybe do something better?
    mesh.layers.disable(0)

    this.instanceCount++;

    this.meshes.push(mesh);
  }

  update() {
    const uniforms = this.material.uniforms;

    for (let i = 0; i < this.meshes.length; i++) {
      const mesh = this.meshes[i];
      //TODO need to account for nested visibility deeper than 1 level
      uniforms.transforms.value[i].copy(mesh.visible && mesh.parent.visible ? mesh.matrixWorld : HIDE_MATRIX);

      if (mesh.material.color) {
        uniforms.colors.value[i].copy(mesh.material.color);
      } else {
        uniforms.colors.value[i].setRGB(1, 1, 1);
      }
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
      if (batch.instanceCount < batch.maxMeshes - 1 && batch.vertCount + mesh.geometry.index.count < batch.maxVertsPerDraw) {
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
