// khmWriter.js
// TODO: I think a lot of these functions are unused
export class KHMWriter {
  constructor(model) {
    this.model = model;
    this.buffer = [];
  }

  writeUint8(v) {
    this.buffer.push(v & 0xff);
  }
  writeUint16(v) {
    this.buffer.push(...new Uint8Array(new Uint16Array([v]).buffer));
  }
  writeUint32(v) {
    this.buffer.push(...new Uint8Array(new Uint32Array([v]).buffer));
  }
  writeFloat32(v) {
    this.buffer.push(...new Uint8Array(new Float32Array([v]).buffer));
  }

  writeString(str, length) {
    const bytes = new TextEncoder().encode(str);
    for (let i = 0; i < length; i++) {
      this.buffer.push(bytes[i] || 0x00);
    }
  }

  buildHeader() {
    this.writeString('KHM\0', 4);
    this.writeUint32(101); // KHM_VERSION
  }

  buildBones() {
    const bones = this.model.lBones || [];
    this.writeUint8(bones.length);
    for (const bone of bones) {
      this.writeString(bone.szName || '', 48);
      this.writeUint32(bone.uiId);
      this.writeUint32(bone.uiParentId);
      for (let i = 0; i < 16; i++) this.writeFloat32(bone.matLocal[i]);
      for (let i = 0; i < 16; i++) this.writeFloat32(bone.matGlobal[i]);
    }
  }

  buildHelpers() {
    const helpers = this.model.lHelpers || [];
    this.writeUint8(helpers.length);
    for (const h of helpers) {
      this.writeString(h.szName || '', 48);
      this.writeUint32(h.uiId);
      this.writeUint32(h.uiParentId);
      for (let i = 0; i < 16; i++) this.writeFloat32(h.matLocal[i]);
      for (let i = 0; i < 16; i++) this.writeFloat32(h.matGlobal[i]);
    }
  }

  buildAnimation() {
    const anim = this.model.pAnimation;
    if (
      !anim ||
      !anim.pNodeTransforms ||
      !anim.numNodeFrames ||
      !anim.numNodes
    ) {
      this.writeUint8(0); // no animation
      return;
    }

    this.writeUint8(1); // has animation
    this.writeUint32(anim.numNodes);
    this.writeFloat32(0); // start time (0)
    this.writeFloat32(anim.numNodeFrames * (anim.frameDurationMs / 1000)); // end time
    this.writeUint32(anim.numNodeFrames);

    // skip node animation structs (debug use only)
    for (let i = 0; i < anim.numNodes; i++) {
      this.writeString('', 48); // node name
      this.writeUint32(i); // node ID
    }

    for (const node of anim.pNodeTransforms) {
      for (let i = 0; i < 4; i++) this.writeFloat32(node.qRot[i]);
      for (let i = 0; i < 3; i++) this.writeFloat32(node.vTrans[i]);
      for (let i = 0; i < 3; i++) this.writeFloat32(node.vScale[i]);
    }
  }

  buildAnimationMask() {
    const mask = this.model.pAnimationMask;
    if (!mask || !mask.pNodes || !mask.numNodes) {
      this.writeUint8(0); // no mask
      return;
    }

    this.writeUint8(1);
    this.writeUint32(mask.numNodes);
    for (const entry of mask.pNodes) {
      this.writeString(entry.szObjectName || '', 48);
      this.writeUint32(entry.mask);
    }
  }

  buildMesh() {
    if (!this.model.pMesh) {
      this.writeUint8(0); // no mesh
      return;
    }

    this.writeUint8(1); // has mesh

    const mesh = this.model.pMesh;
    this.writeString(mesh.szName || '', 48);
    this.writeUint32(mesh.uiId);
    this.writeUint32(mesh.uiParentId);
    for (let i = 0; i < 16; i++) this.writeFloat32(mesh.matLocal[i]);
    for (let i = 0; i < 16; i++) this.writeFloat32(mesh.matGlobal[i]);

    // Vertices
    const geometry = mesh.geometry;
    this.writeUint32(mesh.numVertices);
    for (const v of mesh.pVertices)
      for (let i = 0; i < 3; i++) this.writeFloat32(v[i]);

    // 🔧 Inject this BEFORE writing normals
    if (!mesh.pNormals || mesh.pNormals.length !== mesh.numVertices) {
      console.warn(
        `KHMWriter: pNormals missing or incomplete (${mesh.pNormals?.length}), generating [0,1,0] normals`
      );
      mesh.pNormals = [];
      // for (let i = 0; i < mesh.numVertices; i++) {
      //   mesh.pNormals.push([0, 1, 0]); // or compute true normals if needed
      // }
    }

    // Normals
    for (const n of mesh.pNormals)
      for (let i = 0; i < 3; i++) this.writeFloat32(n[i]);
    // if (geometry.attributes.normal) {
    //   const normals = geometry.attributes.normal.array;
    //   for (let i = 0; i < normals.length; i += 3) {
    //     model.pMesh.pNormals.push([normals[i], normals[i + 1], normals[i + 2]]);
    //   }
    // }
    // for (const n of mesh.pNormals)
    //   for (let i = 0; i < 3; i++) this.writeFloat32(n[i]);
    console.error(mesh.pNormals.length, mesh.numVertices, geometry);

    // Indices
    this.writeUint32(mesh.numIndices);
    for (const idx of mesh.pIndices)
      this.buffer.push(idx & 0xff, (idx >> 8) & 0xff);

    // Face Normals
    const numFaces = mesh.numIndices / 3;
    for (let i = 0; i < numFaces; i++) {
      const fn = mesh.pFaceNormals[i];
      for (let j = 0; j < 3; j++) this.writeFloat32(fn[j]);
    }

    // Vertex colors
    if (mesh.pColors && mesh.pColors.length) {
      this.writeUint8(1);
      for (const c of mesh.pColors) this.writeUint32(c);
    } else {
      this.writeUint8(0);
    }

    // TexCoords
    const texCoordCount = mesh.pTexCoords.filter(
      (tc) => tc && tc.length
    ).length;
    this.writeUint32(texCoordCount);
    for (let i = 0; i < texCoordCount; i++) {
      for (const uv of mesh.pTexCoords[i]) {
        this.writeFloat32(uv[0]);
        this.writeFloat32(uv[1]);
      }
    }

    // Skin
    const hasSkin = mesh.pSkinWeights && mesh.pSkinWeights.length > 0;
    this.writeUint8(hasSkin ? 1 : 0);
    if (hasSkin) {
      for (const sw of mesh.pSkinWeights)
        for (let i = 0; i < 4; i++) this.writeFloat32(sw[i]);
      for (const bi of mesh.pSkinBoneIndices)
        for (let i = 0; i < 4; i++) this.writeUint8(bi[i]);
    }

    // Collision
    this.writeUint32(mesh.numCollisions);
    for (const col of mesh.pCollisions || []) {
      this.writeUint32(col.type);
      for (let i = 0; i < 16; i++) this.writeFloat32(col.transform[i]);

      switch (col.type) {
        case 0: // SPHERE
          this.writeFloat32(col.params.radius);
          break;
        case 1: // BOX
          for (let i = 0; i < 3; i++) this.writeFloat32(col.params.extents[i]);
          break;
        case 2: // CAPSULE
          this.writeFloat32(col.params.radius);
          this.writeFloat32(col.params.halfHeight);
          break;
        case 3: // CONVEX_MESH
          this.writeUint8(1); // shared

          this.writeUint32(col.params.pPolygons.length);
          for (const poly of col.params.pPolygons) {
            for (let i = 0; i < 3; i++) this.writeUint16(poly.indices[i]);
          }

          this.writeUint32(col.params.pIndices.length);
          for (const idx of col.params.pIndices) this.writeUint16(idx);

          this.writeUint32(col.params.pVertices.length);
          for (const v of col.params.pVertices) {
            for (let i = 0; i < 3; i++) this.writeFloat32(v[i]);
          }
          break;
      }
    }

    // Bounds
    for (let i = 0; i < 3; i++) this.writeFloat32(mesh.min[i]);
    for (let i = 0; i < 3; i++) this.writeFloat32(mesh.max[i]);

    this.writeFloat32(mesh.volume);
  }

  write() {
    this.buildHeader();
    this.buildBones();
    this.buildHelpers();
    this.buildMesh();
    this.buildAnimation();
    this.buildAnimationMask();
    return new Blob([new Uint8Array(this.buffer)], {
      type: 'application/octet-stream',
    });
  }
}
