/**
 * レイアウトの保存・読込（JSON）とブラウザ内自動保存。
 * 読み込む JSON は外部入力として扱い、型と値域を検証してから使う。
 */
import { getPartDef, isPartType } from '../parts/catalog';
import type { Dims, FactorySpec, LayoutDoc, PlacedPart } from '../types';

const AUTOSAVE_KEY = 'factory-layout-editor:autosave';
const MAX_PARTS = 5000;

function num(v: unknown, field: string, lo: number, hi: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${field} が数値ではありません`);
  return Math.min(hi, Math.max(lo, v));
}

function text(v: unknown, field: string, maxLen = 200): string {
  if (typeof v !== 'string') throw new Error(`${field} が文字列ではありません`);
  return v.slice(0, maxLen);
}

function obj(v: unknown, field: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`${field} がオブジェクトではありません`);
  return v as Record<string, unknown>;
}

export function validateLayout(raw: unknown): LayoutDoc {
  const r = obj(raw, 'ルート');
  if (r.format !== 'factory-layout') throw new Error('Factory Layout Editor のファイルではありません');
  if (r.version !== 1) throw new Error(`未対応のバージョンです: ${String(r.version)}`);
  const fr = obj(r.factory, 'factory');
  const factory: FactorySpec = {
    width: num(fr.width, 'factory.width', 2, 1000),
    length: num(fr.length, 'factory.length', 2, 1000),
    height: num(fr.height, 'factory.height', 2, 200),
  };
  if (!Array.isArray(r.parts)) throw new Error('parts が配列ではありません');
  if (r.parts.length > MAX_PARTS) throw new Error(`パーツ数が多すぎます（上限 ${MAX_PARTS}）`);
  const ids = new Set<string>();
  const parts: PlacedPart[] = r.parts.map((pv: unknown, i: number): PlacedPart => {
    const p = obj(pv, `parts[${i}]`);
    if (!isPartType(p.type)) throw new Error(`parts[${i}].type が不正です: ${String(p.type)}`);
    const def = getPartDef(p.type);
    const dr = obj(p.dims, `parts[${i}].dims`);
    const dims: Dims = {
      w: num(dr.w, `parts[${i}].dims.w`, def.minDims.w, 50),
      d: num(dr.d, `parts[${i}].dims.d`, def.minDims.d, 50),
      h: num(dr.h, `parts[${i}].dims.h`, def.minDims.h, 50),
    };
    let id = typeof p.id === 'string' && p.id.length > 0 ? p.id.slice(0, 64) : `p-${i}`;
    while (ids.has(id)) id = `${id}-dup`;
    ids.add(id);
    return {
      id,
      type: p.type,
      name: text(p.name, `parts[${i}].name`, 100),
      x: num(p.x, `parts[${i}].x`, 0, factory.width),
      y: num(p.y, `parts[${i}].y`, 0, factory.length),
      z: num(p.z, `parts[${i}].z`, 0, factory.height),
      rotation: num(p.rotation, `parts[${i}].rotation`, -36000, 36000),
      dims,
    };
  });
  return {
    format: 'factory-layout',
    version: 1,
    name: typeof r.name === 'string' ? r.name.slice(0, 100) : '無題',
    factory,
    parts,
  };
}

export function parseLayout(json: string): LayoutDoc {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error('JSON として読み込めませんでした');
  }
  return validateLayout(raw);
}

export function stringifyLayout(doc: LayoutDoc): string {
  return JSON.stringify({ ...doc, savedAt: new Date().toISOString() }, null, 2);
}

// ------------------------------------------------------------ 自動保存（ブラウザ内）

export function autosave(doc: LayoutDoc): void {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(doc));
  } catch {
    // ストレージ不可（プライベートモード等）は無視
  }
}

export function loadAutosave(): LayoutDoc | null {
  try {
    const s = localStorage.getItem(AUTOSAVE_KEY);
    return s ? parseLayout(s) : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------ ファイル保存・読込

let currentHandle: FileSystemFileHandle | null = null;

const JSON_TYPES = [{ description: '工場レイアウト (JSON)', accept: { 'application/json': ['.json'] } }];

export function safeFileName(name: string): string {
  const s = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim();
  return s.length > 0 ? s.slice(0, 80) : 'layout';
}

export function downloadText(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}

/**
 * レイアウトをファイルに保存する。
 * File System Access API が使える場合は同じファイルへ上書き保存、使えない場合はダウンロード。
 * @returns 保存したファイル名。キャンセル時は null
 */
export async function saveLayoutFile(doc: LayoutDoc, saveAs: boolean): Promise<string | null> {
  const content = stringifyLayout(doc);
  const suggested = `${safeFileName(doc.name)}.json`;
  if (window.showSaveFilePicker) {
    try {
      if (!currentHandle || saveAs) {
        currentHandle = await window.showSaveFilePicker({ suggestedName: suggested, types: JSON_TYPES });
      }
      const w = await currentHandle.createWritable();
      await w.write(content);
      await w.close();
      return currentHandle.name;
    } catch (e) {
      if (isAbort(e)) return null;
      // API が使えない環境（埋め込みブラウザ等）はダウンロードにフォールバック
    }
  }
  downloadText(suggested, content, 'application/json');
  return suggested;
}

export async function openLayoutFile(): Promise<LayoutDoc | null> {
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({ types: JSON_TYPES, multiple: false });
      const file = await handle.getFile();
      const doc = parseLayout(await file.text());
      currentHandle = handle;
      return doc;
    } catch (e) {
      if (isAbort(e)) return null;
      if (e instanceof Error && !(e instanceof DOMException)) throw e;
    }
  }
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        currentHandle = null;
        resolve(parseLayout(await file.text()));
      } catch (err) {
        reject(err);
      }
    };
    input.click();
  });
}

export function resetFileHandle(): void {
  currentHandle = null;
}
