# Factory Layout Editor

工場の 3D レイアウトを、間取り CAD のように「左のパーツをドラッグ&ドロップ」で作成するブラウザアプリ。
レイアウトは JSON で保存でき、**DXF**（CAD 用）と **USD**（Isaac Sim / Omniverse 用）にエクスポートできる。

- 技術: TypeScript + Three.js + Vite（サーバ不要、すべてブラウザ内で動作）
- 既定の工場: 幅 20 m × 長さ 60 m × 天井 12 m（縦長・高天井）。右パネルの「工場設定」で変更可能

## 起動

```bash
cd C:/Users/takuy/dev/factory/layout_editor
```

```bash
npm install
```

```bash
npm run dev
```

ブラウザで http://127.0.0.1:5180 を開く。配布用ビルドは `npm run build`（`dist/` に出力、静的ファイルとしてどこでも開ける）。

## パーツ

| パーツ | 既定寸法 W×D×H (m) | 内容 |
| --- | --- | --- |
| 作業机 | 1.8 × 0.75 × 0.85 | 横長の作業台。背面パンチングボード・照明付き（H は天板高さ） |
| 自動化機械ラインBOX | 4.0 × 2.0 × 2.3 | スケルトン（透明パネル）の直方体セル。内部でロボット・コンベヤ・プレスがアニメーション |
| パレットフローラック | 1.5 × 4.0 × 3.6 | 縦長の重力式ローラーラック。1 列 2 段、ローラー 1 列、勾配 4 %、ブレーキローラー（赤） |
| 在庫棚 | 1.8 × 0.6 × 2.1 | 軽量スチール棚、部品ビン入り |
| 完成品格納棚 | 2.8 × 1.1 × 4.5 | パレットラック、ラップ梱包された完成品パレット |
| 薄型モニター | 1.25 × 0.5 × 1.9 | 55 インチ相当のテレビ型モニター（スタンド付き） |

寸法は配置後に右パネルで変更でき、形状（段数・ローラー本数など）は寸法に合わせて再生成される。
各パーツは **-Y 側が正面**（作業者側・パレット払出し側）。

## 操作

| 操作 | 内容 |
| --- | --- |
| パーツをビューへドラッグ | 配置（ダブルクリックで画面中央に追加） |
| パーツを左ドラッグ | 床面上で移動（スナップは工場設定で変更） |
| 何もない所を左ドラッグ / 右ドラッグ / ホイール | 視点回転 / パン / ズーム |
| R / Shift+R | 選択パーツを 90° 回転 |
| Delete | 削除 |
| Ctrl+D | 複製 |
| Ctrl+Z / Ctrl+Y | 元に戻す / やり直し |
| Ctrl+S / Ctrl+Shift+S / Ctrl+O | 保存 / 別名保存 / 開く |
| F | 選択パーツにズーム |
| Esc | 選択解除 |

## 保存

- **保存**: レイアウトを `.json` に保存。Chrome / Edge では同じファイルへ上書き保存できる（File System Access API）。それ以外のブラウザではダウンロード。
- **自動保存**: 編集内容はブラウザの localStorage にも自動保存され、次回起動時に復元される。

## エクスポート

### DXF（AutoCAD R12 / ASCII, 単位 mm, Z-up）

| レイヤ | 内容 |
| --- | --- |
| `FACTORY` / `FACTORY_COLUMN` | 建屋の外形線・柱 |
| `FOOTPRINT` | 各パーツの平面外形（2D レイアウト図として使える） |
| `LABEL` | パーツ名（日本語は `\U+XXXX` 形式） |
| `WORKBENCH` など種別ごと | 3D 形状（3DFACE） |

互換性重視で R12 形式。FreeCAD 1.1 の DXF インポートで読み込めることを確認済み。

### USD（.usda, 単位 m, Z-up）

```
/Factory                  defaultPrim (kind=assembly)
  /Looks/Mat_XXX          UsdPreviewSurface
  /Building               Floor / Wall / Column / Beam（床はコリジョン付与可）
  /Parts/<Type>_NN        Xform（translate + rotateZ）、customData に partType / label / dims
      /Mesh_NN            マテリアル単位に結合したメッシュ
```

Isaac Sim の座標系（Z-up, m）に合わせているため、そのまま参照・配置できる。
オプションでパーツにも静的コリジョン（メッシュコライダ）を付与できる。

## 座標系

- 原点: 工場床面の左手前の角
- X: 幅方向 / Y: 長さ方向 / Z: 高さ
- 位置は各パーツの足元中心

## 構成

```
src/
  main.ts              画面の初期化・ツールバー・ショートカット・エクスポートダイアログ
  types.ts             共通型
  sample.ts            初回表示用のサンプルレイアウト
  scene/Editor.ts      3D シーン、選択・移動・D&D・Undo/Redo
  scene/building.ts    建屋（床・壁・柱・梁）
  parts/catalog.ts     パーツ定義と形状生成（パーツ追加はここに PartDef を足す）
  parts/builders.ts    形状生成ヘルパ
  io/layoutIO.ts       JSON 保存・読込（入力検証付き）、自動保存
  io/exportDxf.ts      DXF 出力
  io/exportUsd.ts      USD 出力
  io/meshCollect.ts    メッシュ集約（出力共通）
  ui/palette.ts        左パネル（サムネイルは実モデルを描画して生成）
  ui/inspector.ts      右パネル（プロパティ・工場設定・配置一覧）
```

## パーツの追加方法

1. `src/types.ts` の `PartType` に種別を追加
2. `src/parts/catalog.ts` に形状生成関数を書き、`PART_DEFS` に登録

パレット・保存・DXF/USD 出力には自動的に反映される。
