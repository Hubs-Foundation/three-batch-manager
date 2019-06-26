import { RawUniformsGroup } from "three";

/**
 * Use glsl-literal extension for syntax highlighting.
 * https://github.com/giniedp/vscode-glsl-literal
 **/

const glsl = x => x.join();

export const INSTANCE_DATA_BYTE_LENGTH = 112;

const tempVec4Array = [0, 0, 0, 0];
export class BatchRawUniformGroup extends RawUniformsGroup {
  constructor(maxInstances, name = "InstanceData") {
    super(new ArrayBuffer(maxInstances * INSTANCE_DATA_BYTE_LENGTH));
    this.setName(name);

    let offset = 0;

    this.transforms = new Float32Array(this.data, offset, 16 * maxInstances);
    offset += this.transforms.byteLength;

    this.colors = new Float32Array(this.data, offset, 4 * maxInstances);
    offset += this.colors.byteLength;

    this.uvTransforms = new Float32Array(this.data, offset, 4 * maxInstances);
    offset += this.uvTransforms.byteLength;

    this.mapIndices = new Uint32Array(this.data, offset, 4 * maxInstances);

    this.nextIdx = 0;
    this.freed = [];
  }

  nextId() {
    return this.freed.length ? this.freed.pop() : this.nextIdx++;
  }

  freeId(idx) {
    this.freed.push(idx);
    console.log("freed instance", idx, this.freed);
  }

  setInstanceColor(instanceId, color, opacity) {
    tempVec4Array[0] = color.r;
    tempVec4Array[1] = color.g;
    tempVec4Array[2] = color.b;
    tempVec4Array[3] = opacity;

    this.colors.set(tempVec4Array, instanceId * 4);
  }

  setInstanceTransform(instanceId, matrixWorld) {
    this.transforms.set(matrixWorld.elements, instanceId * 16);
  }

  setInstanceUVTransform(instanceId, transformVec4) {
    this.uvTransforms.set(transformVec4, instanceId * 4);
  }

  setInstanceMapIndex(instanceId, mapIndex) {
    this.mapIndices[instanceId * 4] = mapIndex;
  }
}

export const vertexShader = glsl`#version 300 es
precision highp float;
precision highp int;

// Keep these separate so three only sets them once
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;

layout(std140) uniform InstanceData {
  mat4 transforms[MAX_INSTANCES];
  vec4 colors[MAX_INSTANCES];
  vec4 uvTransforms[MAX_INSTANCES];
  uint mapIndices[MAX_INSTANCES];
} instanceData;

in vec3 position;
in vec2 uv;

#ifdef PSEUDO_INSTANCING
in float instance;
#endif

#ifdef VERTEX_COLORS
in vec3 color;
#endif

out vec2 vUv;
out vec4 vColor;
flat out uint vMapIdx;

flat out vec4 vUVTransform;

void main() {
  #ifdef PSEUDO_INSTANCING
  uint instanceIndex = uint(instance);
  #elif
  uint instanceIndex = gl_InstanceID;
  #endif

  vColor = instanceData.colors[instanceIndex];

  #ifdef VERTEX_COLORS
  vColor *= vec4(color, 1.0);
  #endif

  vUVTransform = instanceData.uvTransforms[instanceIndex];

  vec2 uvMin = vUVTransform.xy;
  vec2 uvScale = vUVTransform.zw;

  vUv = uvMin + (uv * uvScale);

  vMapIdx = instanceData.mapIndices[instanceIndex];
  gl_Position = projectionMatrix * viewMatrix * instanceData.transforms[instanceIndex] * vec4(position, 1.0);
}
`;

export const fragmentShader = glsl`#version 300 es
precision highp float;
precision highp int;
precision highp sampler2DArray;

uniform sampler2DArray map;

in vec2 vUv;
in vec4 vColor;
flat in uint vMapIdx;
flat in vec4 vUVTransform;

out vec4 outColor;

void main() {
  vec2 uvMin = vUVTransform.xy;
  vec2 uvScale = vUVTransform.zw;
  vec2 uv = vUv;

  uv = fract((uv - uvMin) / uvScale) * uvScale + uvMin;
  
  outColor = texture(map, vec3(uv, vMapIdx)) * vColor;
}
`;
