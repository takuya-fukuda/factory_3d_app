/**
 * パーツ形状を組み立てるための小さなヘルパ群。
 * ジオメトリは単位形状を共有し、メッシュの scale で寸法を与える（メモリ節約）。
 */
import * as THREE from 'three';

export type V3 = [number, number, number];

export interface MatOptions {
  metalness?: number;
  roughness?: number;
  opacity?: number;
  emissive?: number;
  emissiveIntensity?: number;
  /** ガラス等の透明パネル（DXF 出力で除外できるよう印を付ける） */
  glass?: boolean;
}

const matCache = new Map<string, THREE.MeshStandardMaterial>();

/** 色・質感ごとにキャッシュされた共有マテリアルを返す */
export function mat(color: number, o: MatOptions = {}): THREE.MeshStandardMaterial {
  const metalness = o.metalness ?? 0.1;
  const roughness = o.roughness ?? 0.7;
  const opacity = o.opacity ?? 1;
  const emissive = o.emissive ?? 0x000000;
  const emissiveIntensity = o.emissiveIntensity ?? 1;
  const key = [color, metalness, roughness, opacity, emissive, emissiveIntensity, o.glass ? 1 : 0].join('|');
  const hit = matCache.get(key);
  if (hit) return hit;
  const m = new THREE.MeshStandardMaterial({ color, metalness, roughness, emissive, emissiveIntensity });
  if (opacity < 1) {
    m.transparent = true;
    m.opacity = opacity;
    m.depthWrite = false;
    m.side = THREE.DoubleSide;
  }
  m.userData.glass = o.glass === true;
  m.userData.shared = true;
  matCache.set(key, m);
  return m;
}

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 16, 1);
const unitCylLow = new THREE.CylinderGeometry(1, 1, 1, 10, 1);
export const unitPlane = new THREE.PlaneGeometry(1, 1);

/** 直方体。size はローカル (X, Y, Z) の全長、pos は中心、rot はオイラー角 (rad) */
export function box(parent: THREE.Object3D, size: V3, pos: V3, material: THREE.Material, rot?: V3): THREE.Mesh {
  const m = new THREE.Mesh(unitBox, material);
  m.scale.set(Math.max(size[0], 1e-4), Math.max(size[1], 1e-4), Math.max(size[2], 1e-4));
  m.position.set(pos[0], pos[1], pos[2]);
  if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
  parent.add(m);
  return m;
}

/** 円柱。axis 方向に length、半径 r */
export function cyl(
  parent: THREE.Object3D,
  r: number,
  length: number,
  pos: V3,
  axis: 'x' | 'y' | 'z',
  material: THREE.Material,
  lowPoly = false,
): THREE.Mesh {
  const m = new THREE.Mesh(lowPoly ? unitCylLow : unitCyl, material);
  m.scale.set(r, length, r);
  m.position.set(pos[0], pos[1], pos[2]);
  if (axis === 'x') m.rotation.z = Math.PI / 2;
  else if (axis === 'z') m.rotation.x = Math.PI / 2;
  parent.add(m);
  return m;
}

export function group(parent: THREE.Object3D, pos: V3 = [0, 0, 0]): THREE.Group {
  const g = new THREE.Group();
  g.position.set(pos[0], pos[1], pos[2]);
  parent.add(g);
  return g;
}

/** パーツ固有（非共有）のマテリアル・テクスチャを破棄する */
export function disposeUnique(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (m.userData.shared) continue;
      const tex = (m as THREE.MeshStandardMaterial).map;
      tex?.dispose();
      m.dispose();
    }
  });
}

/** ドラッグ中のプレビュー用に半透明化したコピーを作る */
export function makeGhost(src: THREE.Object3D): THREE.Object3D {
  const ghostMat = new THREE.MeshStandardMaterial({
    color: 0x66b3ff,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  ghostMat.userData.shared = false;
  disposeUnique(src);
  src.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) mesh.material = ghostMat;
  });
  src.userData.animate = undefined;
  return src;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
