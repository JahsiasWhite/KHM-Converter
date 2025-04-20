// khmMeshEditor.js
// TODO: Remove the unused stuff, like unused functions and early returns
import * as THREE from 'https://unpkg.com/three@0.154.0/build/three.module.js';
import { OrbitControls } from 'https://esm.sh/three@0.154.0/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'https://esm.sh/three@0.154.0/examples/jsm/controls/TransformControls.js';
import { GLTFLoader } from 'https://esm.sh/three@0.154.0/examples/jsm/loaders/GLTFLoader.js';
import { CLoader } from './khmModel.js'; // your loader
import { KHMWriter } from './khmWriter.js'; // new khm writer
import { DDSLoader } from './ddsLoader.js'; // TODO: Can I just use a CDN for this?
import JSZip from 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm';
import * as BufferGeometryUtils from 'https://esm.sh/three@0.154.0/examples/jsm/utils/BufferGeometryUtils.js';

let camera, scene, renderer, controls, transform;
let skinnedMesh = null;
let vertexHandles = [];
let model = null;
let meshMaterial = null;

init();

function init() {
  // Scene setup
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(0, 1, 2);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);

  transform = new TransformControls(camera, renderer.domElement);
  transform.addEventListener('dragging-changed', (e) => {
    controls.enabled = !e.value;
  });
  scene.add(transform);

  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.position.set(5, 10, 5);
  scene.add(light);
  scene.add(new THREE.AmbientLight(0xffffff, 0.3));

  document.getElementById('fileInput').addEventListener('change', loadModel2);
  // document
  //   .getElementById('gltfInput')
  //   .addEventListener('change', loadZippedGLTF);
  // document.getElementById('exportKHM').addEventListener('click', exportKHM);

  window.addEventListener('pointerdown', onPointerDown);

  animate();
}

const ddsInput = document.getElementById('ddsInput');
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

let currentModel = null;
async function loadModel2(e) {
  // Remove old model if it exists
  if (currentModel) {
    scene.remove(currentModel);
    currentModel.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
    currentModel = null;
  }

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
  currentModel = mesh;
  scene.add(mesh);

  //   const texture = new THREE.TextureLoader().load('path/to/yourTexture.dds');
  //   mat.map = texture;
  //   mat.needsUpdate = true;
}

async function loadZippedGLTF(event) {
  const file = event.target.files[0];
  if (!file) return;

  const zip = await JSZip.loadAsync(file);
  const blobURLs = {};
  let gltfPath = null;
  const fileMap = new Map();

  for (const filename of Object.keys(zip.files)) {
    const blob = await zip.files[filename].async('blob');
    const blobURL = URL.createObjectURL(blob);
    fileMap.set(filename, blobURL);
    if (
      filename.toLowerCase().endsWith('.gltf') ||
      filename.toLowerCase().endsWith('.glb')
    ) {
      gltfPath = filename;
    }
  }

  if (!gltfPath) {
    alert('No .gltf or .glb file found in zip.');
    return;
  }

  const loader = new GLTFLoader();
  loader.setCrossOrigin('anonymous');

  // Override resource loading
  loader.manager.setURLModifier((url) => {
    const cleanURL = decodeURIComponent(url.split('/').pop());
    return fileMap.get(cleanURL) || url;
  });

  const gltfURL = fileMap.get(gltfPath);
  loader.load(gltfURL, (gltf) => {
    scene.add(gltf.scene);
    skinnedMesh = gltf.scene;

    // Try to extract geometry
    const mesh = gltf.scene.getObjectByProperty('type', 'Mesh');
    if (!mesh || !mesh.geometry) {
      alert('No mesh found in GLTF scene.');
      return;
    }

    const geometry = mesh.geometry;
    const verts = geometry.attributes.position.array;
    const indices = geometry.index ? geometry.index.array : [];

    // Build mock model
    model = {
      pMesh: {
        szName: 'GLTFMesh',
        uiId: 0,
        uiParentId: 255,
        matLocal: new Float32Array(16).fill(0),
        matGlobal: new Float32Array(16).fill(0),
        numVertices: verts.length / 3,
        pVertices: [],
        pNormals: [],
        numIndices: indices.length,
        pIndices: [],
        pFaceNormals: [],
        pColors: [],
        pTexCoords: [[], []],
        min: [0, 0, 0],
        max: [0, 0, 0],
        volume: 0,
      },
      lBones: [],
      lHelpers: [],
      numBones: 0,
      numHelpers: 0,
    };

    for (let i = 0; i < verts.length; i += 3) {
      model.pMesh.pVertices.push([verts[i], verts[i + 1], verts[i + 2]]);
    }

    if (geometry.attributes.normal) {
      const normals = geometry.attributes.normal.array;
      for (let i = 0; i < normals.length; i += 3) {
        model.pMesh.pNormals.push([normals[i], normals[i + 1], normals[i + 2]]);
      }
    }

    for (let i = 0; i < indices.length; i++) {
      model.pMesh.pIndices.push(indices[i]);
    }

    console.log('Zipped GLTF loaded and converted to KHM model.', model);
  });
}

const glbPreviewInput = document.getElementById('glbPreviewInput');
const rotateLeftBtn = document.getElementById('rotateLeftBtn');
const rotateRightBtn = document.getElementById('rotateRightBtn');

let previewModel = null;
let exportRotationY = 0; // tracks how much user rotated

glbPreviewInput.addEventListener('change', async (e) => {
  if (previewModel) scene.remove(previewModel);

  const file = e.target.files[0];
  const arrayBuffer = await file.arrayBuffer();
  const blobURL = URL.createObjectURL(new Blob([arrayBuffer]));

  const loader = new GLTFLoader();
  loader.load(blobURL, (gltf) => {
    previewModel = gltf.scene;

    // Normalize size and center it
    const box = new THREE.Box3().setFromObject(previewModel);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = box.getCenter(new THREE.Vector3());
    const scale = 1.0 / Math.max(size.x, size.y, size.z);

    previewModel.scale.set(scale, scale, scale);
    previewModel.position.sub(center.multiplyScalar(scale));

    scene.add(previewModel);
  });
});

rotateLeftBtn.addEventListener('click', () => {
  if (previewModel) {
    exportRotationY -= Math.PI / 2;
    previewModel.rotation.y = exportRotationY;
  }
});

rotateRightBtn.addEventListener('click', () => {
  if (previewModel) {
    exportRotationY += Math.PI / 2;
    previewModel.rotation.y = exportRotationY;
  }
});

const OUTPUT = 'output.khm';
const MAX_NAME = 48;
function writeKHMFromGLB(scene, writer) {
  // HEADER: KHM + version
  writer.writeUint8('K'.charCodeAt(0));
  writer.writeUint8('H'.charCodeAt(0));
  writer.writeUint8('M'.charCodeAt(0));
  writer.writeUint8(0x00);
  writer.writeUint32(101); // version

  // let mesh = null;
  // scene.traverse((child) => {
  //   if (child.isMesh && !mesh) mesh = child;
  // });
  // if (!mesh) throw new Error('No mesh found in glTF scene');
  scene.updateMatrixWorld(true);
  const geometries = [];
  scene.traverse((child) => {
    if (child.isMesh) {
      const geo = child.geometry.clone();
      geo.applyMatrix4(child.matrixWorld);
      geometries.push(geo);
    }
  });

  if (geometries.length === 0) throw new Error('No meshes found');
  const mergedGeometry = BufferGeometryUtils.mergeGeometries(geometries, false);
  const mesh = new THREE.Mesh(mergedGeometry);

  // Normalize size and center of the model
  const position = mesh.geometry.getAttribute('position');
  const box = new THREE.Box3().setFromBufferAttribute(position);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z);
  const scale = 1.0 / maxDim;
  const center = box.getCenter(new THREE.Vector3());
  mesh.geometry.translate(-center.x, -center.y, -center.z);
  mesh.geometry.scale(scale, scale, scale);
  // Rotate 90 degrees to the left around Y axis
  const axis = new THREE.Vector3(0, 1, 0); // Y-axis
  const angle = THREE.MathUtils.degToRad(90); // 90 degrees to the left
  // mesh.geometry.applyMatrix4(new THREE.Matrix4().makeRotationAxis(axis, angle));
  console.error(
    'exportRotationY',
    exportRotationY,
    THREE.MathUtils.degToRad(90)
  );

  const geometry = mesh.geometry;
  // const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  const index = geometry.index;

  // Bones (none for now)
  writer.writeUint8(0); // num bones

  // Helpers (none for now)
  // Have to manually define where the muzzle is
  writer.writeUint8(0); // num helpers

  // Mesh present
  writer.writeUint8(1);

  // sObjectBase
  writer.writeString(mesh.name || 'mesh', MAX_NAME);
  writer.writeUint32(1); // id
  writer.writeUint32(0); // parent id
  for (let i = 0; i < 16; i++)
    writer.writeFloat32(i === 0 || i === 5 || i === 10 || i === 15 ? 1 : 0); // local mat
  for (let i = 0; i < 16; i++)
    writer.writeFloat32(i === 0 || i === 5 || i === 10 || i === 15 ? 1 : 0); // global mat

  // Geometry
  writer.writeUint32(position.count); // num verts
  for (let i = 0; i < position.count; i++) {
    writer.writeFloat32(position.getX(i));
    writer.writeFloat32(position.getY(i));
    writer.writeFloat32(position.getZ(i));
  }

  for (let i = 0; i < normal.count; i++) {
    writer.writeFloat32(normal.getX(i));
    writer.writeFloat32(normal.getY(i));
    writer.writeFloat32(normal.getZ(i));
  }

  writer.writeUint32(index.count); // indices
  for (let i = 0; i < index.count; i++) {
    writer.writeUint16(index.array[i]);
  }

  // Face normals (placeholder)
  const faceCount = index.count / 3;
  for (let i = 0; i < faceCount; i++) {
    writer.writeFloat32(0);
    writer.writeFloat32(1);
    writer.writeFloat32(0);
  }

  // Vertex colors (not present)
  writer.writeUint8(0);

  // TexCoord count
  writer.writeUint32(1);
  for (let i = 0; i < uv.count; i++) {
    writer.writeFloat32(uv.getX(i));
    writer.writeFloat32(uv.getY(i));
  }

  // Skinning
  writer.writeUint8(0); // no skin

  // Collision data
  writer.writeUint32(0); // no collision

  // Bounding box (min/max)
  // const box = new THREE.Box3().setFromBufferAttribute(position);
  writer.writeFloat32(box.min.x);
  writer.writeFloat32(box.min.y);
  writer.writeFloat32(box.min.z);
  writer.writeFloat32(box.max.x);
  writer.writeFloat32(box.max.y);
  writer.writeFloat32(box.max.z);

  writer.writeFloat32(0); // volume

  // Animation
  writer.writeUint8(0); // no animation

  // Animation mask
  writer.writeUint8(0);

  // Export texture as a png to be converted to .dds later
  // The user will have to convert it manually
  scene.traverse((child) => {
    if (child.isMesh) {
      // console.log('vertexColors', child.material.vertexColors); // If this is true, is a different conversion required?

      const texture = child.material.map;
      // TODO: Can I return if no texture here or will that break too early?
      if (texture) {
        const canvas = extractTextureCanvasFromMap(texture);
        if (canvas) {
          downloadCanvasAsDDSPlaceholder(canvas, 'diffuse.png'); // manually convert to .dds
        }
      }
    }
  });
}
function downloadCanvasAsDDSPlaceholder(canvas, filename = 'diffuse.png') {
  canvas.toBlob((blob) => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename; // .png for now, convert to .dds later
    link.click();
  }, 'image/png');
}
function extractTextureCanvasFromMap(map) {
  const bitmap = map.source?.data;
  if (!(bitmap instanceof ImageBitmap)) {
    console.warn('No image bitmap found in texture source');
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);

  return canvas;
}
export async function loadGLB(filePath) {
  const loader = new GLTFLoader();
  return new Promise((resolve) => {
    loader.load(filePath, resolve);
  });
}
// const fileInput = document.getElementById('exportKHM');
// const exportBtn = document.getElementById('exportKHM');
document.getElementById('exportKHM').addEventListener('click', exportKHM);
// exportBtn.addEventListener('click', () => {
//   fileInput.click();
// });

// fileInput.addEventListener('change', async () => {
//   await exportKHM();
// });
async function exportKHM() {
  // document.getElementById('glbInput').click();

  // const file = fileInput.files[0];
  if (!previewModel) {
    alert('Please select a GLB file first.');
    return;
  }

  // const arrayBuffer = await file.arrayBuffer();
  // const blobURL = URL.createObjectURL(new Blob([arrayBuffer]));
  // const gltf = await loadGLB(blobURL);
  // const scene = gltf.scene;
  const writer = new KHMWriter(model);

  writeKHMFromGLB(previewModel, writer);

  // fs.writeFileSync(OUTPUT, writer.getUint8Array());
  const blob2 = await new Blob([new Uint8Array(writer.buffer)], {
    type: 'application/octet-stream',
  });
  console.error(blob2);
  const link2 = document.createElement('a');
  link2.href = URL.createObjectURL(blob2);
  link2.download = 'exported_model.khm';
  link2.click();
  console.log(`✅ Exported ${OUTPUT}`);

  return;
  // START OF GLTF EXPORT CODE
  if (!model || !model.pMesh) {
    alert('No model loaded to export.');
    console.error(model, skinnedMesh);
    return;
  }

  // const writer = new KHMWriter(model);
  const blob = writer.write();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'exported_model.khm';
  link.click();
}

function createVertexHandles() {
  vertexHandles.forEach((h) => scene.remove(h));
  vertexHandles = [];

  const verts = model.pMesh.pVertices;

  for (let i = 0; i < verts.length; i++) {
    const v = verts[i];
    const handle = new THREE.Mesh(
      new THREE.SphereGeometry(0.01),
      new THREE.MeshBasicMaterial({ color: 0xff0000 })
    );
    handle.position.set(v[0], v[1], v[2]);
    handle.userData.vertexIndex = i;
    scene.add(handle);
    vertexHandles.push(handle);
  }
}

function onPointerDown(e) {
  const mouse = new THREE.Vector2(
    (e.clientX / window.innerWidth) * 2 - 1,
    -(e.clientY / window.innerHeight) * 2 + 1
  );

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, camera);

  const intersects = raycaster.intersectObjects(vertexHandles);
  if (intersects.length > 0) {
    transform.attach(intersects[0].object);
  }
}

transform.addEventListener('objectChange', () => {
  const handle = transform.object;
  const index = handle.userData.vertexIndex;
  const pos = handle.position;

  model.pMesh.pVertices[index][0] = pos.x;
  model.pMesh.pVertices[index][1] = pos.y;
  model.pMesh.pVertices[index][2] = pos.z;

  const attr = skinnedMesh.geometry.attributes.position;
  attr.setXYZ(index, pos.x, pos.y, pos.z);
  attr.needsUpdate = true;
});

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
