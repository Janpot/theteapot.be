#!/usr/bin/env node
// Converts teapot.obj → teapot.bin (pre-baked typed arrays for zero-parse loading)
// Binary layout:
//   [4 bytes] numVertices (uint32)
//   [4 bytes] numIndices  (uint32)
//   [4 bytes] bottomY     (float32)
//   [4 bytes] useUint32   (uint32, 0 or 1)
//   [numVertices*3 * 4 bytes] positions (float32)
//   [numVertices*3 * 4 bytes] normals   (float32)
//   [numIndices * (useUint32 ? 4 : 2) bytes] indices

import { readFileSync, writeFileSync } from "fs";

const text = readFileSync("teapot.obj", "utf-8");

const vertices = [], faces = [];
for (const line of text.split("\n")) {
  const p = line.trim().split(/\s+/);
  if (p[0] === "v") vertices.push([+p[1], +p[2], +p[3]]);
  else if (p[0] === "f") faces.push(p.slice(1).map(s => parseInt(s.split("/")[0]) - 1));
}

let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
for (const v of vertices) for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], v[i]); max[i] = Math.max(max[i], v[i]); }
const center = [(min[0]+max[0])/2, (min[1]+max[1])/2, (min[2]+max[2])/2];
const extent = Math.max(max[0]-min[0], max[1]-min[1], max[2]-min[2]);
const sc = 2 / extent;
const scaled = vertices.map(v => [(v[0]-center[0])*sc, (v[1]-center[1])*sc, (v[2]-center[2])*sc]);

let bottomY = Infinity;
for (const v of scaled) bottomY = Math.min(bottomY, v[1]);

function cross(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
function sub(a,b){return[a[0]-b[0],a[1]-b[1],a[2]-b[2]];}
function add(a,b){return[a[0]+b[0],a[1]+b[1],a[2]+b[2]];}
function normalize(v){const l=Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]);return l>0?[v[0]/l,v[1]/l,v[2]/l]:[0,0,0];}

const vn = scaled.map(() => [0,0,0]);
for (const face of faces) for (let i = 1; i < face.length - 1; i++) {
  const n = cross(sub(scaled[face[i]], scaled[face[0]]), sub(scaled[face[i+1]], scaled[face[0]]));
  for (const idx of [face[0], face[i], face[i+1]]) vn[idx] = add(vn[idx], n);
}
for (let i = 0; i < vn.length; i++) vn[i] = normalize(vn[i]);

const triIndices = [];
for (const face of faces) for (let i = 1; i < face.length - 1; i++) triIndices.push(face[0], face[i], face[i+1]);

const useUint32 = triIndices.length > 65535 ? 1 : 0;
const numVertices = scaled.length;
const numIndices = triIndices.length;

const headerSize = 16;
const posSize = numVertices * 3 * 4;
const normSize = numVertices * 3 * 4;
const idxSize = numIndices * (useUint32 ? 4 : 2);
const buf = Buffer.alloc(headerSize + posSize + normSize + idxSize);

const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
let off = 0;
dv.setUint32(off, numVertices, true); off += 4;
dv.setUint32(off, numIndices, true); off += 4;
dv.setFloat32(off, bottomY, true); off += 4;
dv.setUint32(off, useUint32, true); off += 4;

for (let i = 0; i < numVertices; i++) {
  dv.setFloat32(off, scaled[i][0], true); off += 4;
  dv.setFloat32(off, scaled[i][1], true); off += 4;
  dv.setFloat32(off, scaled[i][2], true); off += 4;
}
for (let i = 0; i < numVertices; i++) {
  dv.setFloat32(off, vn[i][0], true); off += 4;
  dv.setFloat32(off, vn[i][1], true); off += 4;
  dv.setFloat32(off, vn[i][2], true); off += 4;
}
if (useUint32) {
  for (let i = 0; i < numIndices; i++) { dv.setUint32(off, triIndices[i], true); off += 4; }
} else {
  for (let i = 0; i < numIndices; i++) { dv.setUint16(off, triIndices[i], true); off += 2; }
}

writeFileSync("teapot.bin", buf);
console.log(`teapot.bin: ${buf.byteLength} bytes (${numVertices} verts, ${numIndices} indices, uint32=${!!useUint32})`);
