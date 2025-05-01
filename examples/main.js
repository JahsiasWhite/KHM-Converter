import * as THREE from 'https://unpkg.com/three@0.154.0/build/three.module.js';
import { OrbitControls } from 'https://esm.sh/three@0.154.0/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'https://esm.sh/three@0.154.0/examples/jsm/controls/TransformControls.js';
import { GLTFLoader } from 'https://esm.sh/three@0.154.0/examples/jsm/loaders/GLTFLoader.js';
import { DDSLoader } from 'https://esm.sh/three@0.154.0/examples/jsm/loaders/DDSLoader.js';

import { KHMLoader } from '../khmModel.js'; // loads the model
import { KHMWriter } from '../khmWriter.js'; // writes GLB to KHM

// import JSZip from 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm';

const OUTPUT = 'output.khm';

let camera, scene, renderer, controls, transform;
let vertexHandles = [];
let model = null;
let meshMaterial = null;
let currentModel = null;
let previewModel = null;
let exportRotationY = 0; // tracks how much user rotated the model in the preview

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

  document.getElementById('fileInput').addEventListener('change', loadModel);
  document
    .getElementById('ddsInput')
    .addEventListener('change', applyDDSTexture);
  document.getElementById('exportKHM').addEventListener('click', exportKHM);

  document
    .getElementById('glbPreviewInput')
    .addEventListener('change', previewGLB);
  document
    .getElementById('rotateLeftBtn')
    .addEventListener('click', () => rotatePreview(-1));
  document
    .getElementById('rotateRightBtn')
    .addEventListener('click', () => rotatePreview(1));

  // document
  //   .getElementById('gltfInput')
  //   .addEventListener('change', loadZippedGLTF);

  window.addEventListener('pointerdown', onPointerDown);

  animate();
}

async function applyDDSTexture(e) {
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
}
function removeHelperOrbs() {
  scene.children.forEach((obj) => {
    if (obj.isMesh && obj.geometry?.type === 'SphereGeometry') {
      scene.remove(obj);

      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    }
  });
}

async function loadModel(e) {
  // Remove old model if it exists
  if (currentModel) {
    // Cleanup helper orbs
    transform.detach(); // needed? removes controls from the orb
    helperColorMap = {}; // reset color map for helpers
    renderHelperLegend({});
    // 🔁 Clean up helper orbs
    // TODO: Why does it not remove all in one call??
    removeHelperOrbs();
    removeHelperOrbs();
    removeHelperOrbs();

    // Cleanup model
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

  const loader = new KHMLoader(buffer);
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

  meshMaterial = new THREE.MeshStandardMaterial({
    // vertexColors: true,
    flatShading: false,
  });
  const mesh = new THREE.Mesh(geo, meshMaterial);
  currentModel = mesh;
  scene.add(mesh);

  // Center and normalize the geometry
  // const position = geo.getAttribute('position');
  // const box = new THREE.Box3().setFromBufferAttribute(position);
  // const center = box.getCenter(new THREE.Vector3());
  // const size = new THREE.Vector3();
  // box.getSize(size);
  // const maxDim = Math.max(size.x, size.y, size.z);
  // const scale = 1.0 / maxDim;
  // geo.translate(-center.x, -center.y, -center.z); // move to center
  // geo.scale(scale, scale, scale); // optional: normalize scale

  // Add dot at the center of the model
  // scene.add(
  //   new THREE.Mesh(
  //     new THREE.SphereGeometry(0.01),
  //     new THREE.MeshBasicMaterial({ color: 0x00ff00 })
  //   )
  // );

  // Add visual helpers
  addVisualHelpers(model, meshMaterial);
}

// Shows what colors belong to what helpers
let helperColorMap = {};
function renderHelperLegend(colorMap, documentId = 'helperLegend') {
  const legend = document.getElementById(documentId);
  if (!legend) return;

  legend.style.display = 'block'; // show when helpers exist
  legend.innerHTML = ``;
  for (const [name, color] of Object.entries(colorMap)) {
    legend.innerHTML += `
      <div>
        <span style="background:${color};"></span>${name}
      </div>
    `;
  }
}

function addVisualHelpers(model, material) {
  if (model.lHelpers && model.lHelpers.length > 0) {
    for (const helper of model.lHelpers) {
      const matrix = new THREE.Matrix4()
        .fromArray(Array.from(helper.matGlobal))
        .transpose(); // If it loads wrong, try removing transpose

      // Generate a color for each helper based on its name
      const hash = [...helper.szName].reduce(
        (acc, c) => acc + c.charCodeAt(0),
        0
      );
      const hue = (hash * 37) % 360;
      const color = new THREE.Color(`hsl(${hue}, 100%, 50%)`);
      helperColorMap[helper.szName] = color.getStyle(); // store for legend

      const blob = new THREE.Mesh(
        new THREE.SphereGeometry(0.02),
        new THREE.MeshBasicMaterial({ color })
      );
      blob.applyMatrix4(matrix);
      blob.name = helper.szName;
      blob.userData.isHelper = true;

      scene.add(blob);

      // Attach transform controls to all helpers (optional: remove if not needed)
      if (helper.szName === 'muzzle') transform.attach(blob);

      renderHelperLegend(helperColorMap);
    }
  }

  transform.addEventListener('objectChange', () => {
    const obj = transform.object;
    if (!obj || !obj.userData.isHelper) return;

    const index = model.lHelpers.findIndex((h) => h.szName === obj.name);
    if (index !== -1) {
      const newMatrix = new THREE.Matrix4().compose(
        obj.position,
        obj.quaternion,
        obj.scale
      );

      model.lHelpers[index].matGlobal.set(newMatrix.elements);
      model.lHelpers[index].matLocal.set(newMatrix.elements);

      console.log(
        '🔵 Helper matrix updated',
        model.lHelpers[index].matGlobal,
        model.lHelpers[index].matLocal
      );
    }
  });
}

async function previewGLB(e) {
  if (previewModel) scene.remove(previewModel);
  if (currentModel) scene.remove(currentModel);

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
}

function rotatePreview(direction) {
  if (previewModel) {
    exportRotationY += (direction * Math.PI) / 2;
    previewModel.rotation.y = exportRotationY;
  }
}

function writeKHMFromGLB(model, writer) {
  writer.writeKHM(model);

  // Export texture as a png to be converted to .dds later
  // The user will have to convert it manually
  model.traverse((child) => {
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

async function exportKHM() {
  // document.getElementById('glbInput').click();

  // const file = fileInput.files[0];
  if (!previewModel) {
    alert('Please select a GLB file first.');
    return;
  }

  const writer = new KHMWriter(model);

  writeKHMFromGLB(previewModel, writer);

  const blob = await new Blob([new Uint8Array(writer.buffer)], {
    type: 'application/octet-stream',
  });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = OUTPUT;
  link.click();
  console.log(`✅ Exported ${OUTPUT}`);

  return;
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

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

const glbHelpers = []; // track manually added helper objects
document.getElementById('addHelperBtn').addEventListener('click', () => {
  if (!previewModel) {
    alert('Load a GLB model first.');
    return;
  }

  const helperName = prompt(
    'Enter helper name (e.g., muzzle, optics_socket, optics_socket_pistol, IKHandL, silencer_socket, underbarrel):'
  );
  if (!helperName) return;

  // Create sphere helper
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.02),
    new THREE.MeshBasicMaterial({ color: 0xff00ff }) // pick any starter color
  );

  // Start at model center
  const box = new THREE.Box3().setFromObject(previewModel);
  const center = box.getCenter(new THREE.Vector3());
  sphere.position.copy(center);

  sphere.name = helperName;
  sphere.userData.isHelper = true;
  glbHelpers.push(sphere);

  scene.add(sphere);
  transform.attach(sphere); // auto-attach for placement

  console.log(`🟣 Helper "${helperName}" added at`, sphere.position);

  const color = sphere.material.color.getStyle();
  renderHelperLegend(
    Object.fromEntries(glbHelpers.map((h) => [h.name, color])),
    'helperLegendGLB'
  );

  previewModel.helpers = glbHelpers;
});

transform.addEventListener('objectChange', () => {
  const obj = transform.object;
  if (!obj || !obj.userData.isHelper) return;

  // Position is already updated — log or sync here
  console.log(`🟢 "${obj.name}" moved to`, obj.position, previewModel);
  glbHelpers.map((h, i) =>
    console.log({
      szName: h.name,
      uiId: i,
      uiParentId: 255, // or assign correctly
      matLocal: new THREE.Matrix4()
        .compose(h.position, h.quaternion, h.scale)
        .toArray(),
      matGlobal: new THREE.Matrix4()
        .compose(h.position, h.quaternion, h.scale)
        .toArray(),
    })
  );
});
