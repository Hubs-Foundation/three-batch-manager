import { RawUniformsGroup, Color, Matrix4, ClampToEdgeWrapping, RepeatWrapping, MirroredRepeatWrapping } from "three";
import { LayerID } from "./WebGLAtlasTexture";

/**
 * Use glsl-literal extension for syntax highlighting.
 * https://github.com/giniedp/vscode-glsl-literal
 */

const glsl = (x: TemplateStringsArray) => x.join();

export const INSTANCE_DATA_BYTE_LENGTH = 112;

export type InstanceID = number;

const tempVec4Array = [0, 0, 0, 0];

const WrapModes = {
  [ClampToEdgeWrapping]: 0,
  [RepeatWrapping]: 1,
  [MirroredRepeatWrapping]: 2
};

export class BatchRawUniformGroup extends RawUniformsGroup {
  transforms: Float32Array;
  colors: Float32Array;
  uvTransforms: Float32Array;
  mapSettings: Float32Array;

  private nextIdx: InstanceID;
  private freed: InstanceID[];

  data: ArrayBuffer;

  constructor(maxInstances: number, name = "InstanceData") {
    super(new ArrayBuffer(maxInstances * INSTANCE_DATA_BYTE_LENGTH));
    this.setName(name);

    let offset = 0;

    this.transforms = new Float32Array(this.data, offset, 16 * maxInstances);
    offset += this.transforms.byteLength;

    this.colors = new Float32Array(this.data, offset, 4 * maxInstances);
    offset += this.colors.byteLength;

    this.uvTransforms = new Float32Array(this.data, offset, 4 * maxInstances);
    offset += this.uvTransforms.byteLength;

    // [textureIndex, wrapS, wrapT, FREE] vec4 aligned so 4th element is free for use
    this.mapSettings = new Float32Array(this.data, offset, 4 * maxInstances);

    this.nextIdx = 0;
    this.freed = [];
  }

  nextId() {
    return this.freed.length ? this.freed.pop() : this.nextIdx++;
  }

  freeId(idx: number) {
    this.freed.push(idx);
    console.log("freed instance", idx, this.freed);
  }

  setInstanceColor(instanceId: InstanceID, color: Color, opacity: number) {
    tempVec4Array[0] = color.r;
    tempVec4Array[1] = color.g;
    tempVec4Array[2] = color.b;
    tempVec4Array[3] = opacity;

    this.colors.set(tempVec4Array, instanceId * 4);
  }

  setInstanceTransform(instanceId: InstanceID, matrixWorld: Matrix4) {
    this.transforms.set(matrixWorld.elements, instanceId * 16);
  }

  setInstanceUVTransform(instanceId: InstanceID, transformVec4: number[]) {
    this.uvTransforms.set(transformVec4, instanceId * 4);
  }

  setInstanceMapSettings(instanceId: InstanceID, mapIndex: LayerID, wrapS: number, wrapT: number) {
    this.mapSettings[instanceId * 4] = mapIndex;
    this.mapSettings[instanceId * 4 + 1] = WrapModes[wrapS] || 0;
    this.mapSettings[instanceId * 4 + 2] = WrapModes[wrapT] || 0;
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
  vec4 mapSettings[MAX_INSTANCES];
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

flat out vec4 vUVTransform;
flat out vec4 vMapSettings;

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
  vMapSettings = instanceData.mapSettings[instanceIndex];

  vec2 uvMin = vUVTransform.xy;
  vec2 uvScale = vUVTransform.zw;

  vUv = uv;

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
flat in vec4 vUVTransform;
flat in vec4 vMapSettings;

out vec4 outColor;

float applyWrapping(float value, int mode) {
  if (mode == 0) {
    // CLAMP_TO_EDGE - default
    return clamp(value, 0.0, 1.0);
  } else if (mode == 1) {
    // REPEAT
    return fract(value);
  } else {
    // MIRRORED_REPEAT
    float n = mod(value, 2.0);
    return mix(n, 2.0 - n, step(1.0, n));
  }
}

void main() {
  vec2 uv = vUv;

  int wrapS = int(vMapSettings.y);
  int wrapT = int(vMapSettings.z);
  uv.s = applyWrapping(uv.s, wrapS);
  uv.t = applyWrapping(uv.t, wrapT);

  vec2 uvMin = vUVTransform.xy;
  vec2 uvScale = vUVTransform.zw;
  uv = uv * uvScale + uvMin;

  int mapIdx = int(vMapSettings.x);
  outColor = texture(map, vec3(uv, mapIdx)) * vColor;
}
`;
