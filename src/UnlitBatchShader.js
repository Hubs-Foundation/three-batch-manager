import { RawUniformsGroup } from "three";

/**
 * Use glsl-literal extension for syntax highlighting.
 * https://github.com/giniedp/vscode-glsl-literal
 **/

const glsl = x => x;

export const INSTANCE_DATA_BYTE_LENGTH = 100

export function createUBO(maxInstances) {
  const uniformsBuffer = new ArrayBuffer(maxInstances * INSTANCE_DATA_BYTE_LENGTH);
  const uniformsGroup = new RawUniformsGroup(uniformsBuffer);
  
  let offset = 0;
  
  const transforms = new Float32Array(uniformsBuffer, offset, 16 * maxInstances);
  offset += transforms.byteLength;

  const colors = new Float32Array(uniformsBuffer, offset, 4 * maxInstances);
  offset += colors.byteLength;

  const uvTransforms = new Float32Array(uniformsBuffer, offset, 4 * maxInstances);
  offset += uvTransforms.byteLength;

  const mapIndices = new Uint32Array(uniformsBuffer, offset, maxInstances);

  return {
    uniformsGroup,
    transforms,
    colors,
    uvTransforms,
    mapIndices
  };
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

#ifdef PSEUDO_INSTANCING
in uint instance;
#endif

#ifdef VERTEX_COLORS
in vec3 color;
#endif

in vec2 uv;

out vec2 vUv;
out vec3 vColor;
flat out uint vMapIdx;

#ifdef TEXTURE_TRANSFORM
flat out vec4 vUVTransform;
#endif

void main() {
  #ifdef PSEUDO_INSTANCING
  int instanceIndex = instance;
  #elif
  int instanceIndex = gl_InstanceID;
  #endif

  vUv = uv;

  vColor = instanceData.colors[instanceIndex];

  #ifdef VERTEX_COLORS
  vColor *= color; 
  #endif

  #ifdef TEXTURE_TRANSFORM
  vUVTransform = instanceData.uvTransform[instanceIndex];
  #endif
  
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
in vec3 vColor;
flat in int vMapIdx;

#ifdef TEXTURE_TRANSFORM
flat in vec4 vUVTransform;
#endif

out outColor;

void main() {
  vec2 uv = vUv;

  #ifdef TEXTURE_TRANSFORM
  vec2 uvScale = vUVTransform.xy;
  vec2 uvMin = vUVTransform.zw;
  uv = fract((uv - uvMin) / uvScale) * uvScale + uvMin;
  #endif

  outColor = texture(map, vec3(uv, vMapIdx)) * vec4(vColor, 1.0);
}
`;