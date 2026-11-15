/**
 * Three.js のオブジェクト階層から三角形メッシュをマテリアル単位で集約する（DXF / USD 出力で共用）。
 */
import * as THREE from 'three';

export interface MeshChunk {
  key: string;
  /** リニア RGB (0-1) */
  color: [number, number, number];
  opacity: number;
  metalness: number;
  roughness: number;
  glass: boolean;
  positions: number[];
  indices: number[];
}

function isVisible(o: THREE.Object3D, stop: THREE.Object3D): boolean {
  let cur: THREE.Object3D | null = o;
  while (cur) {
    if (!cur.visible) return false;
    if (cur === stop) break;
    cur = cur.parent;
  }
  return true;
}

function materialInfo(m: THREE.Material): Omit<MeshChunk, 'positions' | 'indices'> {
  const std = m as THREE.MeshStandardMaterial;
  const color = new THREE.Color();
  if (typeof m.userData.exportColor === 'number') color.setHex(m.userData.exportColor as number);
  else if (std.color) color.copy(std.color);
  else color.setHex(0x808080);
  const opacity =
    typeof m.userData.exportOpacity === 'number' ? (m.userData.exportOpacity as number) : m.transparent ? m.opacity : 1;
  const metalness = typeof std.metalness === 'number' ? std.metalness : 0;
  const roughness = typeof std.roughness === 'number' ? std.roughness : 0.6;
  const glass = m.userData.glass === true;
  const key = [color.getHexString(), opacity.toFixed(3), metalness.toFixed(2), roughness.toFixed(2), glass ? 1 : 0].join('_');
  return { key, color: [color.r, color.g, color.b], opacity, metalness, roughness, glass };
}

/**
 * @param root    走査するルート
 * @param toFrame ワールド座標 → 出力座標系への変換行列（root ローカルにしたい場合は root.matrixWorld の逆行列）
 */
export function collectChunks(root: THREE.Object3D, toFrame: THREE.Matrix4): MeshChunk[] {
  root.updateWorldMatrix(true, true);
  const chunks = new Map<string, MeshChunk>();
  const m = new THREE.Matrix4();
  const v = new THREE.Vector3();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || mesh.userData.noExport || !isVisible(mesh, root)) return;
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const info = materialInfo(material);
    let chunk = chunks.get(info.key);
    if (!chunk) {
      chunk = { ...info, positions: [], indices: [] };
      chunks.set(info.key, chunk);
    }
    m.multiplyMatrices(toFrame, mesh.matrixWorld);
    const flip = m.determinant() < 0;
    const pos = mesh.geometry.getAttribute('position');
    const base = chunk.positions.length / 3;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      chunk.positions.push(v.x, v.y, v.z);
    }
    const idx = mesh.geometry.getIndex();
    const n = idx ? idx.count : pos.count;
    for (let i = 0; i < n; i += 3) {
      const a = idx ? idx.getX(i) : i;
      const b = idx ? idx.getX(i + 1) : i + 1;
      const c = idx ? idx.getX(i + 2) : i + 2;
      if (flip) chunk.indices.push(base + a, base + c, base + b);
      else chunk.indices.push(base + a, base + b, base + c);
    }
  });
  return [...chunks.values()];
}
