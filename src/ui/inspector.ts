/**
 * 右側のプロパティパネル（選択パーツ / 工場設定）と配置済みパーツ一覧。
 */
import { getPartDef } from '../parts/catalog';
import type { Editor } from '../scene/Editor';
import type { PlacedPart } from '../types';

type NumKey = 'x' | 'y' | 'z' | 'rotation' | 'w' | 'd' | 'h';

function numRow(label: string, key: string, step: number, unit: string): string {
  return `<label for="pf-${key}">${label}</label>
    <div class="unit-wrap"><input id="pf-${key}" data-key="${key}" type="number" step="${step}" /><span class="unit">${unit}</span></div>`;
}

function setVal(el: HTMLInputElement | HTMLSelectElement | null, v: string): void {
  if (el && document.activeElement !== el) el.value = v;
}

function fmt(v: number): string {
  return String(Math.round(v * 1000) / 1000);
}

export function initInspector(editor: Editor, propsEl: HTMLElement, listEl: HTMLElement, countEl: HTMLElement): void {
  let mode = '';

  const q = <T extends HTMLElement>(sel: string): T | null => propsEl.querySelector<T>(sel);

  function buildPartForm(p: PlacedPart): void {
    const def = getPartDef(p.type);
    propsEl.innerHTML = `
      <h2>プロパティ</h2>
      <div class="prop-type">${def.label}</div>
      <div class="prop-grid">
        <label for="pf-name">名称</label><input id="pf-name" type="text" maxlength="100" />
        <div class="prop-sub">位置（足元中心）</div>
        ${numRow('X', 'x', 0.1, 'm')}
        ${numRow('Y', 'y', 0.1, 'm')}
        ${numRow('設置高さ', 'z', 0.1, 'm')}
        ${numRow('回転', 'rotation', 15, '°')}
        <div class="prop-sub">寸法</div>
        ${numRow('幅 W', 'w', 0.05, 'm')}
        ${numRow('奥行 D', 'd', 0.05, 'm')}
        ${numRow('高さ H', 'h', 0.05, 'm')}
      </div>
      <div class="prop-buttons">
        <button data-act="rotL">⟲ 90°</button>
        <button data-act="rotR">⟳ 90°</button>
        <button data-act="dup">複製</button>
        <button data-act="focus">ズーム</button>
        <button data-act="reset">寸法リセット</button>
        <button data-act="del" class="danger">削除</button>
      </div>`;
    const nameEl = q<HTMLInputElement>('#pf-name');
    nameEl?.addEventListener('change', () => {
      const cur = editor.getSelected();
      if (cur && nameEl.value.trim()) editor.updatePart(cur.id, { name: nameEl.value.trim() });
    });
    propsEl.querySelectorAll<HTMLInputElement>('input[data-key]').forEach((inp) => {
      inp.addEventListener('change', () => {
        const cur = editor.getSelected();
        const v = Number(inp.value);
        if (!cur || !Number.isFinite(v)) return;
        const key = inp.dataset.key as NumKey;
        if (key === 'w' || key === 'd' || key === 'h') editor.updatePart(cur.id, { dims: { ...cur.dims, [key]: v } });
        else editor.updatePart(cur.id, { [key]: v });
      });
    });
    propsEl.querySelectorAll<HTMLButtonElement>('button[data-act]').forEach((b) => {
      b.addEventListener('click', () => {
        const cur = editor.getSelected();
        if (!cur) return;
        switch (b.dataset.act) {
          case 'rotL':
            editor.rotateSelected(90);
            break;
          case 'rotR':
            editor.rotateSelected(-90);
            break;
          case 'dup':
            editor.duplicatePart(cur.id);
            break;
          case 'focus':
            editor.focusPart(cur.id);
            break;
          case 'reset':
            editor.updatePart(cur.id, { dims: { ...getPartDef(cur.type).defaultDims } });
            break;
          case 'del':
            editor.removePart(cur.id);
            break;
        }
      });
    });
  }

  function fillPartForm(p: PlacedPart): void {
    setVal(q<HTMLInputElement>('#pf-name'), p.name);
    const vals: Record<NumKey, number> = { x: p.x, y: p.y, z: p.z, rotation: p.rotation, ...p.dims };
    (Object.keys(vals) as NumKey[]).forEach((k) => setVal(q<HTMLInputElement>(`#pf-${k}`), fmt(vals[k])));
  }

  function buildFactoryForm(): void {
    propsEl.innerHTML = `
      <h2>工場設定</h2>
      <div class="prop-grid">
        ${numRow('幅 (X)', 'fw', 1, 'm')}
        ${numRow('長さ (Y)', 'fl', 1, 'm')}
        ${numRow('天井高さ', 'fh', 0.5, 'm')}
        <div class="prop-sub">編集</div>
        <label for="pf-snap">スナップ</label>
        <select id="pf-snap">
          <option value="0">なし</option>
          <option value="0.05">0.05 m</option>
          <option value="0.1">0.1 m</option>
          <option value="0.25">0.25 m</option>
          <option value="0.5">0.5 m</option>
          <option value="1">1 m</option>
        </select>
      </div>
      <p class="hint" style="margin-top:12px">パーツをクリックすると、ここで位置・回転・寸法を編集できます。</p>`;
    const apply = (): void => {
      const w = Number(q<HTMLInputElement>('#pf-fw')?.value);
      const l = Number(q<HTMLInputElement>('#pf-fl')?.value);
      const h = Number(q<HTMLInputElement>('#pf-fh')?.value);
      if ([w, l, h].every((v) => Number.isFinite(v) && v >= 2)) {
        editor.setFactory({ width: Math.min(w, 1000), length: Math.min(l, 1000), height: Math.min(h, 200) });
      }
    };
    ['#pf-fw', '#pf-fl', '#pf-fh'].forEach((s) => q<HTMLInputElement>(s)?.addEventListener('change', apply));
    const snap = q<HTMLSelectElement>('#pf-snap');
    snap?.addEventListener('change', () => {
      editor.snap = Number(snap.value);
    });
  }

  function fillFactoryForm(): void {
    setVal(q<HTMLInputElement>('#pf-fw'), fmt(editor.factory.width));
    setVal(q<HTMLInputElement>('#pf-fl'), fmt(editor.factory.length));
    setVal(q<HTMLInputElement>('#pf-fh'), fmt(editor.factory.height));
    setVal(q<HTMLSelectElement>('#pf-snap'), String(editor.snap));
  }

  function renderProps(): void {
    const sel = editor.getSelected();
    const next = sel ? `part:${sel.id}` : 'factory';
    if (next !== mode) {
      mode = next;
      if (sel) buildPartForm(sel);
      else buildFactoryForm();
    }
    if (sel) fillPartForm(sel);
    else fillFactoryForm();
  }

  function renderList(): void {
    const parts = editor.listParts();
    countEl.textContent = `(${parts.length})`;
    const selId = editor.selectedPartId;
    listEl.replaceChildren(
      ...parts.map((p) => {
        const li = document.createElement('li');
        li.classList.toggle('selected', p.id === selId);
        const nm = document.createElement('span');
        nm.textContent = p.name;
        const pos = document.createElement('span');
        pos.className = 'ol-pos';
        pos.textContent = `${p.x.toFixed(1)}, ${p.y.toFixed(1)}`;
        li.append(nm, pos);
        li.dataset.id = p.id;
        return li;
      }),
    );
  }

  // 一覧は再描画されるため、クリックは親要素で委譲して受ける
  const idOf = (e: Event): string | undefined => (e.target as HTMLElement).closest<HTMLLIElement>('li[data-id]')?.dataset.id;
  listEl.addEventListener('click', (e) => {
    const id = idOf(e);
    if (id) editor.select(id);
  });
  listEl.addEventListener('dblclick', (e) => {
    const id = idOf(e);
    if (id) editor.focusPart(id);
  });

  editor.on('select', () => {
    renderProps();
    renderList();
  });
  editor.on('change', () => {
    renderProps();
    renderList();
  });
  renderProps();
  renderList();
}
