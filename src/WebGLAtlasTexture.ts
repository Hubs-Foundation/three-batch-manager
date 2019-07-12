import { Texture, Math as ThreeMath, WebGLRenderer } from "three";

export type TileID = number;
export type LayerID = number;

export interface TextureID extends Array<number> {
  0: LayerID;
  1: TileID;
}
export type UVTransform = [number, number, number, number];

type UploadableImage = ImageBitmap | HTMLImageElement | HTMLCanvasElement;

const REMOVE_CLEAR_COLOR = [0, 0, 0, 0];

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
  textures: Map<Texture, { count: number; id: TextureID; uvTransform: number[] }>;

  constructor(renderer: WebGLRenderer, options: WebGLAtlasTextureOptions = {}) {
    super();

    this.renderer = renderer;

    this.layerResolution = options.layerResolution || 4096;
    this.minTileSize = options.minTileSize || 512;

    this.textures = new Map();

    this.freeLayers = [];
    this.layers = [];
    this.maxLayers = options.maxLayers || 8;

    this.flipY = false;

    this.createTextureArray(3);

    this.nullTextureTransform = [0, 0, 0, 0];
    this.nullTextureIndex = this.addColorRect(this.minTileSize, [1, 1, 1, 1], this.nullTextureTransform);
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
    const rows = this.layerResolution / size;
    if (this.freeLayers.length) {
      const layerIdx = this.freeLayers.pop();
      this.layers[layerIdx].recycle(size, rows, rows);
      return layerIdx;
    } else {
      if (this.layers.length === this.maxLayers) {
        return -1;
      }

      if (this.layers.length === this.arrayDepth) {
        this.growTextureArray(Math.min(Math.ceil(this.arrayDepth * 1.5), this.maxLayers));
      }
      this.layers.push(new Layer(size, rows, rows));
      return this.layers.length - 1;
    }
  }

  nextId(size: number): TextureID | undefined {
    const layerIdx = this.getLayerWithSpace(Math.max(size, this.minTileSize));

    if (layerIdx === -1) {
      return undefined;
    }

    return [layerIdx, this.layers[layerIdx].nextId()];
  }

  createTextureArray(arrayDepth: number) {
    const slot = 0;

    const { state, properties } = this.renderer;
    const gl = this.renderer.context as WebGL2RenderingContext;
    const textureProperties = properties.get(this);

    this.glTexture = gl.createTexture();
    this.arrayDepth = arrayDepth;
    this.mipFramebuffers = [];

    textureProperties.__webglTexture = this.glTexture;
    textureProperties.__webglInit = true;

    state.activeTexture(gl.TEXTURE0 + slot);
    state.bindTexture(gl.TEXTURE_2D_ARRAY, this.glTexture);

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, this.flipY);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, this.premultiplyAlpha);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, this.unpackAlignment);

    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);

    textureProperties.__maxMipLevel = Math.log2(this.layerResolution) + 1;
    gl.texStorage3D(
      gl.TEXTURE_2D_ARRAY,
      textureProperties.__maxMipLevel,
      gl.RGBA8,
      this.layerResolution,
      this.layerResolution,
      arrayDepth
    );

    for (let z = 0; z < arrayDepth; z++) {
      const mips = [];
      for (let mipLevel = 0; mipLevel < textureProperties.__maxMipLevel; mipLevel++) {
        const fb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, this.glTexture, mipLevel, z);
        mips.push(fb);
      }
      this.mipFramebuffers.push(mips);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  generateDebugMips() {
    const gl = this.renderer.context as WebGL2RenderingContext;

    const mipColors = [
      null,
      [1, 0, 0, 1],
      [1, 0, 0, 1],
      [1, 0, 0, 1],

      [0, 1, 0, 1],
      [0, 1, 0, 1],
      [0, 1, 0, 1],

      [0, 0, 1, 1],
      [0, 0, 1, 1],
      [0, 0, 1, 1],

      [1, 0, 1, 1],
      [1, 0, 1, 1],
      [1, 0, 1, 1]
    ];

    for (let i = 0; i < this.arrayDepth; i++) {
      const mips = this.mipFramebuffers[i];
      for (let curLevel = 1; curLevel < Math.log2(this.layerResolution) + 1; curLevel++) {
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, mips[curLevel]);
        const c = mipColors[curLevel];
        gl.clearColor(c[0], c[1], c[2], c[3]);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
    }
  }

  debugDumpMips(layer: LayerID = 0) {
    const gl = this.renderer.context as WebGL2RenderingContext;

    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);

    const debug = document.createElement("div");
    debug.style.zIndex = "10000";
    debug.style.position = "absolute";
    debug.style.top = debug.style.bottom = debug.style.left = debug.style.right = "0";
    debug.style.overflow = "scroll";
    debug.style.background = "black";

    const mips = this.mipFramebuffers[layer];
    for (let mipLevel = 0; mipLevel < Math.log2(this.layerResolution) + 1; mipLevel++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, mips[mipLevel]);

      const c = document.createElement("canvas") as HTMLCanvasElement;
      c.width = c.height = this.layerResolution / Math.pow(2, mipLevel);
      c.style.display = "block";
      c.style.backgroundImage =
        "linear-gradient(45deg, #808080 25%, transparent 25%), linear-gradient(-45deg, #808080 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #808080 75%), linear-gradient(-45deg, transparent 75%, #808080 75%)";
      c.style.backgroundSize = "20px 20px";
      c.style.backgroundPosition = "0 0, 0 10px, 10px -10px, -10px 0px";
      c.style.backgroundColor = "white";

      const ctx = c.getContext("2d");
      const imgData = ctx.createImageData(c.width, c.height);

      const pixels = new Uint8Array(c.width * c.height * 4);
      gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      imgData.data.set(pixels);

      ctx.putImageData(imgData, 0, 0);

      debug.appendChild(c);
    }
    document.body.appendChild(debug);

    gl.deleteFramebuffer(fb);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  growTextureArray(newDepth: number) {
    const { state, properties } = this.renderer;
    const gl = this.renderer.context as WebGL2RenderingContext;

    const prevGlTexture = this.glTexture;
    const prevArrayDepth = this.arrayDepth;
    const prevMipFramebuffers = this.mipFramebuffers;

    this.createTextureArray(newDepth);
    console.log("Growing array to", newDepth);

    // Blitting to a non 0 layer is broken on mobile, workaround by blitting then copying
    // see https://jsfiddle.net/nu1xdgs3/13a
    const blitCopyHackTexture = gl.createTexture();
    const blitCopyHackFB = gl.createFramebuffer();
    state.activeTexture(gl.TEXTURE0);
    state.bindTexture(gl.TEXTURE_2D, blitCopyHackTexture);
    gl.bindFramebuffer(gl.FRAMEBUFFER, blitCopyHackFB);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, blitCopyHackTexture, 0);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, this.layerResolution, this.layerResolution);

    state.bindTexture(gl.TEXTURE_2D_ARRAY, this.glTexture);
    const maxMipLevels = Math.log2(this.layerResolution) + 1;
    for (let z = 0; z < prevArrayDepth; z++) {
      for (let mipLevel = 0; mipLevel < maxMipLevels; mipLevel++) {
        const res = this.layerResolution / Math.pow(2, mipLevel);

        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, prevMipFramebuffers[z][mipLevel]);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, blitCopyHackFB);
        gl.blitFramebuffer(0, 0, res, res, 0, 0, res, res, gl.COLOR_BUFFER_BIT, gl.NEAREST);

        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, blitCopyHackFB);
        gl.copyTexSubImage3D(gl.TEXTURE_2D_ARRAY, mipLevel, 0, 0, z, 0, 0, res, res);
      }
    }

    gl.deleteTexture(blitCopyHackTexture);
    gl.deleteFramebuffer(blitCopyHackFB);

    for (let z = 0; z < prevMipFramebuffers.length; z++) {
      const mips = prevMipFramebuffers[z];
      for (let mipLevel = 0; mipLevel < mips.length; mipLevel++) {
        gl.deleteFramebuffer(mips[mipLevel]);
      }
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteTexture(prevGlTexture);
  }

  addTexture(texture: Texture, uvTransform: UVTransform): TextureID | undefined {
    const textureInfo = this.textures.get(texture);

    if (textureInfo) {
      textureInfo.count++;

      for (let i = 0; i < 4; i++) {
        uvTransform[i] = textureInfo.uvTransform[i];
      }

      return textureInfo.id;
    }

    const img = texture.image;

    // TODO We should also check for a GL texture existing before giving up
    if (!img) {
      console.warn("Attempted to add a texture with no image to the atlas");
      return;
    }

    let width = img.width;
    let height = img.height;
    let size;

    if (width > height) {
      const ratio = height / width;
      width = Math.min(ThreeMath.floorPowerOfTwo(width), this.layerResolution);
      height = Math.round(width * ratio);
      size = width;
    } else {
      const ratio = width / height;
      height = Math.min(ThreeMath.floorPowerOfTwo(height), this.layerResolution);
      width = Math.round(height * ratio);
      size = height;
    }

    const id = this.nextId(size);

    if (id === undefined) {
      return undefined;
    }

    const [layerIdx, atlasIdx] = id;

    if (width !== img.width || height !== img.height) {
      this.uploadAndResizeImage(layerIdx, atlasIdx, img, width, height);
    } else {
      this.uploadImage(layerIdx, atlasIdx, img);
    }

    const layer = this.layers[layerIdx];

    uvTransform[0] = (atlasIdx % layer.colls) / layer.colls;
    uvTransform[1] = Math.floor(atlasIdx / layer.rows) / layer.rows;
    uvTransform[2] = (1 / layer.colls) * (width / layer.size);
    uvTransform[3] = (1 / layer.rows) * (height / layer.size);

    if (texture.flipY) {
      uvTransform[1] = uvTransform[1] + uvTransform[3];
      uvTransform[3] = -uvTransform[3];
    }

    this.textures.set(texture, {
      id,
      count: 1,
      uvTransform: uvTransform.slice()
    });

    if (texture.onUpdate) {
      texture.onUpdate();
    }

    return id;
  }

  addColorRect(size: number, color: number[], uvTransform: UVTransform): TextureID | undefined {
    const id = this.nextId(size);
    const [layerIdx, atlasIdx] = id;
    const layer = this.layers[layerIdx];

    this.clearTile(id, color);

    uvTransform[0] = (atlasIdx % layer.colls) / layer.colls;
    uvTransform[1] = Math.floor(atlasIdx / layer.rows) / layer.rows;
    uvTransform[2] = (1 / layer.colls) * (size / layer.size);
    uvTransform[3] = (1 / layer.rows) * (size / layer.size);

    return id;
  }

  clearTile(id: TextureID, color: number[]) {
    const gl = this.renderer.context as WebGL2RenderingContext;

    const [layerIdx, atlasIdx] = id;
    const layer = this.layers[layerIdx];

    const mips = this.mipFramebuffers[layerIdx];
    gl.bindFramebuffer(gl.FRAMEBUFFER, mips[0]);

    const xOffset = (atlasIdx % layer.colls) * layer.size;
    const yOffset = Math.floor(atlasIdx / layer.rows) * layer.size;

    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(xOffset, yOffset, layer.size, layer.size);
    gl.clearColor(color[0], color[1], color[2], color[3]);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.SCISSOR_TEST);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this.genMipmaps(layerIdx, atlasIdx);
  }

  uploadImage(layerIdx: LayerID, atlasIdx: TileID, img: UploadableImage) {
    const state = this.renderer.state;
    const gl = this.renderer.context as WebGL2RenderingContext;
    const slot = 0;

    state.activeTexture(gl.TEXTURE0 + slot);
    state.bindTexture(gl.TEXTURE_2D_ARRAY, this.glTexture);

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, this.flipY);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, this.premultiplyAlpha);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, this.unpackAlignment);

    const layer = this.layers[layerIdx];
    const xOffset = (atlasIdx % layer.colls) * layer.size;
    const yOffset = Math.floor(atlasIdx / layer.rows) * layer.size;

    gl.texSubImage3D(
      gl.TEXTURE_2D_ARRAY, // target
      0, // level
      xOffset, // xoffset
      yOffset, // yoffset
      layerIdx, // zoffset
      img.width, // width
      img.height, // height
      1, // depth
      gl.RGBA, // format
      gl.UNSIGNED_BYTE, // type
      img // pixels
    );

    this.genMipmaps(layerIdx, atlasIdx);
  }

  uploadAndResizeImage(layerIdx: LayerID, atlasIdx: TileID, img: UploadableImage, width: number, height: number) {
    const state = this.renderer.state;
    const gl = this.renderer.context as WebGL2RenderingContext;

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, this.flipY);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, this.premultiplyAlpha);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, this.unpackAlignment);

    const resizeTexture = gl.createTexture();
    state.activeTexture(gl.TEXTURE0);
    state.bindTexture(gl.TEXTURE_2D, resizeTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);

    // TODO: Figure out if we can reuse this framebuffer to avoid validation costs. Probably requires reusing the resizeTexture.
    const resizeFramebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, resizeFramebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, resizeTexture, 0);

    console.log("Uploading image with resize", width, height, img);
    // Blitting to a non 0 layer is broken on mobile, workaround by blitting then copying
    // see https://jsfiddle.net/nu1xdgs3/13a
    const blitCopyHackTexture = gl.createTexture();
    const blitCopyHackFB = gl.createFramebuffer();
    state.bindTexture(gl.TEXTURE_2D, blitCopyHackTexture);
    gl.bindFramebuffer(gl.FRAMEBUFFER, blitCopyHackFB);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, blitCopyHackTexture, 0);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, width, height);

    const layer = this.layers[layerIdx];
    const xOffset = (atlasIdx % layer.colls) * layer.size;
    const yOffset = Math.floor(atlasIdx / layer.rows) * layer.size;

    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, resizeFramebuffer);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, blitCopyHackFB);
    gl.blitFramebuffer(0, 0, img.width, img.height, 0, 0, width, height, gl.COLOR_BUFFER_BIT, gl.LINEAR);

    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, blitCopyHackFB);
    state.bindTexture(gl.TEXTURE_2D_ARRAY, this.glTexture);
    gl.copyTexSubImage3D(gl.TEXTURE_2D_ARRAY, 0, xOffset, yOffset, layerIdx, 0, 0, width, height);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    gl.deleteTexture(resizeTexture);
    gl.deleteTexture(blitCopyHackTexture);
    gl.deleteFramebuffer(blitCopyHackFB);

    this.genMipmaps(layerIdx, atlasIdx);
  }

  genMipmaps(layerIdx: LayerID, atlasIdx: TileID) {
    const state = this.renderer.state;
    const gl = this.renderer.context as WebGL2RenderingContext;

    const layer = this.layers[layerIdx];

    let mipLevel = 1;
    const size = layer.size;
    let prevSize = size;
    let curSize = size / 2;

    const r = atlasIdx % layer.colls;
    const c = Math.floor(atlasIdx / layer.rows);

    // Blitting to a non 0 layer is broken on mobile, workaround by blitting then copying
    // see https://jsfiddle.net/nu1xdgs3/13a
    const blitCopyHackTexture = gl.createTexture();
    const blitCopyHackFB = gl.createFramebuffer();
    state.activeTexture(gl.TEXTURE0);
    state.bindTexture(gl.TEXTURE_2D, blitCopyHackTexture);
    gl.bindFramebuffer(gl.FRAMEBUFFER, blitCopyHackFB);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, blitCopyHackTexture, 0);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, size, size);

    state.bindTexture(gl.TEXTURE_2D_ARRAY, this.glTexture);
    const mips = this.mipFramebuffers[layerIdx];
    while (curSize >= 1) {
      // gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, mips[mipLevel]);

      const srcX = r * prevSize;
      const srcY = c * prevSize;
      const srcX2 = srcX + prevSize;
      const srcY2 = srcY + prevSize;

      const destX = r * curSize;
      const destY = c * curSize;
      const destX2 = destX + curSize;
      const destY2 = destY + curSize;

      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, mips[mipLevel - 1]);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, blitCopyHackFB);
      gl.blitFramebuffer(srcX, srcY, srcX2, srcY2, 0, 0, curSize, curSize, gl.COLOR_BUFFER_BIT, gl.LINEAR);

      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, blitCopyHackFB);
      gl.copyTexSubImage3D(gl.TEXTURE_2D_ARRAY, mipLevel, destX, destY, layerIdx, 0, 0, curSize, curSize);

      prevSize = curSize;
      mipLevel++;
      curSize /= 2;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  removeTexture(texture: Texture) {
    const textureInfo = this.textures.get(texture);

    textureInfo.count--;

    if (textureInfo.count !== 0) {
      return;
    }

    const [layerIdx, atlasIdx] = textureInfo.id;
    const layer = this.layers[layerIdx];

    this.clearTile(textureInfo.id, REMOVE_CLEAR_COLOR);

    layer.freeId(atlasIdx);
    if (layer.isEmpty()) {
      this.freeLayers.push(layerIdx);
    }

    this.textures.delete(texture);
  }
}

Object.defineProperty(WebGLAtlasTexture.prototype, "needsUpdate", {
  set() {
    console.warn("needsUpdate should not be set on a WebGLAtlasTexture, it handles texture uploading internally");
  }
});
