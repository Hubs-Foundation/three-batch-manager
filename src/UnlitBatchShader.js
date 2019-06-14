import { RawUniformsGroup } from "three";

/**
 * Use glsl-literal extension for syntax highlighting.
 * https://github.com/giniedp/vscode-glsl-literal
 **/

const glsl = x => x.join();

export const INSTANCE_DATA_BYTE_LENGTH = 112;

export function createUBO(maxInstances) {
  const uniformsBuffer = new ArrayBuffer(maxInstances * INSTANCE_DATA_BYTE_LENGTH);
  const uniformsGroup = new RawUniformsGroup(uniformsBuffer);
  uniformsGroup.setName("InstanceData");

  let offset = 0;

  const transforms = new Float32Array(uniformsBuffer, offset, 16 * maxInstances);
  offset += transforms.byteLength;

  const colors = new Float32Array(uniformsBuffer, offset, 4 * maxInstances);
  offset += colors.byteLength;

  const uvTransforms = new Float32Array(uniformsBuffer, offset, 4 * maxInstances);
  offset += uvTransforms.byteLength;

  const mapIndices = new Uint32Array(uniformsBuffer, offset, 4 * maxInstances);

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

  vUv = uv;

  vColor = instanceData.colors[instanceIndex];

  #ifdef VERTEX_COLORS
  vColor *= vec4(color, 1.0);
  #endif

  vUVTransform = instanceData.uvTransforms[instanceIndex];

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
  vec2 uv = uvMin + (vUv * uvScale);
  outColor = texture(map, vec3(uv, vMapIdx)) * vColor;
}
`;
