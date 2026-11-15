import './style.css';
import { Editor } from './scene/Editor';
import { initPalette } from './ui/palette';
import { initInspector } from './ui/inspector';
import { autosave, downloadText, loadAutosave, openLayoutFile, resetFileHandle, safeFileName, saveLayoutFile } from './io/layoutIO';
import { exportDxf } from './io/exportDxf';
import { exportUsd } from './io/exportUsd';
import { sampleLayout } from './sample';
import type { ViewKind } from './types';

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} が見つかりません`);
  return el;
}

// ------------------------------------------------------------ トースト

const toastEl = $('toast');
let toastTimer = 0;
function toast(msg: string, error = false): void {
  toastEl.textContent = msg;
  toastEl.classList.toggle('error', error);
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), error ? 5000 : 2200);
}

// ------------------------------------------------------------ 初期化

const editor = new Editor($('viewport'));
initPalette(editor, $('partList'));
initInspector(editor, $('props'), $('objectList'), $('partCount'));

const docName = $('docName') as HTMLInputElement;
docName.addEventListener('change', () => editor.setName(docName.value.trim() || '無題'));

const statusEl = $('status');
function updateStatus(): void {
  const c = editor.cursor;
  const f = editor.factory;
  const pos = c ? `X ${c.x.toFixed(2)}  Y ${c.y.toFixed(2)} m` : 'X -  Y -';
  statusEl.textContent = `${pos}   |   工場 ${f.width} × ${f.length} × H${f.height} m   |   スナップ ${editor.snap || 'なし'}`;
}
editor.on('cursor', updateStatus);

let saveTimer = 0;
editor.on('change', () => {
  if (document.activeElement !== docName) docName.value = editor.name;
  updateStatus();
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => autosave(editor.toDoc()), 400);
});

const restored = loadAutosave();
editor.loadDoc(restored ?? sampleLayout(), false);
if (restored) toast('前回の作業内容を復元しました');

// ------------------------------------------------------------ ファイル操作

async function doSave(saveAs: boolean): Promise<void> {
  try {
    const name = await saveLayoutFile(editor.toDoc(), saveAs);
    if (name) toast(`保存しました: ${name}`);
  } catch (e) {
    toast(`保存に失敗しました: ${(e as Error).message}`, true);
  }
}

async function doOpen(): Promise<void> {
  try {
    const doc = await openLayoutFile();
    if (doc) {
      editor.loadDoc(doc);
      toast(`読み込みました: ${doc.name}`);
    }
  } catch (e) {
    toast(`読み込みに失敗しました: ${(e as Error).message}`, true);
  }
}

function doNew(): void {
  if (editor.listParts().length > 0 && !confirm('現在のレイアウトを破棄して新規作成しますか？（元に戻す で復帰できます）')) return;
  resetFileHandle();
  editor.newDoc({ ...editor.factory });
}

// ------------------------------------------------------------ エクスポート

const dlg = $('exportDialog') as HTMLDialogElement;
const form = dlg.querySelector('form') as HTMLFormElement;
function syncExportFieldsets(): void {
  const fmt = (form.elements.namedItem('format') as RadioNodeList).value;
  form.querySelectorAll<HTMLFieldSetElement>('fieldset[data-for]').forEach((fs) => {
    fs.hidden = fs.dataset.for !== fmt;
  });
}
form.addEventListener('change', syncExportFieldsets);

function checked(name: string): boolean {
  return (form.elements.namedItem(name) as HTMLInputElement).checked;
}

dlg.addEventListener('close', () => {
  if (dlg.returnValue !== 'ok') return;
  const fmt = (form.elements.namedItem('format') as RadioNodeList).value;
  const base = safeFileName(editor.name);
  try {
    if (fmt === 'dxf') {
      const txt = exportDxf(editor.factory, editor.partObjects(), {
        include3D: checked('dxf3d'),
        includeFootprint: checked('dxfFoot'),
        includeBuilding: checked('building'),
        includeGlass: checked('dxfGlass'),
      });
      downloadText(`${base}.dxf`, txt, 'application/dxf');
      toast(`DXF を出力しました: ${base}.dxf`);
    } else {
      const txt = exportUsd(editor.name, editor.factory, editor.getBuilding(), editor.partObjects(), {
        includeBuilding: checked('building'),
        floorCollision: checked('usdFloor'),
        partCollision: checked('usdParts'),
      });
      downloadText(`${base}.usda`, txt, 'text/plain');
      toast(`USD を出力しました: ${base}.usda`);
    }
  } catch (e) {
    toast(`エクスポートに失敗しました: ${(e as Error).message}`, true);
  }
});

function openExport(): void {
  syncExportFieldsets();
  dlg.returnValue = '';
  dlg.showModal();
}

// ------------------------------------------------------------ ツールバー

const actions: Record<string, () => void> = {
  new: doNew,
  open: () => void doOpen(),
  save: () => void doSave(false),
  saveAs: () => void doSave(true),
  undo: () => editor.undo(),
  redo: () => editor.redo(),
  export: openExport,
};
document.querySelectorAll<HTMLButtonElement>('#toolbar button[data-action]').forEach((b) => {
  b.addEventListener('click', () => actions[b.dataset.action ?? '']?.());
});
document.querySelectorAll<HTMLButtonElement>('#toolbar button[data-view]').forEach((b) => {
  b.addEventListener('click', () => editor.setView(b.dataset.view as ViewKind));
});
const labelToggle = $('toggleLabels') as HTMLInputElement;
labelToggle.addEventListener('change', () => editor.setLabelsVisible(labelToggle.checked));

// ------------------------------------------------------------ キーボード

window.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement;
  const typing = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';
  const ctrl = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  if (ctrl && key === 's') {
    e.preventDefault();
    void doSave(e.shiftKey);
    return;
  }
  if (ctrl && key === 'o') {
    e.preventDefault();
    void doOpen();
    return;
  }
  if (typing || dlg.open) return;
  const sel = editor.getSelected();
  if (ctrl && key === 'z') {
    e.preventDefault();
    if (e.shiftKey) editor.redo();
    else editor.undo();
  } else if (ctrl && key === 'y') {
    e.preventDefault();
    editor.redo();
  } else if (ctrl && key === 'd') {
    e.preventDefault();
    if (sel) editor.duplicatePart(sel.id);
  } else if (key === 'r' && sel) {
    editor.rotateSelected(e.shiftKey ? -90 : 90);
  } else if ((key === 'delete' || key === 'backspace') && sel) {
    e.preventDefault();
    editor.removePart(sel.id);
  } else if (key === 'escape') {
    editor.select(null);
  } else if (key === 'f' && sel) {
    editor.focusPart(sel.id);
  }
});

updateStatus();

// 開発時のみ: ブラウザのコンソールから動作確認できるように公開
if (import.meta.env.DEV) {
  Object.assign(window, { __factory: { editor, exportDxf, exportUsd } });
}
