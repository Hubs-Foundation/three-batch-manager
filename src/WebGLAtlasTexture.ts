import { Texture, Math as ThreeMath, WebGLRenderer, CanvasTexture } from "three";

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
  textures: Map<Texture, { count: number; id: TextureID; uvTransform: number[] }>;

  constructor(renderer: WebGLRenderer, textureResolution = 4096, minAtlasSize = 512) {
    super();

    this.renderer = renderer;

    this.canvas = document.createElement("canvas");
    this.canvas.width = this.canvas.height = textureResolution;
    this.canvasCtx = this.canvas.getContext("2d");

    this.textures = new Map();

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
    const gl = this.renderer.context as WebGL2RenderingContext;
    const textureProperties = properties.get(this);

    // console.log("Allocating texture array, depth", arrayDepth);
    this.glTexture = gl.createTexture();
    this.arrayDepth = arrayDepth;
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

    textureProperties.__maxMipLevel = Math.log2(this.textureResolution) + 1;
    gl.texStorage3D(
      gl.TEXTURE_2D_ARRAY,
      textureProperties.__maxMipLevel,
      gl.RGBA8,
      this.textureResolution,
      this.textureResolution,
      arrayDepth
    );

    // this.generateDebugMips();
  }

  generateDebugMips() {
    const gl = this.renderer.context as WebGL2RenderingContext;

    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, fb);

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
      for (let curLevel = 1; curLevel < Math.log2(this.textureResolution) + 1; curLevel++) {
        gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, this.glTexture, curLevel, i);
        const c = mipColors[curLevel];
        gl.clearColor(c[0], c[1], c[2], c[3]);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
    }

    gl.deleteFramebuffer(fb);
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
    debug.style.backgroundImage =
      "linear-gradient(45deg, #808080 25%, transparent 25%), linear-gradient(-45deg, #808080 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #808080 75%), linear-gradient(-45deg, transparent 75%, #808080 75%)";
    debug.style.backgroundSize = "20px 20px";
    debug.style.backgroundPosition = "0 0, 0 10px, 10px -10px, -10px 0px";
    debug.style.backgroundColor = "white";

    for (let mipLevel = 0; mipLevel < Math.log2(this.textureResolution) + 1; mipLevel++) {
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, this.glTexture, mipLevel, layer);

      const c = document.createElement("canvas") as HTMLCanvasElement;
      c.width = c.height = this.textureResolution / Math.pow(2, mipLevel);
      c.style.display = "block";
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
  }

  growTextureArray(newDepth: number) {
    console.log("Growing array", newDepth);
    const gl = this.renderer.context as WebGL2RenderingContext;

    const prevGlTexture = this.glTexture;
    const prevArrayDepth = this.arrayDepth;

    const src = gl.createFramebuffer();
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, src);
    const dest = gl.createFramebuffer();
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, dest);

    this.createTextureArray(newDepth);

    for (let mipLevel = 0; mipLevel < Math.log2(this.textureResolution) + 1; mipLevel++) {
      for (let z = 0; z < prevArrayDepth; z++) {
        const res = this.textureResolution / Math.pow(2, mipLevel);
        gl.framebufferTextureLayer(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, prevGlTexture, mipLevel, z);
        gl.framebufferTextureLayer(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, this.glTexture, mipLevel, z);
        gl.blitFramebuffer(0, 0, res, res, 0, 0, res, res, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      }
    }

    gl.deleteTexture(prevGlTexture);
    gl.deleteFramebuffer(src);
    gl.deleteFramebuffer(dest);
  }

  addTexture(texture: Texture, uvTransform: UVTransform) {
    const textureInfo = this.textures.get(texture);

    if (textureInfo) {
      textureInfo.count++;

      for (let i = 0; i < 4; i++) {
        uvTransform[i] = textureInfo.uvTransform[i];
      }

      return textureInfo.id;
    }

    const img = texture.image;
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

    if (texture.flipY) {
      uvTransform[1] = uvTransform[1] + uvTransform[3];
      uvTransform[3] = -uvTransform[3];
    }

    this.textures.set(texture, {
      id,
      count: 1,
      uvTransform: uvTransform.slice()
    });

    // console.log("layerIdx: ", layerIdx, "atlasIdx: ", atlasIdx, "uvtransform: ", uvTransform, "layer: ", layer);

    return id;
  }

  addColorRect(size: number, color: string, uvTransform: UVTransform) {
    this.canvas.width = size;
    this.canvas.height = size;
    this.canvasCtx.fillStyle = color;
    this.canvasCtx.fillRect(0, 0, size, size);
    return this.addTexture(new CanvasTexture(this.canvas), uvTransform);
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

    // console.log("Uploading image", layerIdx, atlasIdx, img.width, img.height);
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
    // gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
  }

  genMipmaps(layerIdx: LayerID, atlasIdx: TileID) {
    const gl = this.renderer.context as WebGL2RenderingContext;

    const readFrameBuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, readFrameBuffer);

    const writeFrameBuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, writeFrameBuffer);

    const layer = this.layers[layerIdx];

    let mipLevel = 1;
    const size = layer.size;
    let prevSize = size;
    let curSize = size / 2;

    const r = atlasIdx % layer.colls;
    const c = Math.floor(atlasIdx / layer.rows);

    while (curSize >= 1) {
      gl.framebufferTextureLayer(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, this.glTexture, mipLevel - 1, layerIdx);
      gl.framebufferTextureLayer(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, this.glTexture, mipLevel, layerIdx);

      const srcX = r * prevSize;
      const srcY = c * prevSize;
      const srcX2 = srcX + prevSize;
      const srcY2 = srcY + prevSize;

      const destX = r * curSize;
      const destY = c * curSize;
      const destX2 = destX + curSize;
      const destY2 = destY + curSize;

      gl.blitFramebuffer(srcX, srcY, srcX2, srcY2, destX, destY, destX2, destY2, gl.COLOR_BUFFER_BIT, gl.LINEAR);

      prevSize = curSize;
      mipLevel++;
      curSize /= 2;
    }

    gl.deleteFramebuffer(readFrameBuffer);
    gl.deleteFramebuffer(writeFrameBuffer);
  }

  removeTexture(texture: Texture) {
    const textureInfo = this.textures.get(texture);

    textureInfo.count--;

    if (textureInfo.count !== 0) {
      return;
    }

    const [layerIdx, atlasIdx] = textureInfo.id;

    const layer = this.layers[layerIdx];

    this.canvas.width = this.canvas.height = layer.size;
    this.canvasCtx.clearRect(0, 0, layer.size, layer.size);
    this.uploadImage(layerIdx, atlasIdx, this.canvas);

    layer.freeId(atlasIdx);
    if (layer.isEmpty()) {
      // console.log("Freeing layer", layer);
      this.freeLayers.push(layerIdx);
    }

    this.textures.delete(texture);

    // console.log("Remove", layerIdx, atlasIdx, layer, this.freeLayers);
  }
}

Object.defineProperty(WebGLAtlasTexture.prototype, "needsUpdate", {
  set() {
    console.warn("needsUpdate should not be set on a WebGLAtlasTexture, it handles texture uploading internally");
  }
});
