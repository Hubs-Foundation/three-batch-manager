import { Texture, Math as ThreeMath } from "three";

class Layer {
  constructor(size, rows, colls) {
    this.recycle(size, rows, colls);
  }

  recycle(size, rows, colls) {
    this.size = size;
    this.nextIdx = 0;
    this.free = [];
    this.rows = rows;
    this.colls = colls;
    this.maxIdx = rows * colls - 1;
  }

  nextId() {
    return this.free.length ? this.free.pop() : this.nextIdx++;
  }

  freeId(idx) {
    this.free.push(idx);
  }

  isFull() {
    return !this.free.length && this.nextIdx >= this.maxIdx;
  }

  isEmpty() {
    this.nextIdx = 0 || this.free.length === this.maxIdx;
  }
}

export default class WebGLAtlasTexture extends Texture {
  constructor(renderer, textureResolution = 4096, minAtlasSize = 512) {
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

    // TODO this can start small and grow dynamically
    this.createTextureArray(16);
  }

  getLayerWithSpace(size) {
    for (let i = 0; i < this.layers.length; i++) {
      const layer = this.layers[i];
      if (layer.size === size && !layer.isFull()) {
        return i;
      }
    }
    return this.allocLayer(size);
  }

  allocLayer(size) {
    const rows = this.textureResolution / size;
    if (this.freeLayers.length) {
      const layerIdx = this.freeLayers.pop();
      this.layers[layerIdx].recycle(size, rows, rows);
      return layerIdx;
    } else {
      this.layers.push(new Layer(size, rows, rows));
      return this.layers.length - 1;
    }
  }

  nextId(size) {
    const layerIdx = this.getLayerWithSpace(Math.max(size, this.minAtlasSize));
    return [layerIdx, this.layers[layerIdx].nextId()];
  }

  createTextureArray(arrayDepth) {
    const slot = 0;

    const { state, properties } = this.renderer;
    const _gl = this.renderer.context;
    const textureProperties = properties.get(this);

    console.log("Allocating texture array, depth", arrayDepth);
    this.glTexture = _gl.createTexture();
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

  addImage(img, uvTransform) {
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
      console.warn("resizing image from", img.width, img.height, "to", width, height);
      this.canvas.width = width;
      this.canvas.height = height;
      this.canvasCtx.clearRect(0, 0, width, height);
      this.canvasCtx.drawImage(img, 0, 0, width, height);
      imgToUpload = this.canvas;
    }

    const [layerIdx, atlasIdx] = this.nextId(size);

    this.uploadImage(layerIdx, atlasIdx, imgToUpload);

    const layer = this.layers[layerIdx];

    uvTransform[0] = (atlasIdx % layer.colls) / layer.colls;
    uvTransform[1] = Math.floor(atlasIdx / layer.rows) / layer.rows;
    uvTransform[2] = (1 / layer.colls) * (width / layer.size);
    uvTransform[3] = (1 / layer.rows) * (height / layer.size);

    console.log("layerIdx: ", layerIdx, "atlasIdx: ", atlasIdx, "uvtransform: ", uvTransform, "layer: ", layer);

    return layerIdx;
  }

  uploadImage(layerIdx, atlasIdx, img) {
    const state = this.renderer.state;
    const _gl = this.renderer.context;
    const slot = 0;

    state.activeTexture(_gl.TEXTURE0 + slot);
    state.bindTexture(_gl.TEXTURE_2D_ARRAY, this.glTexture);

    _gl.pixelStorei(_gl.UNPACK_FLIP_Y_WEBGL, this.flipY);
    _gl.pixelStorei(_gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, this.premultiplyAlpha);
    _gl.pixelStorei(_gl.UNPACK_ALIGNMENT, this.unpackAlignment);

    const layer = this.layers[layerIdx];
    console.log("Uploading image", layerIdx, atlasIdx, img.width, img.height);
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

  removeImage(layerIdx, atlasIdx) {
    const layer = this.layers[layerIdx];

    this.canvas.width = this.canvas.height = layer.size;
    this.canvasCtx.clearRect(0, 0, layer.size, layer.size);
    this.uploadImage(layerIdx, atlasIdx, this.canvas);

    layer.freeId(atlasIdx);
    if (layer.isEmpty()) {
      this.freeLayers.push(layerIdx);
    }

    console.log("Remove", layerIdx, atlasIdx, this.freeLayers);
  }
}

Object.defineProperty(WebGLAtlasTexture.prototype, "needsUpdate", {
  set: function() {
    console.warn("needsUpdate should not be set on a WebGLAtlasTexture, it handles texture uploading internally");
  }
});
