import { Mesh, RawShaderMaterial, BufferGeometry, MeshStandardMaterial, Scene, WebGLRenderer, BufferAttribute, MeshBasicMaterial, Color, Vector4 } from "three";
import WebGLAtlasTexture from "./WebGLAtlasTexture";
import { BatchRawUniformGroup } from "./UnlitBatchShader";
interface BatchableBufferGeometry extends BufferGeometry {
    attributes: {
        [name: string]: BufferAttribute;
    };
}
export interface BatchableMesh extends Mesh {
    geometry: BatchableBufferGeometry;
    material: MeshStandardMaterial | MeshBasicMaterial;
}
export { BatchRawUniformGroup };
export declare class UnlitBatch extends Mesh {
    bufferSize: number;
    enableVertexColors: boolean;
    maxInstances: number;
    vertCount: number;
    meshes: BatchableMesh[];
    atlas: WebGLAtlasTexture;
    ubo: BatchRawUniformGroup;
    geometry: BatchableBufferGeometry;
    material: RawShaderMaterial;
    constructor(ubo: BatchRawUniformGroup, atlas: WebGLAtlasTexture, options?: {});
    addMesh(mesh: BatchableMesh): boolean;
    removeMesh(mesh: BatchableMesh): void;
}
interface ShaderOverride {
    vertexShader: string;
    fragmentShader: string;
}
interface ShaderOverrides {
    unlit?: ShaderOverride;
}
interface BatchManagerOptions {
    maxInstances?: number;
    maxBufferSize?: number;
    ubo?: BatchRawUniformGroup;
    shaders?: ShaderOverrides;
}
export declare class BatchManager {
    scene: Scene;
    renderer: WebGLRenderer;
    maxInstances: number;
    instanceCount: number;
    maxBufferSize: number;
    batchForMesh: WeakMap<BatchableMesh, UnlitBatch>;
    batches: UnlitBatch[];
    atlas: WebGLAtlasTexture;
    ubo: BatchRawUniformGroup;
    shaders: ShaderOverrides;
    fogOptions: Vector4;
    fogColor: Color;
    sharedUniforms: {};
    constructor(scene: Scene, renderer: WebGLRenderer, options?: BatchManagerOptions);
    addMesh(mesh: Mesh): boolean;
    removeMesh(mesh: Mesh): boolean;
    updateFog(): void;
    update(time: number): void;
}
