import * as THREE from 'https://unpkg.com/three@0.154.0/build/three.module.js';
import { OrbitControls } from 'https://esm.sh/three@0.154.0/examples/jsm/controls/OrbitControls.js?bundle';

import { DDSLoader } from './ddsLoader.js';

import { CLoader, sModelDefinition } from './khmModel.js';

const ddsLoader = new DDSLoader();
THREE.DefaultLoadingManager.addHandler(/\.dds$/i, ddsLoader);

const fileInput = document.getElementById('fileInput');
const output = document.getElementById('output');

// Setup Three.js scene
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 0, 5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);

const ambient = new THREE.AmbientLight(0xffffff, 0.4); // soft white light
scene.add(ambient);

const ddsInput = document.getElementById('ddsInput');
let meshMaterial = null; // Will point to our mesh's material
ddsInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const arrayBuffer = await file.arrayBuffer();
  const ddsLoader = new DDSLoader();
  const dds = ddsLoader.parse(arrayBuffer, true); // this returns a raw info object
  const texture = new THREE.CompressedTexture(
    dds.mipmaps,
    dds.width,
    dds.height,
    dds.format
  );

  // apply required settings
  texture.minFilter = THREE.LinearMipMapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;

  meshMaterial.map = texture;
  meshMaterial.needsUpdate = true;
});

fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  const buffer = await file.arrayBuffer();

  const loader = new CLoader(buffer);
  const { model } = loader.loadModel();

  const geo = new THREE.BufferGeometry();
  const verts = [];
  for (const v of model.pMesh.pVertices) {
    verts.push(v[0], v[1], v[2]);
  }
  const indices = model.pMesh.pIndices;

  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(indices);
  if (model.pMesh.pColors.length > 0) {
    const colors = model.pMesh.pColors.flatMap((rgba) => {
      // Convert 0xAARRGGBB to normalized RGB
      const r = ((rgba >> 16) & 0xff) / 255;
      const g = ((rgba >> 8) & 0xff) / 255;
      const b = (rgba & 0xff) / 255;
      return [r, g, b];
    });

    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  }
  if (model.pMesh.pTexCoords[0].length > 0) {
    const uvs = [];
    for (const uv of model.pMesh.pTexCoords[0]) {
      uvs.push(uv[0], uv[1]);
    }
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  }
  geo.computeVertexNormals();

  //   const texture = ddsLoader.load('cia_01.dds');
  //   const mat = new THREE.MeshStandardMaterial({
  //     map: texture,
  //     flatShading: false,
  //   });
  meshMaterial = new THREE.MeshStandardMaterial({
    // vertexColors: true,
    flatShading: false,
  });
  const mesh = new THREE.Mesh(geo, meshMaterial);
  scene.add(mesh);

  //   const texture = new THREE.TextureLoader().load('path/to/yourTexture.dds');
  //   mat.map = texture;
  //   mat.needsUpdate = true;
});

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();
