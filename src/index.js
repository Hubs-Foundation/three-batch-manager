import {
  Mesh,
  RawShaderMaterial,
  BufferGeometry,
  Matrix4,
  Color,
  Uint32BufferAttribute,
  Float32BufferAttribute
} from "three";
import WebGLAtlasTexture from "./WebGLAtlasTexture";
import { vertexShader, fragmentShader, BatchRawUniformGroup } from "./UnlitBatchShader";

const HIDE_MATRIX = new Matrix4().makeScale(0, 0, 0);
const DEFAULT_COLOR = new Color(1, 1, 1);

const tempVec4Array = [0, 0, 0, 0];

export class UnlitBatch extends Mesh {
  constructor(options = {}) {
    const _options = Object.assign(
      {
        maxVertsPerDraw: 65536 * 2,
        enableVertexColors: true,
        pseudoInstancing: true,
        maxInstances: 512
      },
      options
    );

    const geometry = new BufferGeometry();
    geometry.addAttribute("instance", new Float32BufferAttribute(new Float32Array(_options.maxVertsPerDraw), 1));
    geometry.addAttribute("position", new Float32BufferAttribute(new Float32Array(_options.maxVertsPerDraw * 3), 3));

    if (_options.enableVertexColors) {
      geometry.addAttribute(
        "color",
        new Float32BufferAttribute(new Float32Array(_options.maxVertsPerDraw * 3).fill(1), 3)
      );
    }

    geometry.addAttribute("uv", new Float32BufferAttribute(new Float32Array(_options.maxVertsPerDraw * 2), 2));
    geometry.setIndex(new Uint32BufferAttribute(new Uint32Array(_options.maxVertsPerDraw), 1));
    geometry.setDrawRange(0, 0);

    const material = new RawShaderMaterial({
      vertexShader,
      fragmentShader,
      defines: {
        MAX_INSTANCES: _options.maxInstances,
        PSEUDO_INSTANCING: _options.pseudoInstancing,
        VERTEX_COLORS: _options.enableVertexColors
      },
      uniforms: {
        map: { value: _options.atlas }
      }
    });

    material.uniformsGroups = [_options.ubo];

    super(geometry, material);

    this.maxVertsPerDraw = _options.maxVertsPerDraw;
    this.enableVertexColors = _options.enableVertexColors;
    this.maxInstances = _options.maxInstances;

    this.vertCount = 0;

    // these are all parallel, and always added to at the end. They match the order in the geometry but not the UBO
    this.textureIds = [];
    this.meshes = [];
    this.instanceIds = [];

    this.frustumCulled = false;

    this.atlas = _options.atlas;
    this.ubo = _options.ubo;
  }

  addMesh(mesh) {
    const geometry = mesh.geometry;
    const material = mesh.material;

    mesh.updateMatrixWorld(true);

    // const meshIndiciesAttribute = geometry.index;
    const instanceId = this.ubo.nextId();
    const meshIndices = geometry.index.array;
    const meshIndicesCount = geometry.index.count;
    const meshVertCount = geometry.attributes.position.count;
    const batchIndicesArray = this.geometry.index.array;
    const batchIndicesOffset = this.geometry.drawRange.count;

    console.log("add mesh", instanceId, this.meshes.length);

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

    if (material.map && material.map.image) {
      // this.baseColorMapCtx.globalCompositeOperation = "source-over";
      // this.baseColorMapCtx.drawImage(
      //   material.map.image,
      //   (instanceId % this.atlasSize) * this.textureResolution,
      //   Math.floor(instanceId / this.atlasSize) * this.textureResolution,
      //   this.textureResolution,
      //   this.textureResolution
      // );

      const textureId = this.material.uniforms.map.value.addImage(material.map.image, tempVec4Array);
      this.textureIds.push(textureId);

      this.ubo.setInstanceUVTransform(instanceId, tempVec4Array);
      this.ubo.setInstanceMapIndex(instanceId, textureId[0]);
    } else {
      this.ubo.setInstanceUVTransform(instanceId, this.atlas.nullTextureTransform);
      this.ubo.setInstanceMapIndex(instanceId, this.atlas.nullTextureIndex);
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

    this.ubo.setInstanceTransform(instanceId, mesh.matrixWorld);
    this.ubo.setInstanceColor(instanceId, material.color || DEFAULT_COLOR, material.opacity || 1);
    this.material.needsUpdate = true;

    // TODO this is how we are excluding the original mesh from renderlist for now, maybe do something better?
    mesh.layers.disable(0);

    this.meshes.push(mesh);
    this.instanceIds.push(instanceId);
  }

  removeMesh(mesh) {
    const indexInBatch = this.meshes.indexOf(mesh);
    const instanceId = this.instanceIds[indexInBatch];

    console.log(`Removing mesh from batch instance: ${instanceId} indexInBatch: ${indexInBatch}`);

    let preVertCount = 0;
    let preIndexCount = 0;
    for (let i = 0; i < indexInBatch; i++) {
      const geometry = this.meshes[i].geometry;
      preVertCount += geometry.attributes.position.count;
      preIndexCount += geometry.index.count;
    }

    const vertCount = mesh.geometry.attributes.position.count;
    const batchAttributes = this.geometry.attributes;
    batchAttributes.instance.array.copyWithin(preVertCount, preVertCount + vertCount);
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

    this.textureIds[indexInBatch] && this.material.uniforms.map.value.removeImage(this.textureIds[indexInBatch]);

    this.ubo.setInstanceTransform(instanceId, HIDE_MATRIX);
    this.ubo.freeId(instanceId);
    this.material.needsUpdate = true;

    this.meshes.splice(indexInBatch, 1);
    this.textureIds.splice(indexInBatch, 1);
    this.instanceIds.splice(indexInBatch, 1);
  }

  update() {
    for (let i = 0; i < this.meshes.length; i++) {
      const mesh = this.meshes[i];
      const instanceId = this.instanceIds[i];
      mesh.updateMatrices && mesh.updateMatrices();
      //TODO need to account for nested visibility deeper than 1 level
      this.ubo.setInstanceTransform(instanceId, mesh.visible && mesh.parent.visible ? mesh.matrixWorld : HIDE_MATRIX);
      this.ubo.setInstanceColor(instanceId, mesh.material.color || DEFAULT_COLOR, mesh.material.opacity || 1);
    }
  }
}

export class BatchManager {
  constructor(scene, renderer, maxInstances = 512) {
    this.scene = scene;
    this.renderer = renderer;
    this.maxInstances = maxInstances;

    this.batches = [];
    this.batchForMesh = new WeakMap();

    this.atlas = new WebGLAtlasTexture(renderer);
    this.ubo = new BatchRawUniformGroup(maxInstances);

    this.instanceCount = 0;
  }

  addMesh(mesh) {
    if (this.instanceCount >= this.maxInstances) {
      console.warn("Batch is full, not batching", mesh);
      return false;
    }

    let nextBatch = null;

    const batches = this.batches;

    for (let i = 0; i < this.batches.length; i++) {
      const batch = batches[i];
      if (
        mesh.material.side === batch.material.side &&
        batch.geometry.drawRange.count + mesh.geometry.index.count < batch.maxVertsPerDraw &&
        batch.vertCount + mesh.geometry.attributes.position.count < batch.maxVertsPerDraw
      ) {
        nextBatch = batch;
        break;
      }
    }

    if (nextBatch === null) {
      nextBatch = new UnlitBatch({
        renderer: this.renderer,
        atlas: this.atlas,
        maxInstances: this.maxInstances,
        ubo: this.ubo
      });
      nextBatch.material.side = mesh.material.side;
      this.scene.add(nextBatch);
      this.batches.push(nextBatch);
      console.log("Allocating new batch", this.batches.length);
    }

    nextBatch.addMesh(mesh);
    this.batchForMesh.set(mesh, nextBatch);
    this.instanceCount++;

    return true;
  }

  removeMesh(mesh) {
    const batch = this.batchForMesh.get(mesh);
    batch.removeMesh(mesh);
    this.batchForMesh.delete(mesh);
    this.instanceCount--;
  }

  update() {
    const batches = this.batches;

    for (let i = 0; i < batches.length; i++) {
      batches[i].update();
    }
  }
}
