/** 初回起動時に表示するサンプルレイアウト（幅20m × 長さ60m × 高さ12m の縦長工場） */
import { getPartDef } from './parts/catalog';
import type { LayoutDoc, PartType, PlacedPart } from './types';

let seq = 0;
function p(type: PartType, name: string, x: number, y: number, rotation = 0): PlacedPart {
  const def = getPartDef(type);
  seq += 1;
  return { id: `sample-${seq}`, type, name, x, y, z: def.defaultZ, rotation, dims: { ...def.defaultDims } };
}

export function sampleLayout(): LayoutDoc {
  seq = 0;
  return {
    format: 'factory-layout',
    version: 1,
    name: 'サンプル工場',
    factory: { width: 20, length: 60, height: 12 },
    parts: [
      // 入荷・在庫エリア（手前）
      p('inventory_shelf', '在庫棚 1', 1.0, 4, 90),
      p('inventory_shelf', '在庫棚 2', 1.0, 6, 90),
      p('inventory_shelf', '在庫棚 3', 1.0, 8, 90),
      p('inventory_shelf', '在庫棚 4', 1.0, 10, 90),
      p('pallet_flow_rack', 'パレットフローラック 1', 5.0, 6),
      p('pallet_flow_rack', 'パレットフローラック 2', 6.6, 6),
      p('pallet_flow_rack', 'パレットフローラック 3', 8.2, 6),
      // 加工ライン（中央）
      p('automation_cell', '自動化機械ラインBOX 1', 10, 20),
      p('automation_cell', '自動化機械ラインBOX 2', 10, 26),
      p('automation_cell', '自動化機械ラインBOX 3', 10, 32),
      p('workbench', '作業机 1', 15.5, 20, 90),
      p('workbench', '作業机 2', 15.5, 26, 90),
      p('workbench', '作業机 3', 15.5, 32, 90),
      p('monitor', '薄型モニター 1', 13.5, 16, 0),
      // 完成品エリア（奥）
      p('finished_goods_rack', '完成品格納棚 1', 4, 54),
      p('finished_goods_rack', '完成品格納棚 2', 7, 54),
      p('finished_goods_rack', '完成品格納棚 3', 10, 54),
      p('finished_goods_rack', '完成品格納棚 4', 13, 54),
    ],
  };
}
