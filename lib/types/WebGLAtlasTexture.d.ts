import { Texture, WebGLRenderer } from "three";
export declare type TileID = number;
export declare type LayerID = number;
export interface TextureID extends Array<number> {
    0: LayerID;
    1: TileID;
}
export declare type UVTransform = [number, number, number, number];
declare type UploadableImage = ImageBitmap | HTMLImageElement | HTMLCanvasElement;
declare class Layer {
    freed: TileID[];
    size: number;
    nextIdx: TileID;
    rows: number;
    colls: number;
    maxIdx: TileID;
    constructor(size: number, rows: number, colls: number);
    recycle(size: number, rows: number, colls: number): void;
    nextId(): number;
    freeId(idx: TileID): void;
    isFull(): boolean;
    isEmpty(): boolean;
}
export interface WebGLAtlasTextureOptions {
    layerResolution?: number;
    minTileSize?: number;
    maxLayers?: number;
}
export default class WebGLAtlasTexture extends Texture {
    renderer: WebGLRenderer;
    layerResolution: number;
    minTileSize: number;
    freeLayers: LayerID[];
    layers: Layer[];
    maxLayers: number;
    nullTextureIndex: TextureID;
    glTexture: WebGLTexture;
    arrayDepth: number;
    mipFramebuffers: WebGLFramebuffer[][];
    nullTextureTransform: UVTransform;
    textures: Map<Texture, {
        count: number;
        id: TextureID;
        uvTransform: number[];
    }>;
    mipLevels: number;
    constructor(renderer: WebGLRenderer, options?: WebGLAtlasTextureOptions);
    getLayerWithSpace(size: number): number;
    allocLayer(size: number): number;
    nextId(size: number): TextureID | undefined;
    createTextureArray(arrayDepth: number): void;
    generateDebugMips(): void;
    debugDumpMips(layer?: LayerID): void;
    growTextureArray(newDepth: number): void;
    addTexture(texture: Texture, uvTransform: UVTransform): TextureID | undefined;
    addColorRect(size: number, color: number[], uvTransform: UVTransform): TextureID | undefined;
    clearTile(id: TextureID, color: number[]): void;
    uploadImage(layerIdx: LayerID, atlasIdx: TileID, img: UploadableImage): void;
    uploadAndResizeImage(layerIdx: LayerID, atlasIdx: TileID, img: UploadableImage, width: number, height: number): void;
    genMipmaps(layerIdx: LayerID, atlasIdx: TileID): void;
    removeTexture(texture: Texture): void;
}
export {};
