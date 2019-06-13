import { Mesh, RawShaderMaterial, BufferGeometry, Matrix4, BufferAttribute, Color } from "three";
import WebGLAtlasTexture from "./WebGLAtlasTexture";
import { createUBO, vertexShader, fragmentShader } from "./UnlitBatchShader";

const HIDE_MATRIX = new Matrix4().makeScale(0, 0, 0);
const DEFAULT_COLOR = new Color(1, 1, 1);
const VEC4_ARRAY = [0, 0, 0];

export class UnlitBatch extends Mesh {
  constructor(options = {}) {
    const _options = Object.assign(
      {
        textureResolution: 1024,
        atlasSize: 4,
        maxVertsPerDraw: 65536,
        enableVertexColors: true,
        enableTextureTransform: false,
        pseudoInstancing: true,
        maxInstances: 512
      },
      options
    );

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

    const ubo = createUBO(_options.maxInstances);

    const baseAtlas = new WebGLAtlasTexture(options.renderer);

    const material = new RawShaderMaterial({
      vertexShader,
      fragmentShader,
      defines: {
        MAX_INSTANCES: _options.maxInstances,
        TEXTURE_TRANSFORM: _options.enableTextureTransform,
        PSEUDO_INSTANCING: _options.pseudoInstancing,
        VERTEX_COLORS: _options.enableVertexColors
      },
      uniforms: {
        map: {
          value: baseAtlas
        }
      }
    });

    material.uniformsGroups = [ubo.uniformsGroup];
    console.log(material);

    super(geometry, material);

    this.maxVertsPerDraw = _options.maxVertsPerDraw;
    this.enableVertexColors = _options.enableVertexColors;
    this.maxMeshes = maxMeshes;

    this.textureIds = [];

    this.vertCount = 0;
    this.instanceCount = 0;

    this.meshes = [];

    this.frustumCulled = false;

    this.ubo = ubo;
  }

  addMesh(mesh) {
    const geometry = mesh.geometry;
    const material = mesh.material;

    mesh.updateMatrixWorld(true);

    // const meshIndiciesAttribute = geometry.index;
    const instanceId = this.instanceCount;
    const meshIndices = geometry.index.array;
    const meshIndicesCount = geometry.index.count;
    const meshVertCount = geometry.attributes.position.count;
    const batchIndicesArray = this.geometry.index.array;
    const batchIndicesOffset = this.geometry.drawRange.count;

    console.log("add mesh", instanceId, meshVertCount, meshIndicesCount);

    for (let i = 0; i < meshIndicesCount; i++) {
      batchIndicesArray[batchIndicesOffset + i] = meshIndices[i] + this.vertCount;
    }
    // meshIndiciesAttribute.setArray(batchIndicesArray.subarray(batchIndicesOffset, batchIndicesOffset + meshIndicesCount))

    this.geometry.attributes.instance.array.fill(instanceId, this.vertCount, this.vertCount + meshVertCount);
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

      for (let i = 0; i < uvCount; i++) {
        batchUvArray[(this.vertCount + i) * 2] = meshUvAttribute.getX(i);
        batchUvArray[(this.vertCount + i) * 2 + 1] = meshUvAttribute.getY(i);
      }

      // meshUvAttribute.setArray(batchUvArray.subarray(this.vertCount * 2, this.vertCount * 2 + uvCount * 2))
      this.geometry.attributes.uv.needsUpdate = true;
    }

    this.vertCount += meshVertCount;

    this.geometry.setDrawRange(0, this.geometry.drawRange.count + geometry.index.count);

    this.geometry.index.needsUpdate = true;

    console.log(material.map);
    if (material.map && material.map.image) {
      // this.baseColorMapCtx.globalCompositeOperation = "source-over";
      // this.baseColorMapCtx.drawImage(
      //   material.map.image,
      //   (instanceId % this.atlasSize) * this.textureResolution,
      //   Math.floor(instanceId / this.atlasSize) * this.textureResolution,
      //   this.textureResolution,
      //   this.textureResolution
      // );

      const textureId = this.material.uniforms.map.value.addImage(
        material.map.image,
        VEC4_ARRAY
      );

      this.setInstanceUVTransform(instanceId, VEC4_ARRAY);
      console.log("textureId", textureId);
      this.setInstanceMapIndex(instanceId, textureId);

      this.textureIds.push(textureId);
    } else {
      this.textureIds.push(null);
    }

    // if (material.emissiveMap && material.emissiveMap.image) {
    //   this.baseColorMapCtx.globalCompositeOperation = "lighter";
    //   this.baseColorMapCtx.drawImage(
    //     material.emissiveMap.image,
    //     (instanceId % this.atlasSize) * this.textureResolution,
    //     Math.floor(instanceId / this.atlasSize) * this.textureResolution,
    //     this.textureResolution,
    //     this.textureResolution
    //   );
    // }

    // TODO: Find a way to add just the occlusion (Red) channel
    // Maybe move to creating the texture with WebGL?
    // if (material.aoMap && material.aoMap.image) {
    //   this.baseColorMapCtx.globalCompositeOperation = "lighter"
    //   this.baseColorMapCtx.drawImage(
    //     material.aoMap.image,
    //     instanceId % this.atlasSize * this.textureResolution,
    //     Math.floor(instanceId / this.atlasSize) * this.textureResolution,
    //     this.textureResolution,
    //     this.textureResolution
    //   );
    // }

    // batchUniforms.map.value.needsUpdate = true;

    this.setInstanceTransform(instanceId, mesh.matrixWorld);
    this.setInstanceColor(instanceId, material.color || DEFAULT_COLOR, material.opacity || 1);
    this.material.needsUpdate = true;

    // TODO this is how we are excluding the original mesh from renderlist for now, maybe do something better?
    mesh.layers.disable(0);

    this.meshes.push(mesh);
    this.instanceCount++;
  }

  removeMesh(mesh) {
    const ubo = this.ubo;
    const idx = this.meshes.indexOf(mesh);
    console.log("Removing", idx);

    let preVertCount = 0;
    let preIndexCount = 0;
    for (let i = 0; i < idx; i++) {
      const geometry = this.meshes[i].geometry;
      preVertCount += geometry.attributes.position.count;
      preIndexCount += geometry.index.count;
    }

    const vertCount = mesh.geometry.attributes.position.count;
    const batchAttributes = this.geometry.attributes;
    let insertAt = preVertCount;
    for (let i = idx + 1; i < this.meshes.length; i++) {
      const geometry = this.meshes[i].geometry;
      const nextVertCount = geometry.attributes.position.count;
      batchAttributes.instance.array.fill(i - 1, insertAt, insertAt + nextVertCount);
      insertAt = insertAt + nextVertCount;
    }
    batchAttributes.instance.needsUpdate = true;
    batchAttributes.position.array.copyWithin(preVertCount * 3, (preVertCount + vertCount) * 3);
    batchAttributes.position.needsUpdate = true;
    batchAttributes.color.array.copyWithin(preVertCount * 3, (preVertCount + vertCount) * 3);
    batchAttributes.color.needsUpdate = true;
    batchAttributes.uv.array.copyWithin(preVertCount * 2, (preVertCount + vertCount) * 2);
    batchAttributes.uv.needsUpdate = true;
    this.vertCount -= vertCount;

    const indexCount = mesh.geometry.index.count;
    const batchIndexArray = this.geometry.index.array;
    this.geometry.setDrawRange(0, this.geometry.drawRange.count - indexCount);
    for (let i = preIndexCount; i < this.geometry.drawRange.count; i++) {
      batchIndexArray[i] = batchIndexArray[i + indexCount] - vertCount;
    }
    this.geometry.index.needsUpdate = true;

    this.textureIds[idx] !== null && this.material.uniforms.map.value.removeImage(this.textureIds[idx]);
    // batchUniforms.map.value.copyWithin(idx, idx+1)
    ubo.transforms.copyWithin(idx * 16, idx * 16 + 1);
    ubo.colors.copyWithin(idx * 4, idx * 4 + 1);
    ubo.uvTransforms.copyWithin(idx * 4, idx * 4 + 1);
    this.material.needsUpdate = true;

    this.meshes.splice(idx, 1);
    this.textureIds.splice(idx, 1);
    this.instanceCount--;

    console.log(
      preVertCount,
      preIndexCount,
      vertCount,
      indexCount,
      this.geometry.drawRange.count,
      batchAttributes,
      this.ubo,
      this.geometry.index,
      this.meshes,
      this.textureIds
    );
  }

  update() {
    for (let i = 0; i < this.meshes.length; i++) {
      const mesh = this.meshes[i];
      mesh.updateMatrices && mesh.updateMatrices();
      //TODO need to account for nested visibility deeper than 1 level
      this.setInstanceTransform(i, mesh.visible && mesh.parent.visible ? mesh.matrixWorld : HIDE_MATRIX);
      this.setInstanceColor(i, mesh.material.color || DEFAULT_COLOR, mesh.material.opacity || 1);
    }
  }

  setInstanceColor(instanceId, color, opacity) {
    VEC4_ARRAY[0] = color.r;
    VEC4_ARRAY[1] = color.g;
    VEC4_ARRAY[2] = color.b;
    VEC4_ARRAY[3] = opacity;

    this.ubo.colors.set(VEC4_ARRAY, instanceId * 4);
  }

  setInstanceTransform(instanceId, matrixWorld) {
    this.ubo.transforms.set(matrixWorld.elements, instanceId * 16);
  }

  setInstanceUVTransform(instanceId, transformVec4) {
    this.ubo.uvTransforms.set(transformVec4, instanceId * 4);
  }

  setInstanceMapIndex(instanceId, mapIndex) {
    this.ubo.mapIndices[instanceId * 4] = mapIndex;
  }
}

export class BatchManager {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.batches = [];
    this.batchForMesh = new WeakMap();
  }

  addMesh(mesh) {
    let nextBatch = null;

    const batches = this.batches;

    for (let i = 0; i < this.batches.length; i++) {
      const batch = batches[i];
      if (
        batch.instanceCount < batch.maxMeshes &&
        batch.geometry.drawRange.count + mesh.geometry.index.count < batch.maxVertsPerDraw &&
        batch.vertCount + mesh.geometry.attributes.position.count < batch.maxVertsPerDraw
      ) {
        nextBatch = batch;
        break;
      }
    }

    if (nextBatch === null) {
      nextBatch = new UnlitBatch({ renderer: this.renderer });
      this.scene.add(nextBatch);
      this.batches.push(nextBatch);
    }

    nextBatch.addMesh(mesh);
    this.batchForMesh.set(mesh, nextBatch);
  }

  removeMesh(mesh) {
    const batch = this.batchForMesh.get(mesh);
    batch.removeMesh(mesh);
    this.batchForMesh.delete(mesh);
  }

  update() {
    const batches = this.batches;

    for (let i = 0; i < batches.length; i++) {
      batches[i].update();
    }
  }
}
