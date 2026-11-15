/**
 * 工場建屋（床・グリッド・半透明の壁・柱・屋根梁）の生成。
 * 原点は床の左手前の角、X=幅、Y=長さ、Z=高さ。
 */
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { FactorySpec } from '../types';
import { box, mat } from '../parts/builders';

/** 柱の配置ピッチ (m) */
const COLUMN_PITCH = 10;

export function columnPositions(f: FactorySpec): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const n = Math.max(1, Math.round(f.length / COLUMN_PITCH));
  for (let i = 0; i <= n; i++) {
    const y = clampInside((f.length * i) / n, f.length);
    out.push([0.2, y], [f.width - 0.2, y]);
  }
  return out;
}

function clampInside(v: number, len: number): number {
  return Math.min(len - 0.2, Math.max(0.2, v));
}

function gridLines(f: FactorySpec, step: number, color: number, z: number): THREE.LineSegments {
  const pts: number[] = [];
  for (let x = 0; x <= f.width + 1e-6; x += step) pts.push(x, 0, z, x, f.length, z);
  for (let y = 0; y <= f.length + 1e-6; y += step) pts.push(0, y, z, f.width, y, z);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8 }));
  line.userData.noExport = true;
  return line;
}

function makeLabel(text: string, cls = 'dim-label'): CSS2DObject {
  const div = document.createElement('div');
  div.className = cls;
  div.textContent = text;
  return new CSS2DObject(div);
}

export function buildBuilding(f: FactorySpec): THREE.Group {
  const g = new THREE.Group();
  g.name = 'Building';
  const W = f.width;
  const L = f.length;
  const H = f.height;

  // 床
  const floor = box(g, [W, L, 0.1], [W / 2, L / 2, -0.05], mat(0x8d949b, { roughness: 0.95 }));
  floor.userData.buildingRole = 'floor';
  g.add(gridLines(f, 1, 0x7a8188, 0.003));
  g.add(gridLines(f, 5, 0x4f565d, 0.005));

  // 壁（表示は半透明、出力時は不透明のグレー）
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0xbcd3e6,
    transparent: true,
    opacity: 0.06,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  wallMat.userData.exportColor = 0xd5dade;
  wallMat.userData.exportOpacity = 1;
  const t = 0.15;
  const walls: Array<[[number, number, number], [number, number, number]]> = [
    [[W, t, H], [W / 2, -t / 2, H / 2]],
    [[W, t, H], [W / 2, L + t / 2, H / 2]],
    [[t, L, H], [-t / 2, L / 2, H / 2]],
    [[t, L, H], [W + t / 2, L / 2, H / 2]],
  ];
  for (const [size, pos] of walls) {
    const m = box(g, size, pos, wallMat);
    m.userData.buildingRole = 'wall';
    m.renderOrder = -1;
  }

  // 建屋の外形線
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(W, L, H)),
    new THREE.LineBasicMaterial({ color: 0x8fb2d1, transparent: true, opacity: 0.6 }),
  );
  edges.position.set(W / 2, L / 2, H / 2);
  edges.userData.noExport = true;
  g.add(edges);

  // 柱と屋根梁
  const colMat = mat(0x9098a0, { metalness: 0.4, roughness: 0.6 });
  const beamMat = mat(0x7d868f, { metalness: 0.4, roughness: 0.6 });
  const cols = columnPositions(f);
  for (const [x, y] of cols) {
    const c = box(g, [0.4, 0.4, H], [x, y, H / 2], colMat);
    c.userData.buildingRole = 'column';
  }
  for (let i = 0; i < cols.length; i += 2) {
    const y = cols[i][1];
    const b = box(g, [W - 0.4, 0.3, 0.6], [W / 2, y, H - 0.3], beamMat);
    b.userData.buildingRole = 'beam';
  }

  // 寸法ラベル
  const lw = makeLabel(`幅 ${W} m`);
  lw.position.set(W / 2, -1.2, 0);
  const ll = makeLabel(`長さ ${L} m`);
  ll.position.set(-1.2, L / 2, 0);
  const lh = makeLabel(`高さ ${H} m`);
  lh.position.set(-0.5, -0.5, H);
  const lo = makeLabel('原点 (0,0)', 'dim-label origin');
  lo.position.set(0, 0, 0);
  g.add(lw, ll, lh, lo);

  // 原点の軸表示
  const axes = new THREE.AxesHelper(2);
  axes.position.set(0, 0, 0.01);
  axes.userData.noExport = true;
  g.add(axes);

  // 建屋はクリック対象外
  g.traverse((o) => {
    o.raycast = () => undefined;
  });
  return g;
}
