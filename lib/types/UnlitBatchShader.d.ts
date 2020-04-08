import { RawUniformsGroup, Color, Matrix4 } from "three";
import WebGLAtlasTexture, { LayerID } from "./WebGLAtlasTexture";
import { BatchableMesh } from ".";
export declare const INSTANCE_DATA_BYTE_LENGTH = 112;
export declare type InstanceID = number;
export declare class BatchRawUniformGroup extends RawUniformsGroup {
    transforms: Float32Array;
    colors: Float32Array;
    uvTransforms: Float32Array;
    mapSettings: Float32Array;
    private nextIdx;
    private freed;
    private meshes;
    data: ArrayBuffer;
    offset: number;
    constructor(maxInstances: number, name?: string, data?: ArrayBuffer);
    addMesh(mesh: BatchableMesh, atlas: WebGLAtlasTexture): InstanceID | false;
    removeMesh(mesh: BatchableMesh, atlas: WebGLAtlasTexture): void;
    update(_time: number): void;
    nextId(): number;
    freeId(idx: number): void;
    setInstanceColor(instanceId: InstanceID, color: Color, opacity: number): void;
    setInstanceTransform(instanceId: InstanceID, matrixWorld: Matrix4): void;
    setInstanceUVTransform(instanceId: InstanceID, transformVec4: number[]): void;
    setInstanceMapSettings(instanceId: InstanceID, mapIndex: LayerID, wrapS: number, wrapT: number): void;
}
export declare const vertexShader: string;
export declare const fragmentShader: string;
