import { NearestFilter, Texture } from "three";

export default class WebGLAtlasTexture extends Texture {
  constructor(renderer, atlasResolution = 4096, textureResolution = 1024) {
    super();

    this.ninFilter = NearestFilter;
    this.magFilter = NearestFilter;
    this.renderer = renderer;
    this.mipmaps = [];
    this.generateMipmaps = false;

    this.canvas = document.createElement("canvas");
    this.canvas.width = this.canvas.height = textureResolution;
    this.canvasCtx = this.canvas.getContext("2d");

    this.atlasResolution = atlasResolution;
    this.textureResolution = textureResolution;
    this.rows = this.atlasResolution / this.textureResolution;
    this.colls = this.rows;

    this.lastIdx = 0;
    this.freedIndicies = [];

    this.flipY = false;

    console.log("atlas", this);

    this.alloc();
  }

  nextId() {
    return this.freedIndicies.length ? this.freedIndicies.pop() : this.lastIdx++;
  }

  alloc() {
    const slot = 0;

    const { state, properties } = this.renderer;
    console.log(properties);
    const _gl = this.renderer.context;
    const textureProperties = properties.get(this);
    console.log(textureProperties);

    if (!textureProperties.__webglInit) {
      console.log("allocating");
      this.glTexture = _gl.createTexture();
      textureProperties.__webglTexture = this.glTexture;
      textureProperties.__webglInit = true;

      state.activeTexture(_gl.TEXTURE0 + slot);
      state.bindTexture(_gl.TEXTURE_2D, this.glTexture);

      _gl.pixelStorei(_gl.UNPACK_FLIP_Y_WEBGL, this.flipY);
      _gl.pixelStorei(_gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, this.premultiplyAlpha);
      _gl.pixelStorei(_gl.UNPACK_ALIGNMENT, this.unpackAlignment);

      _gl.texParameteri(_gl.TEXTURE_2D, _gl.TEXTURE_WRAP_S, _gl.CLAMP_TO_EDGE);
      _gl.texParameteri(_gl.TEXTURE_2D, _gl.TEXTURE_WRAP_T, _gl.CLAMP_TO_EDGE);
      _gl.texParameteri(_gl.TEXTURE_2D, _gl.TEXTURE_MAG_FILTER, _gl.LINEAR);
      _gl.texParameteri(_gl.TEXTURE_2D, _gl.TEXTURE_MIN_FILTER, _gl.LINEAR);

      state.texImage2D(
        _gl.TEXTURE_2D,
        0,
        _gl.RGBA,
        this.atlasResolution,
        this.atlasResolution,
        0,
        _gl.RGBA,
        _gl.UNSIGNED_BYTE,
        null
      );

      textureProperties.__maxMipLevel = 0;

      // this.canvasCtx.fillStyle = "blue";
      // this.canvasCtx.fillRect(0, 0, 1024, 1024);
      // for (let i = 0; i < 16; i++) {
      //   this.addImage();
      // }
      // this.index = 0;
    }
  }

  addImage(img, uvTransform) {
    let width = img.width;
    let height = img.height;

    if (width > height) {
      const ratio = height / width;
      width = Math.min(width, this.textureResolution);
      height = Math.round(width * ratio);
    } else {
      const ratio = width / height;
      height = Math.min(height, this.textureResolution);
      width = Math.round(height * ratio);
    }

    let imgToUpload = img;

    if (img.width > this.textureResolution || img.height > this.textResolution) {
      this.canvasCtx.clearRect(0, 0, this.textureResolution, this.textureResolution);
      this.canvasCtx.drawImage(img, 0, 0, width, height);
      imgToUpload = this.canvas;
    } else {
      console.log("skipping canvas");
    }

    const textureIdx = this.nextId();

    const texIdxX = textureIdx % this.rows;
    const texIdxY = Math.floor(textureIdx / this.colls);

    this.uploadImage(texIdxX, texIdxY, imgToUpload);

    uvTransform.setUvTransform(
      texIdxX / this.rows,
      texIdxY / this.colls,
      (1 / this.rows) * (width / this.textureResolution),
      (1 / this.colls) * (height / this.textureResolution),
      0,
      0,
      0
    );

    return textureIdx;
  }

  uploadImage(x, y, img) {
    const state = this.renderer.state;
    const _gl = this.renderer.context;
    const slot = 0;

    state.activeTexture(_gl.TEXTURE0 + slot);
    state.bindTexture(_gl.TEXTURE_2D, this.glTexture);

    _gl.pixelStorei(_gl.UNPACK_FLIP_Y_WEBGL, this.flipY);
    _gl.pixelStorei(_gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, this.premultiplyAlpha);
    _gl.pixelStorei(_gl.UNPACK_ALIGNMENT, this.unpackAlignment);
    _gl.texSubImage2D(
      _gl.TEXTURE_2D,
      0,
      x * this.textureResolution,
      y * this.textureResolution,
      _gl.RGBA,
      _gl.UNSIGNED_BYTE,
      img
    );
  }

  removeImage(textureIdx) {
    this.freedIndicies.push(textureIdx);
    this.canvasCtx.clearRect(0, 0, this.textureResolution, this.textureResolution);
    const texIdxX = textureIdx % this.rows;
    const texIdxY = Math.floor(textureIdx / this.colls);
    this.uploadImage(texIdxX, texIdxY, this.canvas);
    console.log("Remove", textureIdx, this.freedIndicies);
  }
}

Object.defineProperty(WebGLAtlasTexture.prototype, "needsUpdate", {
  set: function() {
    console.warn("needsUpdate should not be set on a WebGLAtlasTexture, it handles texture uploading internally");
  }
});
