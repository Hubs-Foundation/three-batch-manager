"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const three_1 = require("three");
const REMOVE_CLEAR_COLOR = [0, 0, 0, 0];
class Layer {
    constructor(size, rows, colls) {
        this.freed = [];
        this.recycle(size, rows, colls);
    }
    recycle(size, rows, colls) {
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
    freeId(idx) {
        this.freed.push(idx);
    }
    isFull() {
        return !this.freed.length && this.nextIdx >= this.maxIdx;
    }
    isEmpty() {
        return this.nextIdx === this.freed.length;
    }
}
// Blitting to a non 0 layer is broken on mobile, workaround by blitting then copying
// see https://jsfiddle.net/nu1xdgs3/13a
// This hack breaks mip map generation on some Mac OS computers, so we only want to enable it on Android devices.
const useBlitHack = /android/i.test(navigator.userAgent);
function createBlitCopyFramebuffer(gl, state, width, height, target) {
    if (!useBlitHack) {
        return [null, null];
    }
    const blitCopyHackTexture = gl.createTexture();
    const blitCopyHackFB = gl.createFramebuffer();
    state.activeTexture(gl.TEXTURE0);
    state.bindTexture(gl.TEXTURE_2D, blitCopyHackTexture);
    gl.bindFramebuffer(gl.FRAMEBUFFER, blitCopyHackFB);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, blitCopyHackTexture, 0);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, width, height);
    state.bindTexture(gl.TEXTURE_2D_ARRAY, target);
    return [blitCopyHackTexture, blitCopyHackFB];
}
class WebGLAtlasTexture extends three_1.Texture {
    constructor(renderer, options = {}) {
        super();
        this.renderer = renderer;
        this.layerResolution = options.layerResolution || 4096;
        this.minTileSize = options.minTileSize || 512;
        this.mipLevels = Math.log2(this.minTileSize) + 1;
        this.textures = new Map();
        this.freeLayers = [];
        this.layers = [];
        this.maxLayers = options.maxLayers || 8;
        this.flipY = false;
        this.createTextureArray(3);
        this.nullTextureTransform = [0, 0, 0, 0];
        this.nullTextureIndex = this.addColorRect(this.minTileSize, [1, 1, 1, 1], this.nullTextureTransform);
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
        const rows = this.layerResolution / size;
        if (this.freeLayers.length) {
            const layerIdx = this.freeLayers.pop();
            this.layers[layerIdx].recycle(size, rows, rows);
            return layerIdx;
        }
        else {
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
    nextId(size) {
        const layerIdx = this.getLayerWithSpace(Math.max(size, this.minTileSize));
        if (layerIdx === -1) {
            return undefined;
        }
        return [layerIdx, this.layers[layerIdx].nextId()];
    }
    createTextureArray(arrayDepth) {
        const slot = 0;
        const { state, properties } = this.renderer;
        const gl = this.renderer.getContext();
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
        textureProperties.__maxMipLevel = this.mipLevels;
        gl.texStorage3D(gl.TEXTURE_2D_ARRAY, this.mipLevels, gl.RGBA8, this.layerResolution, this.layerResolution, arrayDepth);
        for (let z = 0; z < arrayDepth; z++) {
            const mips = [];
            for (let mipLevel = 0; mipLevel < this.mipLevels; mipLevel++) {
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
        const gl = this.renderer.getContext();
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
            for (let curLevel = 1; curLevel < this.mipLevels; curLevel++) {
                gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, mips[curLevel]);
                const c = mipColors[curLevel];
                gl.clearColor(c[0], c[1], c[2], c[3]);
                gl.clear(gl.COLOR_BUFFER_BIT);
            }
        }
    }
    debugDumpMips(layer = 0) {
        const gl = this.renderer.getContext();
        const fb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        const debug = document.createElement("div");
        debug.style.zIndex = "10000";
        debug.style.position = "absolute";
        debug.style.top = debug.style.bottom = debug.style.left = debug.style.right = "0";
        debug.style.overflow = "scroll";
        debug.style.background = "black";
        const close = document.createElement("button");
        close.innerText = "close";
        debug.appendChild(close);
        close.addEventListener("click", () => document.body.removeChild(debug), { once: true });
        close.style.marginBottom = "10px";
        const mips = this.mipFramebuffers[layer];
        for (let mipLevel = 0; mipLevel < this.mipLevels; mipLevel++) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, mips[mipLevel]);
            const c = document.createElement("canvas");
            c.width = c.height = this.layerResolution / Math.pow(2, mipLevel);
            c.style.display = "block";
            c.style.backgroundImage =
                "linear-gradient(45deg, #808080 25%, transparent 25%), linear-gradient(-45deg, #808080 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #808080 75%), linear-gradient(-45deg, transparent 75%, #808080 75%)";
            c.style.backgroundSize = "64px 64px";
            c.style.backgroundPosition = "0 0, 0 32px, 32px -32px, -32px 0px";
            c.style.backgroundColor = "white";
            c.style.marginBottom = "10px";
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
    growTextureArray(newDepth) {
        const { state } = this.renderer;
        const gl = this.renderer.getContext();
        const prevGlTexture = this.glTexture;
        const prevArrayDepth = this.arrayDepth;
        const prevMipFramebuffers = this.mipFramebuffers;
        this.createTextureArray(newDepth);
        const [blitCopyHackTexture, blitCopyHackFB] = createBlitCopyFramebuffer(gl, state, this.layerResolution, this.layerResolution, this.glTexture);
        const maxMipLevels = this.mipLevels;
        for (let z = 0; z < prevArrayDepth; z++) {
            for (let mipLevel = 0; mipLevel < maxMipLevels; mipLevel++) {
                const res = this.layerResolution / Math.pow(2, mipLevel);
                gl.bindFramebuffer(gl.READ_FRAMEBUFFER, prevMipFramebuffers[z][mipLevel]);
                gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, useBlitHack ? blitCopyHackFB : this.mipFramebuffers[z][mipLevel]);
                gl.blitFramebuffer(0, 0, res, res, 0, 0, res, res, gl.COLOR_BUFFER_BIT, gl.NEAREST);
                if (useBlitHack) {
                    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, blitCopyHackFB);
                    gl.copyTexSubImage3D(gl.TEXTURE_2D_ARRAY, mipLevel, 0, 0, z, 0, 0, res, res);
                }
            }
        }
        if (useBlitHack) {
            gl.deleteTexture(blitCopyHackTexture);
            gl.deleteFramebuffer(blitCopyHackFB);
        }
        for (let z = 0; z < prevMipFramebuffers.length; z++) {
            const mips = prevMipFramebuffers[z];
            for (let mipLevel = 0; mipLevel < mips.length; mipLevel++) {
                gl.deleteFramebuffer(mips[mipLevel]);
            }
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.deleteTexture(prevGlTexture);
    }
    addTexture(texture, uvTransform) {
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
            width = Math.min(three_1.Math.floorPowerOfTwo(width), this.layerResolution);
            height = Math.round(width * ratio);
            size = width;
        }
        else {
            const ratio = width / height;
            height = Math.min(three_1.Math.floorPowerOfTwo(height), this.layerResolution);
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
        }
        else {
            this.uploadImage(layerIdx, atlasIdx, img);
        }
        const layer = this.layers[layerIdx];
        // We want to target the center of each texel
        const halfTexel = 0.5 / this.layerResolution;
        uvTransform[0] = (atlasIdx % layer.colls) / layer.colls + halfTexel;
        uvTransform[1] = Math.floor(atlasIdx / layer.rows) / layer.rows + halfTexel;
        // We want to subtract half a pixel from the left and right, so the width/height is -1
        uvTransform[2] = (1 / layer.colls) * ((width - 1) / layer.size);
        uvTransform[3] = (1 / layer.rows) * ((height - 1) / layer.size);
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
    addColorRect(size, color, uvTransform) {
        const id = this.nextId(size);
        const [layerIdx, atlasIdx] = id;
        const layer = this.layers[layerIdx];
        this.clearTile(id, color);
        const halfTexel = 0.5 / this.layerResolution;
        uvTransform[0] = (atlasIdx % layer.colls) / layer.colls + halfTexel;
        uvTransform[1] = Math.floor(atlasIdx / layer.rows) / layer.rows + halfTexel;
        uvTransform[2] = (1 / layer.colls) * ((size - 1) / layer.size);
        uvTransform[3] = (1 / layer.rows) * ((size - 1) / layer.size);
        return id;
    }
    clearTile(id, color) {
        const gl = this.renderer.getContext();
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
    uploadImage(layerIdx, atlasIdx, img) {
        const state = this.renderer.state;
        const gl = this.renderer.getContext();
        const slot = 0;
        state.activeTexture(gl.TEXTURE0 + slot);
        state.bindTexture(gl.TEXTURE_2D_ARRAY, this.glTexture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, this.flipY);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, this.premultiplyAlpha);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, this.unpackAlignment);
        const layer = this.layers[layerIdx];
        const xOffset = (atlasIdx % layer.colls) * layer.size;
        const yOffset = Math.floor(atlasIdx / layer.rows) * layer.size;
        gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, // target
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
    uploadAndResizeImage(layerIdx, atlasIdx, img, width, height) {
        const state = this.renderer.state;
        const gl = this.renderer.getContext();
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
        const [blitCopyHackTexture, blitCopyHackFB] = createBlitCopyFramebuffer(gl, state, width, height, this.glTexture);
        const layer = this.layers[layerIdx];
        const xOffset = (atlasIdx % layer.colls) * layer.size;
        const yOffset = Math.floor(atlasIdx / layer.rows) * layer.size;
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, resizeFramebuffer);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, useBlitHack ? blitCopyHackFB : this.mipFramebuffers[layerIdx][0]);
        const blitXOffset = useBlitHack ? 0 : xOffset;
        const blitYOffset = useBlitHack ? 0 : yOffset;
        gl.blitFramebuffer(0, 0, img.width, img.height, blitXOffset, blitYOffset, blitXOffset + width, blitYOffset + height, gl.COLOR_BUFFER_BIT, gl.LINEAR);
        if (useBlitHack) {
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, blitCopyHackFB);
            gl.copyTexSubImage3D(gl.TEXTURE_2D_ARRAY, 0, xOffset, yOffset, layerIdx, 0, 0, width, height);
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.deleteTexture(resizeTexture);
        if (useBlitHack) {
            gl.deleteTexture(blitCopyHackTexture);
            gl.deleteFramebuffer(blitCopyHackFB);
        }
        this.genMipmaps(layerIdx, atlasIdx);
    }
    genMipmaps(layerIdx, atlasIdx) {
        const state = this.renderer.state;
        const gl = this.renderer.getContext();
        const layer = this.layers[layerIdx];
        let mipLevel = 1;
        const size = layer.size;
        let prevSize = size;
        let curSize = size / 2;
        const r = atlasIdx % layer.colls;
        const c = Math.floor(atlasIdx / layer.rows);
        const [blitCopyHackTexture, blitCopyHackFB] = createBlitCopyFramebuffer(gl, state, size, size, this.glTexture);
        const mips = this.mipFramebuffers[layerIdx];
        while (curSize >= 2 && mipLevel <= this.mipLevels) {
            const srcX = r * prevSize;
            const srcY = c * prevSize;
            const srcX2 = srcX + prevSize;
            const srcY2 = srcY + prevSize;
            const destX = r * curSize;
            const destY = c * curSize;
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, mips[mipLevel - 1]);
            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, useBlitHack ? blitCopyHackFB : mips[mipLevel]);
            const blitXOffset = useBlitHack ? 0 : destX;
            const blitYOffset = useBlitHack ? 0 : destY;
            gl.blitFramebuffer(srcX, srcY, srcX2, srcY2, blitXOffset, blitYOffset, blitXOffset + curSize, blitYOffset + curSize, gl.COLOR_BUFFER_BIT, gl.LINEAR);
            if (useBlitHack) {
                gl.bindFramebuffer(gl.READ_FRAMEBUFFER, blitCopyHackFB);
                gl.copyTexSubImage3D(gl.TEXTURE_2D_ARRAY, mipLevel, destX, destY, layerIdx, 0, 0, curSize, curSize);
            }
            prevSize = curSize;
            mipLevel++;
            curSize /= 2;
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        if (useBlitHack) {
            gl.deleteTexture(blitCopyHackTexture);
            gl.deleteFramebuffer(blitCopyHackFB);
        }
    }
    removeTexture(texture) {
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
exports.default = WebGLAtlasTexture;
Object.defineProperty(WebGLAtlasTexture.prototype, "needsUpdate", {
    set() {
        console.warn("needsUpdate should not be set on a WebGLAtlasTexture, it handles texture uploading internally");
    }
});
//# sourceMappingURL=WebGLAtlasTexture.js.map