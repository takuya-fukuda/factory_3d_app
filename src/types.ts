/**
 * 共通型定義。
 *
 * 座標系（Isaac Sim / USD に合わせる）:
 *   単位 m, Z-up
 *   X: 工場の幅方向, Y: 工場の長さ方向（縦長）, Z: 高さ
 *   原点は工場の床面の左手前の角。
 * 各パーツのローカル座標は「足元中心」が原点で、-Y 側が正面（作業者側・払出し側）。
 */

export type PartType =
  | 'workbench'
  | 'automation_cell'
  | 'pallet_flow_rack'
  | 'inventory_shelf'
  | 'finished_goods_rack'
  | 'monitor';

/** 外形寸法 (m)。w: ローカルX, d: ローカルY, h: 高さ */
export interface Dims {
  w: number;
  d: number;
  h: number;
}

export interface PlacedPart {
  id: string;
  type: PartType;
  name: string;
  /** 足元中心の位置 (m) */
  x: number;
  y: number;
  /** 設置高さ (m)。床置きは 0 */
  z: number;
  /** Z 軸まわりの回転 (度) */
  rotation: number;
  dims: Dims;
}

export interface FactorySpec {
  /** 幅 X (m) */
  width: number;
  /** 長さ Y (m) */
  length: number;
  /** 天井高さ Z (m) */
  height: number;
}

export interface LayoutDoc {
  format: 'factory-layout';
  version: 1;
  name: string;
  factory: FactorySpec;
  parts: PlacedPart[];
  savedAt?: string;
}

export type ViewKind = 'perspective' | 'top' | 'front' | 'side';
