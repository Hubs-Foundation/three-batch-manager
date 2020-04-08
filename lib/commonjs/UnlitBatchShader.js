"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const three_1 = require("three");
/**
 * Use glsl-literal extension for syntax highlighting.
 * https://github.com/giniedp/vscode-glsl-literal
 */
const glsl = (x) => x.join();
exports.INSTANCE_DATA_BYTE_LENGTH = 112;
const tempColorArray = [0, 0, 0, 0];
const WrapModes = {
    [three_1.ClampToEdgeWrapping]: 0,
    [three_1.RepeatWrapping]: 1,
    [three_1.MirroredRepeatWrapping]: 2
};
const DEFAULT_COLOR = new three_1.Color(1, 1, 1);
const HIDE_MATRIX = new three_1.Matrix4().makeScale(0, 0, 0);
const tempUvTransform = [0, 0, 0, 0];
class BatchRawUniformGroup extends three_1.RawUniformsGroup {
    constructor(maxInstances, name = "InstanceData", data = new ArrayBuffer(maxInstances * exports.INSTANCE_DATA_BYTE_LENGTH)) {
        super(data);
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
        offset += this.mapSettings.byteLength;
        this.offset = offset;
        this.nextIdx = 0;
        this.freed = [];
        this.meshes = new Array(maxInstances);
    }
    addMesh(mesh, atlas) {
        // const meshIndiciesAttribute = geometry.index;
        const instanceId = this.nextId();
        const material = mesh.material;
        if (material.map) {
            const textureId = atlas.addTexture(material.map, tempUvTransform);
            if (textureId === undefined) {
                console.warn("Mesh could not be batched. Texture atlas full.");
                this.freeId(instanceId);
                return false;
            }
            this.setInstanceUVTransform(instanceId, tempUvTransform);
            this.setInstanceMapSettings(instanceId, textureId[0], material.map.wrapS, material.map.wrapT);
        }
        else {
            this.setInstanceUVTransform(instanceId, atlas.nullTextureTransform);
            this.setInstanceMapSettings(instanceId, atlas.nullTextureIndex[0], three_1.ClampToEdgeWrapping, three_1.ClampToEdgeWrapping);
        }
        this.setInstanceTransform(instanceId, mesh.matrixWorld);
        this.setInstanceColor(instanceId, material.color || DEFAULT_COLOR, material.opacity || 1);
        this.meshes[instanceId] = mesh;
        return instanceId;
    }
    removeMesh(mesh, atlas) {
        const instanceId = this.meshes.indexOf(mesh);
        if (mesh.material.map) {
            atlas.removeTexture(mesh.material.map);
        }
        this.setInstanceTransform(instanceId, HIDE_MATRIX);
        this.freeId(instanceId);
        this.meshes[instanceId] = null;
    }
    update(_time) {
        for (let instanceId = 0; instanceId < this.meshes.length; instanceId++) {
            const mesh = this.meshes[instanceId];
            if (!mesh) {
                continue;
            }
            // TODO need to account for nested visibility deeper than 1 level
            this.setInstanceTransform(instanceId, mesh.visible && mesh.parent.visible ? mesh.matrixWorld : HIDE_MATRIX);
            this.setInstanceColor(instanceId, mesh.material.color || DEFAULT_COLOR, mesh.material.opacity || 1);
        }
    }
    nextId() {
        return this.freed.length ? this.freed.pop() : this.nextIdx++;
    }
    freeId(idx) {
        this.freed.push(idx);
    }
    setInstanceColor(instanceId, color, opacity) {
        tempColorArray[0] = color.r;
        tempColorArray[1] = color.g;
        tempColorArray[2] = color.b;
        tempColorArray[3] = opacity;
        this.colors.set(tempColorArray, instanceId * 4);
    }
    setInstanceTransform(instanceId, matrixWorld) {
        this.transforms.set(matrixWorld.elements, instanceId * 16);
    }
    setInstanceUVTransform(instanceId, transformVec4) {
        this.uvTransforms.set(transformVec4, instanceId * 4);
    }
    setInstanceMapSettings(instanceId, mapIndex, wrapS, wrapT) {
        this.mapSettings[instanceId * 4] = mapIndex;
        this.mapSettings[instanceId * 4 + 1] = WrapModes[wrapS] || 0;
        this.mapSettings[instanceId * 4 + 2] = WrapModes[wrapT] || 0;
    }
}
exports.BatchRawUniformGroup = BatchRawUniformGroup;
exports.vertexShader = glsl `#version 300 es
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

out float fogDepth;

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

  vUv = uv;
  vUVTransform = instanceData.uvTransforms[instanceIndex];
  vMapSettings = instanceData.mapSettings[instanceIndex];

  vec4 mvPosition = viewMatrix * instanceData.transforms[instanceIndex] * vec4(position, 1.0);

  gl_Position = projectionMatrix * mvPosition;

  fogDepth = -mvPosition.z;
}
`;
exports.fragmentShader = glsl `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2DArray;

uniform sampler2DArray map;

in float fogDepth;
uniform vec3 fogColor;

// Fog Type
// 0.0 -> disabled
// 1.0 -> linear
// 2.0 -> exponential
uniform vec4 fogOptions; // r = type; g = density; b = near; a = far;

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
  uv = uvMin + uv * uvScale;

  int mapIdx = int(vMapSettings.x);
  outColor = texture(map, vec3(uv, mapIdx)) * vColor;

  float fogType = fogOptions.r;

  if (fogType > 0.5) {
    float fogFactor = 0.0;

    if (fogType < 1.5) {
      float fogNear = fogOptions.z;
      float fogFar = fogOptions.w;
      fogFactor = smoothstep( fogNear, fogFar, fogDepth );
    } else {
      float fogDensity = fogOptions.y;
      fogFactor = 1.0 - exp( - fogDensity * fogDensity * fogDepth * fogDepth );
    }

    outColor.rgb = mix( outColor.rgb, fogColor, fogFactor );
  }
}
`;
//# sourceMappingURL=UnlitBatchShader.js.map