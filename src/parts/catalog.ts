/**
 * パーツカタログ。各パーツは寸法 (Dims) から THREE.Group を生成する。
 * ローカル原点は足元中心、-Y が正面。アニメーションは group.userData.animate(t) に登録する。
 */
import * as THREE from 'three';
import type { Dims, PartType } from '../types';
import { box, clamp, cyl, group, mat, unitPlane } from './builders';

export type AnimateFn = (t: number) => void;

export interface PartDef {
  type: PartType;
  label: string;
  /** USD のプリム名に使う ASCII 名 */
  usdName: string;
  /** DXF レイヤ名 */
  dxfLayer: string;
  /** DXF レイヤ色 (ACI) */
  dxfColor: number;
  description: string;
  defaultDims: Dims;
  minDims: Dims;
  defaultZ: number;
  build: (dims: Dims) => THREE.Group;
}

// ------------------------------------------------------------------ 共通色

const C = {
  steel: 0x56606b,
  alu: 0xc3cad2,
  rackBlue: 0x14408c,
  braceBlue: 0x1f52a3,
  beamOrange: 0xf26b0f,
  galv: 0xb8bcc0,
  brakeRed: 0xcc1414,
  yellow: 0xf5cc0d,
  wood: 0xb5884c,
  cardboard: 0xc8a172,
  robot: 0xff8a00,
  dark: 0x2e3238,
} as const;

// ------------------------------------------------------------------ 作業机

function buildWorkbench({ w, d, h }: Dims): THREE.Group {
  const g = new THREE.Group();
  const top = 0.04;
  const leg = 0.05;
  const steel = mat(C.steel, { metalness: 0.5, roughness: 0.5 });
  // 天板
  box(g, [w, d, top], [0, 0, h - top / 2], mat(0xc9a36b, { roughness: 0.8 }));
  // 脚
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      box(g, [leg, leg, h - top], [sx * (w / 2 - leg / 2 - 0.02), sy * (d / 2 - leg / 2 - 0.02), (h - top) / 2], steel);
    }
  }
  // 天板下フレームと下段棚
  for (const sy of [-1, 1]) box(g, [w - 0.08, 0.03, 0.06], [0, sy * (d / 2 - 0.04), h - top - 0.03], steel);
  box(g, [w - 0.08, d - 0.08, 0.02], [0, 0, 0.18], mat(0x8c96a0));
  // 背面パンチングボード（+Y 側）と照明
  const pb = 0.7;
  const by = d / 2 - 0.04;
  for (const sx of [-1, 1]) box(g, [0.04, 0.04, pb + 0.05], [sx * (w / 2 - 0.04), by, h + (pb + 0.05) / 2], steel);
  box(g, [w - 0.12, 0.015, pb - 0.1], [0, by, h + pb / 2], mat(0xdfe3e8));
  box(g, [w - 0.1, 0.15, 0.04], [0, by - 0.06, h + pb + 0.03], steel);
  box(g, [w - 0.2, 0.1, 0.01], [0, by - 0.06, h + pb + 0.005], mat(0xffffff, { emissive: 0xfff4d6, emissiveIntensity: 0.8 }));
  // 卓上の部品箱
  box(g, [0.3, 0.2, 0.12], [-w * 0.3, d * 0.12, h + 0.06], mat(0x2f6fd6));
  box(g, [0.25, 0.18, 0.1], [w * 0.25, d * 0.08, h + 0.05], mat(0xe0b030));
  return g;
}

// ------------------------------------------------------------------ 自動化機械ライン BOX

function buildAutomationCell({ w, d, h }: Dims): THREE.Group {
  const g = new THREE.Group();
  const alu = mat(C.alu, { metalness: 0.6, roughness: 0.35 });
  const p = 0.05;
  const baseH = 0.1;
  box(g, [w, d, baseH], [0, 0, baseH / 2], mat(0x3b4048));

  // アルミフレーム
  const xs = w > 2.6 ? [-w / 2 + p / 2, 0, w / 2 - p / 2] : [-w / 2 + p / 2, w / 2 - p / 2];
  for (const x of xs) {
    for (const sy of [-1, 1]) box(g, [p, p, h - baseH], [x, sy * (d / 2 - p / 2), baseH + (h - baseH) / 2], alu);
  }
  for (const z of [baseH + p / 2, h - p / 2]) {
    for (const sy of [-1, 1]) box(g, [w, p, p], [0, sy * (d / 2 - p / 2), z], alu);
    for (const sx of [-1, 1]) box(g, [p, d, p], [sx * (w / 2 - p / 2), 0, z], alu);
  }
  // スケルトン（透明パネル）
  const glass = mat(0x9fd4ff, { opacity: 0.16, roughness: 0.05, metalness: 0, glass: true });
  const gh = h - baseH - 2 * p;
  const gz = baseH + p + gh / 2;
  for (const sy of [-1, 1]) box(g, [w - 2 * p, 0.006, gh], [0, sy * (d / 2 - p / 2), gz], glass);
  for (const sx of [-1, 1]) box(g, [0.006, d - 2 * p, gh], [sx * (w / 2 - p / 2), 0, gz], glass);

  // 内部機械のスケール
  const s = clamp(Math.min(w / 4, d / 2, (h - baseH) / 2.2), 0.35, 1.5);
  const darkAlu = mat(0x6b7580, { metalness: 0.5, roughness: 0.4 });
  const robotMat = mat(C.robot, { metalness: 0.2, roughness: 0.45 });
  const jointMat = mat(C.dark, { metalness: 0.4, roughness: 0.5 });

  // コンベヤ（X 方向）
  const cl = w * 0.8;
  const cy = -d * 0.22;
  const ctop = baseH + 0.75 * s;
  box(g, [cl, 0.45 * s, 0.08 * s], [0, cy, ctop - 0.04 * s], darkAlu);
  box(g, [cl - 0.05, 0.4 * s, 0.01], [0, cy, ctop + 0.005], mat(0x1e2125, { roughness: 0.9 }));
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      box(g, [0.04 * s, 0.04 * s, ctop - baseH - 0.08 * s], [sx * (cl / 2 - 0.1), cy + sy * 0.18 * s, baseH + (ctop - baseH - 0.08 * s) / 2], darkAlu);
    }
  }
  const work: THREE.Mesh[] = [];
  const workMat = mat(0xf28c28, { roughness: 0.5 });
  const nWork = 4;
  for (let i = 0; i < nWork; i++) {
    work.push(box(g, [0.2 * s, 0.2 * s, 0.15 * s], [0, cy, ctop + 0.01 + 0.075 * s], workMat));
  }

  // 多関節ロボット
  const robot = group(g, [-w * 0.12, d * 0.18, baseH]);
  robot.scale.setScalar(s);
  cyl(robot, 0.2, 0.25, [0, 0, 0.125], 'z', jointMat);
  const turret = group(robot, [0, 0, 0.25]);
  cyl(turret, 0.16, 0.2, [0, 0, 0.1], 'z', robotMat);
  const shoulder = group(turret, [0, 0, 0.2]);
  cyl(shoulder, 0.09, 0.26, [0, 0, 0], 'y', jointMat);
  box(shoulder, [0.14, 0.14, 0.75], [0, 0, 0.375], robotMat);
  const elbow = group(shoulder, [0, 0, 0.75]);
  cyl(elbow, 0.075, 0.22, [0, 0, 0], 'y', jointMat);
  box(elbow, [0.6, 0.11, 0.11], [0.3, 0, 0], robotMat);
  const wrist = group(elbow, [0.6, 0, 0]);
  cyl(wrist, 0.05, 0.12, [0.06, 0, 0], 'x', jointMat);
  box(wrist, [0.04, 0.12, 0.04], [0.14, 0, 0], jointMat);
  for (const sy of [-1, 1]) box(wrist, [0.08, 0.02, 0.04], [0.2, sy * 0.05, 0], alu);

  // プレス機
  const px = w * 0.3;
  const py = d * 0.15;
  const pressMat = mat(0x4d6b8a, { metalness: 0.4, roughness: 0.5 });
  box(g, [0.7 * s, 0.7 * s, 0.15 * s], [px, py, baseH + 0.075 * s], pressMat);
  for (const sx of [-1, 1]) box(g, [0.08 * s, 0.5 * s, 1.2 * s], [px + sx * 0.3 * s, py, baseH + 0.15 * s + 0.6 * s], pressMat);
  box(g, [0.7 * s, 0.5 * s, 0.25 * s], [px, py, baseH + 1.35 * s + 0.125 * s], pressMat);
  const ram = box(g, [0.45 * s, 0.4 * s, 0.2 * s], [px, py, 0], mat(0x9aa4ae, { metalness: 0.7, roughness: 0.3 }));

  // シグナルタワー（緑が点滅）
  const tx = w / 2 - 0.15;
  const ty = -d / 2 + 0.15;
  cyl(g, 0.015, 0.25, [tx, ty, h + 0.125], 'z', jointMat);
  cyl(g, 0.04, 0.07, [tx, ty, h + 0.29], 'z', mat(0xc62828, { roughness: 0.3 }));
  cyl(g, 0.04, 0.07, [tx, ty, h + 0.36], 'z', mat(0xf9a825, { roughness: 0.3 }));
  const greenLamp = new THREE.MeshStandardMaterial({ color: 0x2e7d32, emissive: 0x00ff44, emissiveIntensity: 1, roughness: 0.3 });
  greenLamp.userData.exportColor = 0x2e7d32;
  cyl(g, 0.04, 0.07, [tx, ty, h + 0.43], 'z', greenLamp);

  const animate: AnimateFn = (t) => {
    turret.rotation.z = Math.sin(t * 0.8) * 1.2;
    shoulder.rotation.y = 0.35 + Math.sin(t * 1.1) * 0.25;
    elbow.rotation.y = 0.6 + Math.sin(t * 1.3 + 1) * 0.35;
    wrist.rotation.x = t * 2;
    for (let i = 0; i < nWork; i++) {
      const u = (t * 0.12 + i / nWork) % 1;
      work[i].position.x = -cl / 2 + 0.1 + u * (cl - 0.2);
    }
    const stroke = Math.max(0, Math.sin(t * 2.2));
    ram.position.z = baseH + 1.25 * s - stroke * 0.55 * s;
    greenLamp.emissiveIntensity = Math.sin(t * 5) > 0 ? 1.2 : 0.1;
  };
  animate(0);
  g.userData.animate = animate;
  return g;
}

// ------------------------------------------------------------------ パレットフローラック（1列2段・ローラー1列）

function buildPalletFlowRack({ w, d, h }: Dims): THREE.Group {
  const g = new THREE.Group();
  const blue = mat(C.rackBlue, { metalness: 0.3, roughness: 0.5 });
  const brace = mat(C.braceBlue, { metalness: 0.3, roughness: 0.5 });
  const orange = mat(C.beamOrange, { metalness: 0.2, roughness: 0.5 });
  const galv = mat(C.galv, { metalness: 0.7, roughness: 0.35 });
  const red = mat(C.brakeRed, { roughness: 0.5 });
  const yellow = mat(C.yellow, { roughness: 0.5 });
  const wood = mat(C.wood, { roughness: 0.9 });
  const cardboard = mat(C.cardboard, { roughness: 0.9 });

  const pw = 0.1;
  const pd = 0.08;
  const levels = 2;
  const slope = 0.04; // 勾配 4%（奥=入庫側が高い）
  const firstZ = 0.25;
  const pitch = Math.max(0.6, (h - firstZ - 0.25) / levels);
  const postX = w / 2 - pw / 2;
  const nPosts = Math.max(2, Math.round(d / 2) + 1);
  const postYs = Array.from({ length: nPosts }, (_, k) => -d / 2 + pd / 2 + ((d - pd) * k) / (nPosts - 1));

  // 支柱・ベースプレート
  for (const sx of [-1, 1]) {
    for (const y of postYs) {
      box(g, [pw, pd, h], [sx * postX, y, h / 2], blue);
      box(g, [0.16, 0.14, 0.01], [sx * postX, y, 0.005], mat(0x595e66));
    }
  }
  // 側面のトラス
  const zs: number[] = [];
  for (let z = 0.15; z < h - 0.3; z += 1.2) zs.push(z);
  zs.push(h - 0.1);
  for (const sx of [-1, 1]) {
    for (let k = 0; k < nPosts - 1; k++) {
      const y0 = postYs[k] + pd / 2;
      const y1 = postYs[k + 1] - pd / 2;
      const span = y1 - y0;
      const ym = (y0 + y1) / 2;
      for (const z of zs) box(g, [0.03, span, 0.04], [sx * postX, ym, z], brace);
      for (let j = 0; j < zs.length - 1; j++) {
        const dz = zs[j + 1] - zs[j];
        const len = Math.hypot(span, dz);
        const ang = Math.atan2(dz, span) * (j % 2 === 0 ? 1 : -1);
        box(g, [0.03, len, 0.04], [sx * postX, ym, (zs[j] + zs[j + 1]) / 2], brace, [ang, 0, 0]);
      }
    }
  }

  const clear = 2 * postX - pw;
  const th = Math.atan(slope);
  const run = d / Math.cos(th);
  const rollerLen = Math.max(0.3, clear - 0.12);
  const railH = 0.07;
  const rollerTop = railH + 0.01;
  const palletW = Math.min(1.1, rollerLen + 0.05);
  const cargoH = Math.min(1.0, pitch - 0.45);

  for (let lv = 0; lv < levels; lv++) {
    const zl = firstZ + lv * pitch;
    for (const y of postYs) {
      const zt = zl + slope * (y + d / 2);
      box(g, [clear, 0.05, 0.12], [0, y, zt - 0.06], orange);
    }
    // 傾斜したレーン（ローカル Y=0 がピッキング側）
    const lane = group(g, [0, -d / 2, zl]);
    lane.rotation.x = th;
    for (const sx of [-1, 1]) box(lane, [0.012, run, railH], [sx * (rollerLen / 2 + 0.006), run / 2, railH / 2], galv);
    const rp = 0.1;
    const count = Math.floor((run - 0.06) / rp);
    const start = (run - (count - 1) * rp) / 2;
    let nextBrake = 1.25;
    for (let i = 0; i < count; i++) {
      const sPos = start + i * rp;
      if (sPos >= nextBrake && sPos < run - 0.4) {
        nextBrake += 1.25;
        cyl(lane, 0.04, rollerLen, [0, sPos, rollerTop - 0.04], 'x', red, true);
      } else {
        cyl(lane, 0.0243, rollerLen, [0, sPos, rollerTop - 0.0243], 'x', galv, true);
      }
    }
    // ストッパ・エントリーガイド
    box(lane, [rollerLen + 0.024, 0.02, 0.15], [0, 0.01, rollerTop + 0.06], yellow);
    for (const sx of [-1, 1]) box(lane, [0.01, 0.5, 0.1], [sx * (rollerLen / 2 + 0.03), run - 0.25, rollerTop + 0.06], yellow);
    // 積荷（パレット＋ケース）
    if (cargoH > 0.2) {
      const nPallet = Math.max(1, Math.floor((run - 0.1) / 1.25));
      for (let i = 0; i < Math.min(nPallet, 2); i++) {
        const sPos = 0.05 + 0.6 + i * 1.2;
        box(lane, [palletW, 1.1, 0.144], [0, sPos, rollerTop + 0.072], wood);
        box(lane, [palletW - 0.06, 1.04, cargoH], [0, sPos, rollerTop + 0.144 + cargoH / 2], cardboard);
      }
    }
  }
  // 頂部つなぎ梁
  for (const y of [postYs[0], postYs[nPosts - 1]]) box(g, [clear, 0.05, 0.1], [0, y, h - 0.05], orange);
  return g;
}

// ------------------------------------------------------------------ 在庫棚

function buildInventoryShelf({ w, d, h }: Dims): THREE.Group {
  const g = new THREE.Group();
  const post = mat(0x6f7a87, { metalness: 0.5, roughness: 0.5 });
  const shelf = mat(0xaab4be, { metalness: 0.4, roughness: 0.5 });
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) box(g, [0.04, 0.04, h], [sx * (w / 2 - 0.02), sy * (d / 2 - 0.02), h / 2], post);
  }
  const n = Math.max(2, Math.round(h / 0.45));
  const zs = Array.from({ length: n }, (_, i) => 0.1 + ((h - 0.15) * i) / (n - 1));
  for (const z of zs) box(g, [w, d, 0.025], [0, 0, z], shelf);
  // 背面 X ブレース
  const ang = Math.atan2(h, w);
  const len = Math.hypot(w, h);
  for (const sg of [1, -1]) box(g, [len, 0.01, 0.02], [0, d / 2 - 0.02, h / 2], post, [0, sg * ang, 0]);
  // 在庫ビン
  const colors = [0x2f6fd6, 0xe6b422, 0xd9534f, 0x3aa65a];
  for (let i = 0; i < n - 1; i++) {
    const gap = zs[i + 1] - zs[i];
    const bh = Math.min(0.3, gap - 0.08);
    if (bh < 0.05) continue;
    const nb = Math.max(1, Math.floor((w - 0.06) / 0.38));
    const slot = (w - 0.06) / nb;
    for (let j = 0; j < nb; j++) {
      if ((i * 7 + j * 3) % 5 === 0) continue;
      box(g, [slot - 0.03, d * 0.85, bh], [-w / 2 + 0.03 + (j + 0.5) * slot, 0, zs[i] + 0.0125 + bh / 2], mat(colors[i % colors.length], { roughness: 0.6 }));
    }
  }
  return g;
}

// ------------------------------------------------------------------ 完成品格納棚（パレットラック）

function buildFinishedGoodsRack({ w, d, h }: Dims): THREE.Group {
  const g = new THREE.Group();
  const green = mat(0x1f7a4a, { metalness: 0.3, roughness: 0.5 });
  const orange = mat(C.beamOrange, { metalness: 0.2, roughness: 0.5 });
  const wrap = mat(0xdce8f2, { roughness: 0.25, metalness: 0.05 });
  const wood = mat(C.wood, { roughness: 0.9 });
  const yellow = mat(C.yellow, { roughness: 0.5 });
  const label = mat(0xffffff, { roughness: 0.6 });

  const pw = 0.09;
  const pd = 0.07;
  const bays = Math.max(1, Math.round((w - 0.1) / 2.7));
  const bayW = (w - pw) / bays;
  const n = Math.max(2, Math.floor(h / 1.45));
  const beamZ = Array.from({ length: n }, (_, k) => (k * h) / n);
  const postYs = [-(d / 2 - pd / 2), d / 2 - pd / 2];

  for (let i = 0; i <= bays; i++) {
    const x = -w / 2 + pw / 2 + i * bayW;
    for (const y of postYs) box(g, [pw, pd, h], [x, y, h / 2], green);
    box(g, [0.15, 0.12, 0.4], [x, postYs[0] - 0.02, 0.2], yellow); // 支柱プロテクタ
    // 側面ブレース
    const span = d - 2 * pd;
    const zs: number[] = [];
    for (let z = 0.15; z < h - 0.3; z += 1.0) zs.push(z);
    zs.push(h - 0.1);
    for (const z of zs) box(g, [0.03, span, 0.035], [x, 0, z], green);
    for (let j = 0; j < zs.length - 1; j++) {
      const dz = zs[j + 1] - zs[j];
      const ang = Math.atan2(dz, span) * (j % 2 === 0 ? 1 : -1);
      box(g, [0.03, Math.hypot(span, dz), 0.035], [x, 0, (zs[j] + zs[j + 1]) / 2], green, [ang, 0, 0]);
    }
  }

  const levelH = h / n;
  const cargoH = Math.min(1.2, levelH - 0.35);
  for (let b = 0; b < bays; b++) {
    const bx = -w / 2 + pw / 2 + (b + 0.5) * bayW;
    const inner = bayW - pw;
    for (let k = 1; k < n; k++) {
      for (const y of postYs) box(g, [inner, 0.05, 0.12], [bx, y, beamZ[k] - 0.06], orange);
    }
    const pp = Math.max(1, Math.floor(inner / 1.2));
    const slot = inner / pp;
    const pW = Math.min(1.1, slot - 0.1);
    const pD = Math.min(1.1, d);
    if (cargoH < 0.2 || pW < 0.2) continue;
    for (let k = 0; k < n; k++) {
      const z0 = beamZ[k];
      for (let j = 0; j < pp; j++) {
        if ((b + k * 2 + j) % 4 === 3) continue;
        const px = bx - inner / 2 + (j + 0.5) * slot;
        box(g, [pW, pD, 0.144], [px, 0, z0 + 0.072], wood);
        box(g, [pW - 0.04, pD - 0.04, cargoH], [px, 0, z0 + 0.144 + cargoH / 2], wrap);
        box(g, [0.22, 0.004, 0.14], [px, -(pD - 0.04) / 2 - 0.002, z0 + 0.144 + cargoH * 0.6], label);
      }
    }
  }
  return g;
}

// ------------------------------------------------------------------ 薄型モニター

function makeDashboardTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 288;
  const ctx = cv.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#0d1b2a';
    ctx.fillRect(0, 0, 512, 288);
    ctx.fillStyle = '#4fc3f7';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText('LINE STATUS', 20, 40);
    ctx.fillStyle = '#90a4ae';
    ctx.font = '18px sans-serif';
    ctx.fillText('稼働率', 20, 85);
    ctx.fillText('生産数', 20, 135);
    ctx.fillText('不良率', 20, 185);
    ctx.fillStyle = '#e0f7fa';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText('94.2 %', 110, 88);
    ctx.fillText('1,284', 110, 138);
    ctx.fillText('0.3 %', 110, 188);
    const bars = [0.6, 0.8, 0.7, 0.95, 0.85, 0.9, 0.75];
    bars.forEach((v, i) => {
      ctx.fillStyle = v > 0.8 ? '#66bb6a' : '#ffa726';
      const bh = v * 170;
      ctx.fillRect(290 + i * 30, 250 - bh, 20, bh);
    });
    ctx.fillStyle = '#66bb6a';
    ctx.beginPath();
    ctx.arc(470, 32, 10, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildMonitor({ w, d, h }: Dims): THREE.Group {
  const g = new THREE.Group();
  const black = mat(0x16181b, { roughness: 0.4, metalness: 0.3 });
  const sh = (w * 9) / 16;
  box(g, [Math.min(0.8, w * 0.6), d, 0.04], [0, 0, 0.02], black);
  const poleTop = Math.max(0.1, h - sh * 0.5);
  box(g, [0.08, 0.06, poleTop], [0, 0.06, poleTop / 2], mat(0x50555c, { metalness: 0.6, roughness: 0.4 }));
  box(g, [w, 0.05, sh], [0, 0, h - sh / 2], black);
  const screenMat = new THREE.MeshBasicMaterial({ map: makeDashboardTexture() });
  screenMat.userData.exportColor = 0x1b2b44;
  const screen = new THREE.Mesh(unitPlane, screenMat);
  screen.scale.set(w - 0.04, sh - 0.04, 1);
  screen.rotation.x = Math.PI / 2; // 法線 -Y（正面）
  screen.position.set(0, -0.026, h - sh / 2);
  g.add(screen);
  return g;
}

// ------------------------------------------------------------------ 登録

export const PART_DEFS: readonly PartDef[] = [
  {
    type: 'workbench',
    label: '作業机',
    usdName: 'Workbench',
    dxfLayer: 'WORKBENCH',
    dxfColor: 30,
    description: '横長の作業台（背面パンチングボード・照明付き）',
    defaultDims: { w: 1.8, d: 0.75, h: 0.85 },
    minDims: { w: 0.5, d: 0.4, h: 0.5 },
    defaultZ: 0,
    build: buildWorkbench,
  },
  {
    type: 'automation_cell',
    label: '自動化機械ラインBOX',
    usdName: 'AutomationCell',
    dxfLayer: 'AUTOMATION_CELL',
    dxfColor: 4,
    description: 'スケルトンの直方体セル。内部でロボット・コンベヤ・プレスが動作',
    defaultDims: { w: 4.0, d: 2.0, h: 2.3 },
    minDims: { w: 1.0, d: 0.8, h: 1.0 },
    defaultZ: 0,
    build: buildAutomationCell,
  },
  {
    type: 'pallet_flow_rack',
    label: 'パレットフローラック',
    usdName: 'PalletFlowRack',
    dxfLayer: 'PALLET_FLOW_RACK',
    dxfColor: 5,
    description: '縦長の重力式ローラーラック。1列2段・ローラー1列',
    defaultDims: { w: 1.5, d: 4.0, h: 3.6 },
    minDims: { w: 0.6, d: 1.5, h: 1.5 },
    defaultZ: 0,
    build: buildPalletFlowRack,
  },
  {
    type: 'inventory_shelf',
    label: '在庫棚',
    usdName: 'InventoryShelf',
    dxfLayer: 'INVENTORY_SHELF',
    dxfColor: 3,
    description: '軽量スチール棚（部品ビン入り）',
    defaultDims: { w: 1.8, d: 0.6, h: 2.1 },
    minDims: { w: 0.4, d: 0.3, h: 0.6 },
    defaultZ: 0,
    build: buildInventoryShelf,
  },
  {
    type: 'finished_goods_rack',
    label: '完成品格納棚',
    usdName: 'FinishedGoodsRack',
    dxfLayer: 'FINISHED_GOODS_RACK',
    dxfColor: 6,
    description: 'パレットラック（ラップ梱包された完成品パレット）',
    defaultDims: { w: 2.8, d: 1.1, h: 4.5 },
    minDims: { w: 1.0, d: 0.6, h: 1.5 },
    defaultZ: 0,
    build: buildFinishedGoodsRack,
  },
  {
    type: 'monitor',
    label: '薄型モニター',
    usdName: 'Monitor',
    dxfLayer: 'MONITOR',
    dxfColor: 1,
    description: 'テレビ型の薄型モニター（スタンド付き、55インチ相当）',
    defaultDims: { w: 1.25, d: 0.5, h: 1.9 },
    minDims: { w: 0.3, d: 0.2, h: 0.5 },
    defaultZ: 0,
    build: buildMonitor,
  },
];

const defMap = new Map<PartType, PartDef>(PART_DEFS.map((d) => [d.type, d]));

export function getPartDef(type: PartType): PartDef {
  const def = defMap.get(type);
  if (!def) throw new Error(`未知のパーツ種別: ${type}`);
  return def;
}

export function isPartType(v: unknown): v is PartType {
  return typeof v === 'string' && defMap.has(v as PartType);
}
