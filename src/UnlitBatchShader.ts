import { RawUniformsGroup, Color, Matrix4, ClampToEdgeWrapping, RepeatWrapping, MirroredRepeatWrapping } from "three";
import WebGLAtlasTexture, { LayerID, UVTransform } from "./WebGLAtlasTexture";
import { BatchableMesh } from ".";

/**
 * Use glsl-literal extension for syntax highlighting.
 * https://github.com/giniedp/vscode-glsl-literal
 */

const glsl = (x: TemplateStringsArray) => x.join();

export const INSTANCE_DATA_BYTE_LENGTH = 112;

export type InstanceID = number;

const tempColorArray = [0, 0, 0, 0];

const WrapModes = {
  [ClampToEdgeWrapping]: 0,
  [RepeatWrapping]: 1,
  [MirroredRepeatWrapping]: 2
};

const DEFAULT_COLOR = new Color(1, 1, 1);
const HIDE_MATRIX = new Matrix4().makeScale(0, 0, 0);

const tempUvTransform: UVTransform = [0, 0, 0, 0];

export class BatchRawUniformGroup extends RawUniformsGroup {
  transforms: Float32Array;
  colors: Float32Array;
  uvTransforms: Float32Array;
  mapSettings: Float32Array;

  hubs_interactorOnePos: Float32Array;
  hubs_interactorTwoPos: Float32Array;
  hubs_sweepParams: Float32Array;

  hubs_isFrozen: Uint32Array;
  hubs_time: Float32Array;

  private nextIdx: InstanceID;
  private freed: InstanceID[];
  private meshes: BatchableMesh[];

  data: ArrayBuffer;

  constructor(maxInstances: number, name = "InstanceData") {
    const hubsDataSize =
      maxInstances * 4 * 4 + // sweepParams
      4 *
        (3 + // interactorOnePos
        1 + // isFrozen
        3 + // interactorTwoPos
        1  // time
         );
    super(new ArrayBuffer(maxInstances * INSTANCE_DATA_BYTE_LENGTH + hubsDataSize));
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

    this.hubs_sweepParams = new Float32Array(this.data, offset, 4 * maxInstances);
    offset += this.hubs_sweepParams.byteLength;

    this.hubs_interactorOnePos = new Float32Array(this.data, offset, 3);
    offset += this.hubs_interactorOnePos.byteLength;

    this.hubs_isFrozen = new Uint32Array(this.data, offset, 1);
    offset += this.hubs_isFrozen.byteLength;

    this.hubs_interactorTwoPos = new Float32Array(this.data, offset, 3);
    offset += this.hubs_interactorTwoPos.byteLength;

    this.hubs_time = new Float32Array(this.data, offset, 1);
    offset += this.hubs_time.byteLength;

    this.nextIdx = 0;
    this.freed = [];
    this.meshes = new Array(maxInstances);
  }

  addMesh(mesh: BatchableMesh, atlas: WebGLAtlasTexture): InstanceID | false {
    // const meshIndiciesAttribute = geometry.index;
    const instanceId = this.nextId();
    const material = mesh.material;

    if (material.map && material.map.image) {
      const textureId = atlas.addTexture(material.map, tempUvTransform);

      if (textureId === undefined) {
        console.warn("Mesh could not be batched. Texture atlas full.");
        this.freeId(instanceId);
        return false;
      }

      this.setInstanceUVTransform(instanceId, tempUvTransform);
      this.setInstanceMapSettings(instanceId, textureId[0], material.map.wrapS, material.map.wrapT);
    } else {
      this.setInstanceUVTransform(instanceId, atlas.nullTextureTransform);
      this.setInstanceMapSettings(instanceId, atlas.nullTextureIndex[0], ClampToEdgeWrapping, ClampToEdgeWrapping);
    }

    this.setInstanceTransform(instanceId, mesh.matrixWorld);
    this.setInstanceColor(instanceId, material.color || DEFAULT_COLOR, material.opacity || 1);

    this.meshes[instanceId] = mesh;

    return instanceId;
  }

  removeMesh(mesh: BatchableMesh, atlas: WebGLAtlasTexture) {
    const instanceId = this.meshes.indexOf(mesh);

    if (mesh.material.map) {
      atlas.removeTexture(mesh.material.map);
    }

    this.setInstanceTransform(instanceId, HIDE_MATRIX);
    this.freeId(instanceId);
    this.meshes[instanceId] = null;
  }

  update(instanceId: number, mesh: BatchableMesh) {
    // TODO need to account for nested visibility deeper than 1 level
    this.setInstanceTransform(instanceId, mesh.visible && mesh.parent.visible ? mesh.matrixWorld : HIDE_MATRIX);
    this.setInstanceColor(instanceId, mesh.material.color || DEFAULT_COLOR, mesh.material.opacity || 1);
  }

  nextId() {
    return this.freed.length ? this.freed.pop() : this.nextIdx++;
  }

  freeId(idx: number) {
    this.freed.push(idx);
    console.log("freed instance", idx, this.freed);
  }

  setInstanceColor(instanceId: InstanceID, color: Color, opacity: number) {
    tempColorArray[0] = color.r;
    tempColorArray[1] = color.g;
    tempColorArray[2] = color.b;
    tempColorArray[3] = opacity;

    this.colors.set(tempColorArray, instanceId * 4);
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

  vec4 hubs_SweepParams[MAX_INSTANCES];

  vec3 hubs_InteractorOnePos;
  bool hubs_IsFrozen;

  vec3 hubs_InteractorTwoPos;
  float hubs_Time;

} instanceData;

out vec3 hubs_WorldPosition;

in vec3 position;
in vec2 uv;

#ifdef PSEUDO_INSTANCING
in float instance;
flat out uint vInstance;
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

  vUv = uv;
  vUVTransform = instanceData.uvTransforms[instanceIndex];
  vMapSettings = instanceData.mapSettings[instanceIndex];

  gl_Position = projectionMatrix * viewMatrix * instanceData.transforms[instanceIndex] * vec4(position, 1.0);

  hubs_WorldPosition = (instanceData.transforms[instanceIndex] * vec4(position, 1.0)).xyz;
  vInstance = instanceIndex;
}
`;

export const fragmentShader = glsl`#version 300 es
precision highp float;
precision highp int;
precision highp sampler2DArray;


layout(std140) uniform InstanceData {
  mat4 transforms[MAX_INSTANCES];
  vec4 colors[MAX_INSTANCES];
  vec4 uvTransforms[MAX_INSTANCES];
  vec4 mapSettings[MAX_INSTANCES];

  vec4 hubs_SweepParams[MAX_INSTANCES];

  vec3 hubs_InteractorOnePos;
  bool hubs_IsFrozen;

  vec3 hubs_InteractorTwoPos;
  float hubs_Time;

} instanceData;
in vec3 hubs_WorldPosition;
#ifdef PSEUDO_INSTANCING
flat in uint vInstance;
#endif


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
  uv = uvMin + uv * uvScale;

  int mapIdx = int(vMapSettings.x);
  outColor = texture(map, vec3(uv, mapIdx)) * vColor;

  bool hubs_HighlightInteractorOne = instanceData.hubs_SweepParams[vInstance].z > 0.0;
  bool hubs_HighlightInteractorTwo = instanceData.hubs_SweepParams[vInstance].w > 0.0;
  bool hubs_IsFrozen = instanceData.hubs_IsFrozen;

  if (hubs_HighlightInteractorOne || hubs_HighlightInteractorTwo || hubs_IsFrozen) {

      bool hubs_EnableSweepingEffect = true;
      vec2 hubs_SweepParams = instanceData.hubs_SweepParams[vInstance].xy;
      float hubs_Time = instanceData.hubs_Time;

      float ratio = 0.0;

      if (hubs_EnableSweepingEffect) {
          float size = hubs_SweepParams.t - hubs_SweepParams.s;
          float line = mod(hubs_Time / 500.0 * size, size * 3.0) + hubs_SweepParams.s - size / 3.0;

          if (hubs_WorldPosition.y < line) {
              // Highlight with a sweeping gradient.
              ratio = max(0.0, 1.0 - (line - hubs_WorldPosition.y) / (size * 1.5));
          }
      }

      // Highlight with a gradient falling off with distance.
      float pulse = 9.0 + 3.0 * (sin(hubs_Time / 1000.0) + 1.0);

      if (hubs_HighlightInteractorOne) {
          float dist1 = distance(hubs_WorldPosition, instanceData.hubs_InteractorOnePos);
          ratio += -min(1.0, pow(dist1 * pulse, 3.0)) + 1.0;
      }

      if (hubs_HighlightInteractorTwo) {
          float dist2 = distance(hubs_WorldPosition, instanceData.hubs_InteractorTwoPos);
          ratio += -min(1.0, pow(dist2 * pulse, 3.0)) + 1.0;
      }

      ratio = min(1.0, ratio);

      // Gamma corrected highlight color
      vec3 highlightColor = vec3(0.184, 0.499, 0.933);

      outColor = vec4((outColor.rgb * (1.0 - ratio)) + (highlightColor * ratio), outColor.a);
  }

}
`;
