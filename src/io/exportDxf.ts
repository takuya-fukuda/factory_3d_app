/**
 * DXF (AutoCAD R12 / AC1009 ASCII) 出力。
 * 互換性を優先して R12 形式を採用（AutoCAD / BricsCAD / LibreCAD / FreeCAD で読める）。
 * 単位は mm、Z-up（工場座標そのまま）。
 *
 * レイヤ構成:
 *   FACTORY           建屋の外形線（床・天井の輪郭、隅の縦線）
 *   FACTORY_COLUMN    柱の平面形状
 *   FOOTPRINT         各パーツの平面外形（閉じたポリライン, Z=0）
 *   LABEL             パーツ名の文字
 *   <パーツ種別>       各パーツの 3D 形状（3DFACE）
 */
import * as THREE from 'three';
import { getPartDef, PART_DEFS } from '../parts/catalog';
import { columnPositions } from '../scene/building';
import type { FactorySpec, PlacedPart } from '../types';
import { collectChunks } from './meshCollect';

export interface DxfOptions {
  include3D: boolean;
  includeFootprint: boolean;
  includeBuilding: boolean;
  /** 透明パネル（スケルトンのガラス）を 3D 形状に含める */
  includeGlass: boolean;
}

const MM = 1000;

function n(v: number): string {
  const r = Math.round(v * MM * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
}

/** 非 ASCII 文字を AutoCAD の \U+XXXX 形式に変換 */
function dxfText(s: string): string {
  let out = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 63;
    if (cp < 128) out += ch;
    else if (cp <= 0xffff) out += `\\U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
    else out += '?';
  }
  return out;
}

class DxfWriter {
  private out: string[] = [];

  pair(code: number, value: string | number): void {
    this.out.push(String(code), String(value));
  }

  face(layer: string, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): void {
    this.pair(0, '3DFACE');
    this.pair(8, layer);
    const pts = [a, b, c, c];
    pts.forEach((p, i) => {
      this.pair(10 + i, n(p.x));
      this.pair(20 + i, n(p.y));
      this.pair(30 + i, n(p.z));
    });
  }

  line(layer: string, a: [number, number, number], b: [number, number, number]): void {
    this.pair(0, 'LINE');
    this.pair(8, layer);
    this.pair(10, n(a[0]));
    this.pair(20, n(a[1]));
    this.pair(30, n(a[2]));
    this.pair(11, n(b[0]));
    this.pair(21, n(b[1]));
    this.pair(31, n(b[2]));
  }

  polyline(layer: string, pts: Array<[number, number]>, z: number, closed = true): void {
    this.pair(0, 'POLYLINE');
    this.pair(8, layer);
    this.pair(66, 1);
    this.pair(70, closed ? 1 : 0);
    this.pair(10, 0);
    this.pair(20, 0);
    this.pair(30, n(z));
    for (const [x, y] of pts) {
      this.pair(0, 'VERTEX');
      this.pair(8, layer);
      this.pair(10, n(x));
      this.pair(20, n(y));
      this.pair(30, n(z));
    }
    this.pair(0, 'SEQEND');
    this.pair(8, layer);
  }

  text(layer: string, x: number, y: number, z: number, height: number, s: string, rotDeg = 0): void {
    this.pair(0, 'TEXT');
    this.pair(8, layer);
    this.pair(10, n(x));
    this.pair(20, n(y));
    this.pair(30, n(z));
    this.pair(40, n(height));
    this.pair(1, dxfText(s));
    if (rotDeg) this.pair(50, rotDeg.toFixed(3));
  }

  toString(): string {
    return this.out.join('\r\n') + '\r\n';
  }
}

function footprint(p: PlacedPart): Array<[number, number]> {
  const r = THREE.MathUtils.degToRad(p.rotation);
  const c = Math.cos(r);
  const s = Math.sin(r);
  const hw = p.dims.w / 2;
  const hd = p.dims.d / 2;
  const local: Array<[number, number]> = [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ];
  return local.map(([x, y]) => [p.x + x * c - y * s, p.y + x * s + y * c]);
}

export function exportDxf(
  factory: FactorySpec,
  parts: Array<{ data: PlacedPart; obj: THREE.Object3D }>,
  opts: DxfOptions,
): string {
  const ent = new DxfWriter();
  const ident = new THREE.Matrix4();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();

  // 建屋
  if (opts.includeBuilding) {
    const { width: W, length: L, height: H } = factory;
    const rect: Array<[number, number]> = [
      [0, 0],
      [W, 0],
      [W, L],
      [0, L],
    ];
    ent.polyline('FACTORY', rect, 0);
    ent.polyline('FACTORY', rect, H);
    for (const [x, y] of rect) ent.line('FACTORY', [x, y, 0], [x, y, H]);
    for (const [x, y] of columnPositions(factory)) {
      ent.polyline('FACTORY_COLUMN', [
        [x - 0.2, y - 0.2],
        [x + 0.2, y - 0.2],
        [x + 0.2, y + 0.2],
        [x - 0.2, y + 0.2],
      ], 0);
    }
  }

  for (const { data, obj } of parts) {
    const def = getPartDef(data.type);
    if (opts.includeFootprint) {
      ent.polyline('FOOTPRINT', footprint(data), 0);
      const th = Math.max(0.15, Math.min(0.4, Math.min(data.dims.w, data.dims.d) * 0.25));
      ent.text('LABEL', data.x - data.name.length * th * 0.4, data.y, 0, th, data.name);
    }
    if (opts.include3D) {
      for (const ch of collectChunks(obj, ident)) {
        if (ch.glass && !opts.includeGlass) continue;
        const P = ch.positions;
        const I = ch.indices;
        for (let i = 0; i < I.length; i += 3) {
          a.fromArray(P, I[i] * 3);
          b.fromArray(P, I[i + 1] * 3);
          c.fromArray(P, I[i + 2] * 3);
          ent.face(def.dxfLayer, a, b, c);
        }
      }
    }
  }

  // ヘッダ・テーブル
  const w = new DxfWriter();
  w.pair(0, 'SECTION');
  w.pair(2, 'HEADER');
  w.pair(9, '$ACADVER');
  w.pair(1, 'AC1009');
  w.pair(9, '$EXTMIN');
  w.pair(10, 0);
  w.pair(20, 0);
  w.pair(30, 0);
  w.pair(9, '$EXTMAX');
  w.pair(10, n(factory.width));
  w.pair(20, n(factory.length));
  w.pair(30, n(factory.height));
  w.pair(0, 'ENDSEC');

  const layers: Array<[string, number]> = [
    ['0', 7],
    ['FACTORY', 8],
    ['FACTORY_COLUMN', 8],
    ['FOOTPRINT', 7],
    ['LABEL', 7],
    ...PART_DEFS.map((d): [string, number] => [d.dxfLayer, d.dxfColor]),
  ];
  w.pair(0, 'SECTION');
  w.pair(2, 'TABLES');
  w.pair(0, 'TABLE');
  w.pair(2, 'LTYPE');
  w.pair(70, 1);
  w.pair(0, 'LTYPE');
  w.pair(2, 'CONTINUOUS');
  w.pair(70, 0);
  w.pair(3, 'Solid line');
  w.pair(72, 65);
  w.pair(73, 0);
  w.pair(40, '0.0');
  w.pair(0, 'ENDTAB');
  w.pair(0, 'TABLE');
  w.pair(2, 'LAYER');
  w.pair(70, layers.length);
  for (const [name, color] of layers) {
    w.pair(0, 'LAYER');
    w.pair(2, name);
    w.pair(70, 0);
    w.pair(62, color);
    w.pair(6, 'CONTINUOUS');
  }
  w.pair(0, 'ENDTAB');
  w.pair(0, 'ENDSEC');
  w.pair(0, 'SECTION');
  w.pair(2, 'ENTITIES');

  const tail = new DxfWriter();
  tail.pair(0, 'ENDSEC');
  tail.pair(0, 'EOF');
  return w.toString() + ent.toString() + tail.toString();
}
