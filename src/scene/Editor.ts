/**
 * 3D レイアウトエディタ本体。
 * シーン管理、パーツの追加・選択・移動・回転・削除、Undo/Redo、パレットからのドラッグ&ドロップを担当する。
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { getPartDef } from '../parts/catalog';
import type { AnimateFn } from '../parts/catalog';
import { clamp, disposeUnique, makeGhost } from '../parts/builders';
import { buildBuilding } from './building';
import type { Dims, FactorySpec, LayoutDoc, PartType, PlacedPart, ViewKind } from '../types';

THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

export type EditorEvent = 'change' | 'select' | 'cursor';

interface PartEntry {
  data: PlacedPart;
  obj: THREE.Group;
  label: CSS2DObject;
}

interface DragState {
  id: string;
  dx: number;
  dy: number;
  moved: boolean;
  before: string;
}

const UNDO_LIMIT = 100;

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

export class Editor {
  readonly container: HTMLElement;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 3000);
  readonly renderer: THREE.WebGLRenderer;
  readonly labelRenderer = new CSS2DRenderer();
  readonly controls: OrbitControls;
  readonly partsRoot = new THREE.Group();

  name = '新規レイアウト';
  factory: FactorySpec = { width: 20, length: 60, height: 12 };
  snap = 0.1;
  cursor: { x: number; y: number } | null = null;

  private building: THREE.Group = new THREE.Group();
  private entries = new Map<string, PartEntry>();
  private selectedId: string | null = null;
  private readonly selBox = new THREE.Box3();
  private readonly selHelper: THREE.Box3Helper;
  private labelsVisible = true;
  private ghost: THREE.Object3D | null = null;
  private ghostType: PartType | null = null;
  private paletteDragType: PartType | null = null;
  private drag: DragState | null = null;
  private pointerDown: { x: number; y: number; hit: boolean } | null = null;
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private listeners: Record<EditorEvent, Array<() => void>> = { change: [], select: [], cursor: [] };
  private readonly raycaster = new THREE.Raycaster();
  private readonly floorPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private readonly clock = new THREE.Clock();

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    const lr = this.labelRenderer.domElement;
    lr.style.position = 'absolute';
    lr.style.inset = '0';
    lr.style.pointerEvents = 'none';
    container.appendChild(lr);

    this.scene.background = new THREE.Color(0x1b1f24);
    this.scene.add(new THREE.HemisphereLight(0xdfe9f5, 0x3a3530, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(30, -40, 60);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xbcd0ff, 0.5);
    fill.position.set(-30, 50, 30);
    this.scene.add(fill);

    this.scene.add(this.partsRoot);
    this.selHelper = new THREE.Box3Helper(this.selBox, 0xffc107);
    const hm = this.selHelper.material as THREE.LineBasicMaterial;
    hm.depthTest = false;
    hm.transparent = true;
    this.selHelper.renderOrder = 999;
    this.selHelper.visible = false;
    this.scene.add(this.selHelper);

    // OrbitControls より先に登録し、パーツ上の押下ではカメラ操作を無効化する
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointercancel', this.onPointerUp);
    el.addEventListener('pointerleave', () => {
      this.cursor = null;
      this.emit('cursor');
    });
    container.addEventListener('dragover', this.onDragOver);
    container.addEventListener('drop', this.onDrop);
    container.addEventListener('dragleave', this.onDragLeave);

    this.controls = new OrbitControls(this.camera, el);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.screenSpacePanning = false; // 床面 (XY) 上でパン
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.minDistance = 1;
    this.controls.maxDistance = 600;

    this.rebuildBuilding();
    this.setView('perspective');

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  // ------------------------------------------------------------ イベント

  on(ev: EditorEvent, fn: () => void): void {
    this.listeners[ev].push(fn);
  }

  private emit(ev: EditorEvent): void {
    for (const fn of this.listeners[ev]) fn();
  }

  // ------------------------------------------------------------ 描画

  private resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h);
    this.labelRenderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private tick(): void {
    const t = this.clock.getElapsedTime();
    for (const e of this.entries.values()) {
      const anim = e.obj.userData.animate as AnimateFn | undefined;
      anim?.(t);
    }
    this.controls.update();
    if (this.selectedId) {
      const e = this.entries.get(this.selectedId);
      if (e) this.selBox.setFromObject(e.obj);
    }
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  }

  // ------------------------------------------------------------ 建屋・視点

  setFactory(spec: FactorySpec, record = true): void {
    if (record) this.pushUndo();
    this.factory = { ...spec };
    this.rebuildBuilding();
    this.emit('change');
  }

  private rebuildBuilding(): void {
    this.scene.remove(this.building);
    this.building.traverse((o) => {
      const line = o as THREE.LineSegments;
      if (line.isLineSegments) {
        line.geometry.dispose();
        (line.material as THREE.Material).dispose();
      }
    });
    disposeUnique(this.building);
    this.building = buildBuilding(this.factory);
    this.scene.add(this.building);
  }

  getBuilding(): THREE.Group {
    return this.building;
  }

  setView(kind: ViewKind): void {
    const { width: W, length: L, height: H } = this.factory;
    const target = new THREE.Vector3(W / 2, L / 2, 0);
    const span = Math.max(W, L);
    switch (kind) {
      case 'perspective':
        target.set(W / 2, L * 0.4, 0);
        this.camera.position.set(W / 2 + span * 0.55, -span * 0.25, Math.max(H * 2.2, span * 0.45));
        break;
      case 'top':
        this.camera.position.set(W / 2, L / 2 - 0.01, span * 1.15);
        break;
      case 'front':
        target.set(W / 2, L * 0.3, H * 0.3);
        this.camera.position.set(W / 2, -span * 0.35, H * 0.9);
        break;
      case 'side':
        target.set(W / 2, L / 2, H * 0.3);
        this.camera.position.set(W / 2 + span * 0.9, L / 2, H * 1.2);
        break;
    }
    this.controls.target.copy(target);
    this.camera.lookAt(target);
    this.controls.update();
  }

  focusPart(id: string): void {
    const e = this.entries.get(id);
    if (!e) return;
    const b = new THREE.Box3().setFromObject(e.obj);
    const c = b.getCenter(new THREE.Vector3());
    const r = Math.max(2, b.getSize(new THREE.Vector3()).length());
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this.controls.target.copy(c);
    this.camera.position.copy(c).addScaledVector(dir, r * 1.8);
    this.controls.update();
  }

  setLabelsVisible(v: boolean): void {
    this.labelsVisible = v;
    for (const e of this.entries.values()) e.label.visible = v;
  }

  get labelsShown(): boolean {
    return this.labelsVisible;
  }

  // ------------------------------------------------------------ パーツ操作

  listParts(): PlacedPart[] {
    return [...this.entries.values()].map((e) => structuredClone(e.data));
  }

  getSelected(): PlacedPart | null {
    if (!this.selectedId) return null;
    const e = this.entries.get(this.selectedId);
    return e ? structuredClone(e.data) : null;
  }

  get selectedPartId(): string | null {
    return this.selectedId;
  }

  /** エクスポート用: パーツの 3D オブジェクトとデータの組 */
  partObjects(): Array<{ data: PlacedPart; obj: THREE.Group }> {
    return [...this.entries.values()].map((e) => ({ data: e.data, obj: e.obj }));
  }

  private nextName(type: PartType): string {
    const label = getPartDef(type).label;
    let n = 1;
    const names = new Set([...this.entries.values()].map((e) => e.data.name));
    while (names.has(`${label} ${n}`)) n++;
    return `${label} ${n}`;
  }

  addPart(type: PartType, x: number, y: number, rotation = 0): string {
    const def = getPartDef(type);
    this.pushUndo();
    const data: PlacedPart = {
      id: newId(),
      type,
      name: this.nextName(type),
      x: this.clampX(this.snapV(x)),
      y: this.clampY(this.snapV(y)),
      z: def.defaultZ,
      rotation,
      dims: { ...def.defaultDims },
    };
    this.createEntry(data);
    this.select(data.id);
    this.emit('change');
    return data.id;
  }

  addPartAtViewCenter(type: PartType): string {
    const t = this.controls.target;
    return this.addPart(type, t.x, t.y);
  }

  private createEntry(data: PlacedPart): PartEntry {
    const def = getPartDef(data.type);
    const obj = def.build(data.dims);
    obj.userData.partId = data.id;
    const bb = new THREE.Box3().setFromObject(obj);
    const div = document.createElement('div');
    div.className = 'part-label';
    div.textContent = data.name;
    const label = new CSS2DObject(div);
    label.position.set(0, 0, bb.max.z + 0.35);
    label.visible = this.labelsVisible;
    obj.add(label);
    const entry: PartEntry = { data, obj, label };
    this.applyTransform(entry);
    this.partsRoot.add(obj);
    this.entries.set(data.id, entry);
    return entry;
  }

  private destroyEntry(entry: PartEntry): void {
    this.partsRoot.remove(entry.obj);
    entry.obj.remove(entry.label);
    disposeUnique(entry.obj);
    this.entries.delete(entry.data.id);
  }

  private applyTransform(e: PartEntry): void {
    e.obj.position.set(e.data.x, e.data.y, e.data.z);
    e.obj.rotation.set(0, 0, THREE.MathUtils.degToRad(e.data.rotation));
  }

  updatePart(id: string, patch: Partial<Omit<PlacedPart, 'id' | 'type'>>, record = true): void {
    const e = this.entries.get(id);
    if (!e) return;
    if (record) this.pushUndo();
    const def = getPartDef(e.data.type);
    const next: PlacedPart = { ...e.data, ...patch, dims: { ...e.data.dims, ...(patch.dims ?? {}) } };
    next.x = this.clampX(next.x);
    next.y = this.clampY(next.y);
    next.z = clamp(next.z, 0, this.factory.height);
    next.rotation = ((next.rotation % 360) + 360) % 360;
    next.dims = {
      w: clamp(next.dims.w, def.minDims.w, 50),
      d: clamp(next.dims.d, def.minDims.d, 50),
      h: clamp(next.dims.h, def.minDims.h, 50),
    };
    const dimsChanged = (Object.keys(next.dims) as Array<keyof Dims>).some((k) => next.dims[k] !== e.data.dims[k]);
    if (dimsChanged) {
      const wasSelected = this.selectedId === id;
      this.destroyEntry(e);
      this.createEntry(next);
      if (wasSelected) this.select(id);
    } else {
      e.data = next;
      e.label.element.textContent = next.name;
      this.applyTransform(e);
    }
    this.emit('change');
  }

  removePart(id: string): void {
    const e = this.entries.get(id);
    if (!e) return;
    this.pushUndo();
    this.destroyEntry(e);
    if (this.selectedId === id) this.select(null);
    this.emit('change');
  }

  duplicatePart(id: string): void {
    const e = this.entries.get(id);
    if (!e) return;
    this.pushUndo();
    const copy: PlacedPart = {
      ...structuredClone(e.data),
      id: newId(),
      name: this.nextName(e.data.type),
      x: this.clampX(e.data.x + 1),
      y: this.clampY(e.data.y + 1),
    };
    this.createEntry(copy);
    this.select(copy.id);
    this.emit('change');
  }

  rotateSelected(deltaDeg: number): void {
    const s = this.getSelected();
    if (s) this.updatePart(s.id, { rotation: s.rotation + deltaDeg });
  }

  select(id: string | null): void {
    this.selectedId = id && this.entries.has(id) ? id : null;
    this.selHelper.visible = this.selectedId !== null;
    for (const e of this.entries.values()) {
      e.label.element.classList.toggle('selected', e.data.id === this.selectedId);
    }
    this.emit('select');
  }

  // ------------------------------------------------------------ ドキュメント

  toDoc(): LayoutDoc {
    return {
      format: 'factory-layout',
      version: 1,
      name: this.name,
      factory: { ...this.factory },
      parts: this.listParts(),
    };
  }

  loadDoc(doc: LayoutDoc, record = true): void {
    if (record) this.pushUndo();
    this.applyDoc(doc);
    this.setView('perspective');
  }

  newDoc(factory: FactorySpec = { width: 20, length: 60, height: 12 }): void {
    this.loadDoc({ format: 'factory-layout', version: 1, name: '新規レイアウト', factory, parts: [] });
  }

  private applyDoc(doc: LayoutDoc): void {
    for (const e of [...this.entries.values()]) this.destroyEntry(e);
    this.name = doc.name;
    const factoryChanged =
      doc.factory.width !== this.factory.width ||
      doc.factory.length !== this.factory.length ||
      doc.factory.height !== this.factory.height;
    this.factory = { ...doc.factory };
    if (factoryChanged) this.rebuildBuilding();
    for (const p of doc.parts) this.createEntry(structuredClone(p));
    this.select(this.selectedId && this.entries.has(this.selectedId) ? this.selectedId : null);
    this.emit('change');
  }

  setName(name: string): void {
    this.name = name;
    this.emit('change');
  }

  private serialize(): string {
    return JSON.stringify(this.toDoc());
  }

  private pushUndoSnapshot(s: string): void {
    this.undoStack.push(s);
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    this.redoStack = [];
  }

  pushUndo(): void {
    this.pushUndoSnapshot(this.serialize());
  }

  undo(): void {
    const s = this.undoStack.pop();
    if (!s) return;
    this.redoStack.push(this.serialize());
    this.applyDoc(JSON.parse(s) as LayoutDoc);
  }

  redo(): void {
    const s = this.redoStack.pop();
    if (!s) return;
    this.undoStack.push(this.serialize());
    this.applyDoc(JSON.parse(s) as LayoutDoc);
  }

  // ------------------------------------------------------------ 座標ユーティリティ

  private snapV(v: number): number {
    return this.snap > 0 ? round3(Math.round(v / this.snap) * this.snap) : round3(v);
  }

  private clampX(v: number): number {
    return clamp(v, 0, this.factory.width);
  }

  private clampY(v: number): number {
    return clamp(v, 0, this.factory.length);
  }

  private setRayFromClient(clientX: number, clientY: number): void {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
  }

  private floorPoint(clientX: number, clientY: number): THREE.Vector3 | null {
    this.setRayFromClient(clientX, clientY);
    const p = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.floorPlane, p) ? p : null;
  }

  private pickPart(clientX: number, clientY: number): string | null {
    this.setRayFromClient(clientX, clientY);
    const hits = this.raycaster.intersectObjects(this.partsRoot.children, true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o && o.userData.partId === undefined) o = o.parent;
      if (o) return o.userData.partId as string;
    }
    return null;
  }

  // ------------------------------------------------------------ マウス操作

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    const id = this.pickPart(e.clientX, e.clientY);
    this.pointerDown = { x: e.clientX, y: e.clientY, hit: id !== null };
    if (!id) return;
    this.select(id);
    const p = this.floorPoint(e.clientX, e.clientY);
    const entry = this.entries.get(id);
    if (!p || !entry) return;
    this.drag = { id, dx: entry.data.x - p.x, dy: entry.data.y - p.y, moved: false, before: this.serialize() };
    this.controls.enabled = false;
    this.renderer.domElement.setPointerCapture(e.pointerId);
  };

  private onPointerMove = (e: PointerEvent): void => {
    const p = this.floorPoint(e.clientX, e.clientY);
    this.cursor = p ? { x: p.x, y: p.y } : null;
    this.emit('cursor');
    if (!this.drag || !p) return;
    const entry = this.entries.get(this.drag.id);
    if (!entry) return;
    if (!this.drag.moved) {
      const pd = this.pointerDown;
      if (pd && Math.hypot(e.clientX - pd.x, e.clientY - pd.y) < 4) return;
      this.drag.moved = true;
      this.pushUndoSnapshot(this.drag.before);
    }
    entry.data.x = this.clampX(this.snapV(p.x + this.drag.dx));
    entry.data.y = this.clampY(this.snapV(p.y + this.drag.dy));
    this.applyTransform(entry);
    this.emit('change');
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (this.drag) {
      if (this.renderer.domElement.hasPointerCapture(e.pointerId)) {
        this.renderer.domElement.releasePointerCapture(e.pointerId);
      }
      this.drag = null;
      this.controls.enabled = true;
    } else if (this.pointerDown && !this.pointerDown.hit) {
      if (Math.hypot(e.clientX - this.pointerDown.x, e.clientY - this.pointerDown.y) < 4) this.select(null);
    }
    this.pointerDown = null;
  };

  // ------------------------------------------------------------ パレットからのドラッグ&ドロップ

  beginPaletteDrag(type: PartType): void {
    this.paletteDragType = type;
  }

  endPaletteDrag(): void {
    this.paletteDragType = null;
    this.hideGhost();
  }

  private showGhost(type: PartType, x: number, y: number): void {
    if (this.ghostType !== type) {
      this.hideGhost();
      const def = getPartDef(type);
      this.ghost = makeGhost(def.build(def.defaultDims));
      this.ghostType = type;
      this.scene.add(this.ghost);
    }
    this.ghost?.position.set(this.clampX(this.snapV(x)), this.clampY(this.snapV(y)), getPartDef(type).defaultZ);
  }

  private hideGhost(): void {
    if (this.ghost) {
      this.scene.remove(this.ghost);
      disposeUnique(this.ghost);
    }
    this.ghost = null;
    this.ghostType = null;
  }

  private onDragOver = (e: DragEvent): void => {
    if (!this.paletteDragType) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    const p = this.floorPoint(e.clientX, e.clientY);
    if (p) this.showGhost(this.paletteDragType, p.x, p.y);
    else this.hideGhost();
  };

  private onDrop = (e: DragEvent): void => {
    const type = this.paletteDragType;
    if (!type) return;
    e.preventDefault();
    const p = this.floorPoint(e.clientX, e.clientY);
    this.endPaletteDrag();
    if (p) this.addPart(type, p.x, p.y);
  };

  private onDragLeave = (e: DragEvent): void => {
    const rel = e.relatedTarget as Node | null;
    if (!rel || !this.container.contains(rel)) this.hideGhost();
  };
}
