# three-batch-manager

[![CircleCI](https://circleci.com/gh/MozillaReality/three-render-manager.svg?style=svg)](https://circleci.com/gh/MozillaReality/three-render-manager)

High level batching / instancing API for ThreeJS

This project is currently experimental, the API will change, and it may not always be in a working state.

## Features
- [ ] Dynamic batching via instance vertex attribute and instance uniforms stored in a uniform array (In Progress)
- [ ] Skinned mesh support
- [ ] Static batching
- [ ] Instancing
- [ ] Batched 2D quads with spritesheet support for UIs
- [ ] Batched SDF font rendering

## Running the Example

The example uses models from the [glTF-Sample-Models](https://github.com/KhronosGroup/glTF-Sample-Models) repository which is included as a [git submodule](https://git-scm.com/book/en/v2/Git-Tools-Submodules).

To pull in the submodule run the following commands:

```
git submodule init 
git submodule update
```

Then to start the example run:

```
npm install
npm start
```
