import * as THREE from 'https://unpkg.com/three@0.154.0/build/three.module.js';
import { CLoader, sModelDefinition } from './khmModel.js';

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

// Lighting
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(5, 10, 7.5);
scene.add(light);

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

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);

  const texture = new THREE.TextureLoader().load('path/to/yourTexture.png');
  mat.map = texture;
  mat.needsUpdate = true;
});

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
animate();
