/**
 * 左側のパーツパレット。サムネイルは実際の 3D モデルをオフスクリーン描画して生成する。
 */
import * as THREE from 'three';
import { PART_DEFS, type PartDef } from '../parts/catalog';
import { disposeUnique } from '../parts/builders';
import type { Editor } from '../scene/Editor';

function renderThumbnails(defs: readonly PartDef[], w: number, h: number): Map<string, string> {
  const out = new Map<string, string>();
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(2);
  renderer.setSize(w, h, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(3, -5, 6);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(30, w / h, 0.01, 200);
  camera.up.set(0, 0, 1);
  const dir = new THREE.Vector3(1.0, -1.4, 0.9).normalize();
  for (const def of defs) {
    const obj = def.build(def.defaultDims);
    const anim = obj.userData.animate as ((t: number) => void) | undefined;
    anim?.(1.3);
    scene.add(obj);
    const bb = new THREE.Box3().setFromObject(obj);
    const c = bb.getCenter(new THREE.Vector3());
    const r = bb.getSize(new THREE.Vector3()).length() / 2;
    const dist = r / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.85;
    camera.position.copy(c).addScaledVector(dir, dist);
    camera.lookAt(c);
    renderer.render(scene, camera);
    out.set(def.type, renderer.domElement.toDataURL('image/png'));
    scene.remove(obj);
    disposeUnique(obj);
  }
  renderer.dispose();
  renderer.forceContextLoss();
  return out;
}

export function initPalette(editor: Editor, listEl: HTMLElement): void {
  let thumbs = new Map<string, string>();
  try {
    thumbs = renderThumbnails(PART_DEFS, 144, 108);
  } catch {
    // WebGL が使えない場合はサムネイルなし
  }
  for (const def of PART_DEFS) {
    const card = document.createElement('div');
    card.className = 'part-card';
    card.draggable = true;
    card.title = `${def.label}\n${def.description}`;
    const img = document.createElement('img');
    img.alt = def.label;
    img.draggable = false;
    const src = thumbs.get(def.type);
    if (src) img.src = src;
    const info = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'pc-name';
    name.textContent = def.label;
    const dims = document.createElement('div');
    dims.className = 'pc-dims';
    const d = def.defaultDims;
    dims.textContent = `W${d.w} × D${d.d} × H${d.h} m`;
    const desc = document.createElement('div');
    desc.className = 'pc-desc';
    desc.textContent = def.description;
    info.append(name, dims, desc);
    card.append(img, info);

    card.addEventListener('dragstart', (e) => {
      e.dataTransfer?.setData('text/plain', def.type);
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'copy';
        if (src) e.dataTransfer.setDragImage(img, 36, 27);
      }
      editor.beginPaletteDrag(def.type);
    });
    card.addEventListener('dragend', () => editor.endPaletteDrag());
    card.addEventListener('dblclick', () => editor.addPartAtViewCenter(def.type));
    listEl.appendChild(card);
  }
}
