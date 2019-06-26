import { Texture, Math as ThreeMath, WebGLRenderer } from "three";

export type TileID = number;
export type LayerID = number;
// export type TextureID = [LayerID, TileID];
export interface TextureID extends Array<number> {
  0: LayerID;
  1: TileID;
}
export type UVTransform = [number, number, number, number];

type UploadableImage = ImageBitmap | HTMLImageElement | HTMLCanvasElement;

class Layer {
  freed: TileID[];
  size: number;
  nextIdx: TileID;
  rows: number;
  colls: number;
  maxIdx: TileID;

  constructor(size: number, rows: number, colls: number) {
    this.freed = [];
    this.recycle(size, rows, colls);
  }

  recycle(size: number, rows: number, colls: number) {
    this.size = size;
    this.nextIdx = 0;
    this.freed.length = 0;
    this.rows = rows;
    this.colls = colls;
    this.maxIdx = rows * colls - 1;
  }

  nextId() {
    return this.freed.length ? this.freed.pop() : this.nextIdx++;
  }

  freeId(idx: TileID) {
    this.freed.push(idx);
  }

  isFull() {
    return !this.freed.length && this.nextIdx >= this.maxIdx;
  }

  isEmpty() {
    return this.nextIdx === this.freed.length;
  }
}

export default class WebGLAtlasTexture extends Texture {
  renderer: WebGLRenderer;
  canvas: HTMLCanvasElement;
  canvasCtx: CanvasRenderingContext2D;
  textureResolution: number;
  minAtlasSize: number;
  freeLayers: LayerID[];
  layers: Layer[];
  nullTextureIndex: TextureID;
  glTexture: WebGLTexture;
  arrayDepth: number;
  nullTextureTransform: UVTransform;

  constructor(renderer: WebGLRenderer, textureResolution = 4096, minAtlasSize = 512) {
    super();

    this.renderer = renderer;

    this.canvas = document.createElement("canvas");
    this.canvas.width = this.canvas.height = textureResolution;
    this.canvasCtx = this.canvas.getContext("2d");

    this.textureResolution = textureResolution;
    this.minAtlasSize = minAtlasSize;

    this.freeLayers = [];
    this.layers = [];

    this.flipY = false;

    this.createTextureArray(3);

    this.nullTextureTransform = [0, 0, 0, 0];
    this.nullTextureIndex = this.addColorRect(this.minAtlasSize, "white", this.nullTextureTransform);
  }

  getLayerWithSpace(size: number) {
    for (let i = 0; i < this.layers.length; i++) {
      const layer = this.layers[i];
      if (layer.size === size && !layer.isFull()) {
        return i;
      }
    }
    return this.allocLayer(size);
  }

  allocLayer(size: number) {
    const rows = this.textureResolution / size;
    if (this.freeLayers.length) {
      const layerIdx = this.freeLayers.pop();
      this.layers[layerIdx].recycle(size, rows, rows);
      return layerIdx;
    } else {
      if (this.layers.length === this.arrayDepth) {
        this.growTextureArray(Math.ceil(this.arrayDepth * 1.5));
      }
      this.layers.push(new Layer(size, rows, rows));
      return this.layers.length - 1;
    }
  }

  nextId(size: number): TextureID {
    const layerIdx = this.getLayerWithSpace(Math.max(size, this.minAtlasSize));
    return [layerIdx, this.layers[layerIdx].nextId()];
  }

  createTextureArray(arrayDepth: number) {
    const slot = 0;

    const { state, properties } = this.renderer;
    const _gl = this.renderer.context as WebGL2RenderingContext;
    const textureProperties = properties.get(this);

    // console.log("Allocating texture array, depth", arrayDepth);
    this.glTexture = _gl.createTexture();
    this.arrayDepth = arrayDepth;
    textureProperties.__webglTexture = this.glTexture;
    textureProperties.__webglInit = true;

    state.activeTexture(_gl.TEXTURE0 + slot);
    state.bindTexture(_gl.TEXTURE_2D_ARRAY, this.glTexture);

    _gl.pixelStorei(_gl.UNPACK_FLIP_Y_WEBGL, this.flipY);
    _gl.pixelStorei(_gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, this.premultiplyAlpha);
    _gl.pixelStorei(_gl.UNPACK_ALIGNMENT, this.unpackAlignment);

    _gl.texParameteri(_gl.TEXTURE_2D_ARRAY, _gl.TEXTURE_WRAP_S, _gl.CLAMP_TO_EDGE);
    _gl.texParameteri(_gl.TEXTURE_2D_ARRAY, _gl.TEXTURE_WRAP_T, _gl.CLAMP_TO_EDGE);
    _gl.texParameteri(_gl.TEXTURE_2D_ARRAY, _gl.TEXTURE_MAG_FILTER, _gl.LINEAR);
    _gl.texParameteri(_gl.TEXTURE_2D_ARRAY, _gl.TEXTURE_MIN_FILTER, _gl.LINEAR);

    // _gl.texStorage3D(_gl.TEXTURE_2D_ARRAY, 1, _gl.RGBA8, this.textureResolution, this.textureResolution, arrayDepth);

    state.texImage3D(
      _gl.TEXTURE_2D_ARRAY,
      0,
      _gl.RGBA,
      this.textureResolution,
      this.textureResolution,
      arrayDepth,
      0,
      _gl.RGBA,
      _gl.UNSIGNED_BYTE,
      null
    );

    textureProperties.__maxMipLevel = 0;
  }

  growTextureArray(newDepth: number) {
    console.log("Growing array", newDepth);
    const gl = this.renderer.context as WebGL2RenderingContext;

    const prevGlTexture = this.glTexture;
    const prevArrayDepth = this.arrayDepth;

    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

    this.createTextureArray(newDepth);

    for (let i = 0; i < prevArrayDepth; i++) {
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, prevGlTexture, 0, i);
      gl.copyTexSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, 0, 0, this.textureResolution, this.textureResolution);
    }

    gl.deleteTexture(prevGlTexture);
    gl.deleteFramebuffer(framebuffer);
  }

  addImage(img: UploadableImage, flipY: boolean, uvTransform: UVTransform) {
    let width = img.width;
    let height = img.height;
    let size;

    if (width > height) {
      const ratio = height / width;
      width = Math.min(ThreeMath.floorPowerOfTwo(width), this.textureResolution);
      height = Math.round(width * ratio);
      size = width;
    } else {
      const ratio = width / height;
      height = Math.min(ThreeMath.floorPowerOfTwo(height), this.textureResolution);
      width = Math.round(height * ratio);
      size = height;
    }

    let imgToUpload = img;

    if (width !== img.width || height !== img.height) {
      // console.warn("resizing image from", img.width, img.height, "to", width, height);
      this.canvas.width = width;
      this.canvas.height = height;
      this.canvasCtx.clearRect(0, 0, width, height);
      this.canvasCtx.drawImage(img, 0, 0, width, height);
      imgToUpload = this.canvas;
    }

    const id = this.nextId(size);
    const [layerIdx, atlasIdx] = id;

    this.uploadImage(layerIdx, atlasIdx, imgToUpload);

    const layer = this.layers[layerIdx];

    uvTransform[0] = (atlasIdx % layer.colls) / layer.colls;
    uvTransform[1] = Math.floor(atlasIdx / layer.rows) / layer.rows;
    uvTransform[2] = (1 / layer.colls) * (width / layer.size);
    uvTransform[3] = (1 / layer.rows) * (height / layer.size);

    if (flipY) {
      uvTransform[1] = uvTransform[1] + uvTransform[3];
      uvTransform[3] = -uvTransform[3];
    }

    // console.log("layerIdx: ", layerIdx, "atlasIdx: ", atlasIdx, "uvtransform: ", uvTransform, "layer: ", layer);

    return id;
  }

  addColorRect(size: number, color: string, uvTransform: UVTransform) {
    this.canvas.width = size;
    this.canvas.height = size;
    this.canvasCtx.fillStyle = color;
    this.canvasCtx.fillRect(0, 0, size, size);
    return this.addImage(this.canvas, false, uvTransform);
  }

  uploadImage(layerIdx: LayerID, atlasIdx: TileID, img: UploadableImage) {
    const state = this.renderer.state;
    const _gl = this.renderer.context as WebGL2RenderingContext;
    const slot = 0;

    state.activeTexture(_gl.TEXTURE0 + slot);
    state.bindTexture(_gl.TEXTURE_2D_ARRAY, this.glTexture);

    _gl.pixelStorei(_gl.UNPACK_FLIP_Y_WEBGL, this.flipY);
    _gl.pixelStorei(_gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, this.premultiplyAlpha);
    _gl.pixelStorei(_gl.UNPACK_ALIGNMENT, this.unpackAlignment);

    const layer = this.layers[layerIdx];
    // console.log("Uploading image", layerIdx, atlasIdx, img.width, img.height);
    _gl.texSubImage3D(
      _gl.TEXTURE_2D_ARRAY, // target
      0, // level
      (atlasIdx % layer.colls) * layer.size, // xoffset
      Math.floor(atlasIdx / layer.rows) * layer.size, // yoffset
      layerIdx, // zoffset
      img.width, // width
      img.height, // height
      1, // depth
      _gl.RGBA, // format
      _gl.UNSIGNED_BYTE, // type
      img // pixels
    );
  }

  removeImage([layerIdx, atlasIdx]: TextureID) {
    const layer = this.layers[layerIdx];

    this.canvas.width = this.canvas.height = layer.size;
    this.canvasCtx.clearRect(0, 0, layer.size, layer.size);
    this.uploadImage(layerIdx, atlasIdx, this.canvas);

    layer.freeId(atlasIdx);
    if (layer.isEmpty()) {
      // console.log("Freeing layer", layer);
      this.freeLayers.push(layerIdx);
    }

    // console.log("Remove", layerIdx, atlasIdx, layer, this.freeLayers);
  }
}

Object.defineProperty(WebGLAtlasTexture.prototype, "needsUpdate", {
  set: function() {
    console.warn("needsUpdate should not be set on a WebGLAtlasTexture, it handles texture uploading internally");
  }
});
