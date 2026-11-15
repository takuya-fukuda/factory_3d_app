/**
 * USD (USDA テキスト) 出力。Isaac Sim / Omniverse 向けに Z-up・メートル単位で書き出す。
 *
 * /Factory                 (defaultPrim, kind=assembly)
 *   /Looks/Mat_XXX         UsdPreviewSurface
 *   /Building              床・壁・柱・梁（任意で床にコリジョン）
 *   /Parts/<Type>_NN       パーツごとの Xform（translate + rotateZ）。customData に種別・名称・寸法
 *       /Mesh_NN           マテリアル単位に結合したメッシュ
 */
import * as THREE from 'three';
import { getPartDef } from '../parts/catalog';
import type { FactorySpec, PlacedPart } from '../types';
import { collectChunks, type MeshChunk } from './meshCollect';

export interface UsdOptions {
  includeBuilding: boolean;
  /** 床に PhysicsCollisionAPI を付ける（Isaac Sim でそのまま物を置ける） */
  floorCollision: boolean;
  /** パーツにも静的コリジョンを付ける */
  partCollision: boolean;
}

const ROOT = '/Factory';

function f(v: number): string {
  const r = Math.round(v * 10000) / 10000;
  return Object.is(r, -0) ? '0' : String(r);
}

function str(s: string): string {
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ') + '"';
}

function ident(s: string): string {
  const t = s.replace(/[^A-Za-z0-9_]/g, '_');
  return /^[A-Za-z_]/.test(t) ? t : `_${t}`;
}

class MaterialTable {
  private map = new Map<string, { name: string; chunk: MeshChunk }>();

  pathFor(ch: MeshChunk): string {
    let e = this.map.get(ch.key);
    if (!e) {
      e = { name: `Mat_${String(this.map.size).padStart(3, '0')}`, chunk: ch };
      this.map.set(ch.key, e);
    }
    return `${ROOT}/Looks/${e.name}`;
  }

  write(ind: string): string {
    const out: string[] = [];
    out.push(`${ind}def Scope "Looks"`, `${ind}{`);
    for (const { name, chunk } of this.map.values()) {
      const [r, g, b] = chunk.color;
      const i2 = ind + '    ';
      const i3 = i2 + '    ';
      out.push(
        `${i2}def Material "${name}"`,
        `${i2}{`,
        `${i3}token outputs:surface.connect = <${ROOT}/Looks/${name}/Shader.outputs:surface>`,
        `${i3}def Shader "Shader"`,
        `${i3}{`,
        `${i3}    uniform token info:id = "UsdPreviewSurface"`,
        `${i3}    color3f inputs:diffuseColor = (${f(r)}, ${f(g)}, ${f(b)})`,
        `${i3}    float inputs:metallic = ${f(chunk.metalness)}`,
        `${i3}    float inputs:roughness = ${f(chunk.roughness)}`,
        `${i3}    float inputs:opacity = ${f(chunk.opacity)}`,
        `${i3}    token outputs:surface`,
        `${i3}}`,
        `${i2}}`,
      );
    }
    out.push(`${ind}}`);
    return out.join('\n');
  }
}

function writeMesh(name: string, ch: MeshChunk, matPath: string, ind: string, collision: boolean): string {
  const P = ch.positions;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const pts: string[] = [];
  for (let i = 0; i < P.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], P[i + k]);
      max[k] = Math.max(max[k], P[i + k]);
    }
    pts.push(`(${f(P[i])}, ${f(P[i + 1])}, ${f(P[i + 2])})`);
  }
  const counts = new Array<string>(ch.indices.length / 3).fill('3').join(', ');
  const [r, g, b] = ch.color;
  const schemas = collision
    ? '"MaterialBindingAPI", "PhysicsCollisionAPI", "PhysicsMeshCollisionAPI"'
    : '"MaterialBindingAPI"';
  const i2 = ind + '    ';
  const lines = [
    `${ind}def Mesh "${name}" (`,
    `${ind}    prepend apiSchemas = [${schemas}]`,
    `${ind})`,
    `${ind}{`,
    `${i2}float3[] extent = [(${f(min[0])}, ${f(min[1])}, ${f(min[2])}), (${f(max[0])}, ${f(max[1])}, ${f(max[2])})]`,
    `${i2}int[] faceVertexCounts = [${counts}]`,
    `${i2}int[] faceVertexIndices = [${ch.indices.join(', ')}]`,
    `${i2}point3f[] points = [${pts.join(', ')}]`,
    `${i2}color3f[] primvars:displayColor = [(${f(r)}, ${f(g)}, ${f(b)})] (`,
    `${i2}    interpolation = "constant"`,
    `${i2})`,
  ];
  if (ch.opacity < 1) {
    lines.push(`${i2}float[] primvars:displayOpacity = [${f(ch.opacity)}] (`, `${i2}    interpolation = "constant"`, `${i2})`);
  }
  lines.push(`${i2}uniform token subdivisionScheme = "none"`, `${i2}rel material:binding = <${matPath}>`);
  if (collision) lines.push(`${i2}uniform token physics:approximation = "none"`);
  lines.push(`${ind}}`);
  return lines.join('\n');
}

export function exportUsd(
  name: string,
  factory: FactorySpec,
  building: THREE.Object3D,
  parts: Array<{ data: PlacedPart; obj: THREE.Object3D }>,
  opts: UsdOptions,
): string {
  const mats = new MaterialTable();
  const body: string[] = [];
  const ind1 = '    ';
  const ind2 = '        ';
  const ind3 = '            ';

  if (opts.includeBuilding) {
    body.push(`${ind1}def Xform "Building" (`, `${ind1}    kind = "component"`, `${ind1})`, `${ind1}{`);
    // 床・壁・柱・梁を役割ごとにまとめて出力
    const roles = new Map<string, THREE.Object3D[]>();
    building.traverse((o) => {
      const role = o.userData.buildingRole as string | undefined;
      if (role && (o as THREE.Mesh).isMesh) {
        const arr = roles.get(role) ?? [];
        arr.push(o);
        roles.set(role, arr);
      }
    });
    building.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(building.matrixWorld).invert();
    for (const [role, objs] of roles) {
      const tmp = new THREE.Group();
      // 一時的に同じ変換を持つクローンを作って集約
      for (const o of objs) {
        const c = (o as THREE.Mesh).clone();
        c.matrixAutoUpdate = false;
        c.matrix.multiplyMatrices(inv, o.matrixWorld);
        tmp.add(c);
      }
      const chunks = collectChunks(tmp, new THREE.Matrix4());
      chunks.forEach((ch, i) => {
        const nm = `${role[0].toUpperCase()}${role.slice(1)}${chunks.length > 1 ? `_${i}` : ''}`;
        body.push(writeMesh(nm, ch, mats.pathFor(ch), ind2, role === 'floor' && opts.floorCollision));
      });
    }
    body.push(`${ind1}}`);
  }

  body.push(`${ind1}def Xform "Parts" (`, `${ind1}    kind = "group"`, `${ind1})`, `${ind1}{`);
  const counters = new Map<string, number>();
  for (const { data, obj } of parts) {
    const def = getPartDef(data.type);
    const k = (counters.get(def.usdName) ?? 0) + 1;
    counters.set(def.usdName, k);
    const primName = ident(`${def.usdName}_${String(k).padStart(2, '0')}`);
    obj.updateWorldMatrix(true, true);
    const toLocal = new THREE.Matrix4().copy(obj.matrixWorld).invert();
    const chunks = collectChunks(obj, toLocal);
    body.push(
      `${ind2}def Xform "${primName}" (`,
      `${ind2}    kind = "component"`,
      `${ind2}    customData = {`,
      `${ind2}        string partType = ${str(data.type)}`,
      `${ind2}        string label = ${str(data.name)}`,
      `${ind2}        string partId = ${str(data.id)}`,
      `${ind2}        double3 dims = (${f(data.dims.w)}, ${f(data.dims.d)}, ${f(data.dims.h)})`,
      `${ind2}    }`,
      `${ind2})`,
      `${ind2}{`,
      `${ind3}double3 xformOp:translate = (${f(data.x)}, ${f(data.y)}, ${f(data.z)})`,
      `${ind3}float xformOp:rotateZ = ${f(data.rotation)}`,
      `${ind3}uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:rotateZ"]`,
    );
    chunks.forEach((ch, i) => {
      const collide = opts.partCollision && !ch.glass;
      body.push(writeMesh(`Mesh_${String(i).padStart(2, '0')}`, ch, mats.pathFor(ch), ind3, collide));
    });
    body.push(`${ind2}}`);
  }
  body.push(`${ind1}}`);

  const header = [
    '#usda 1.0',
    '(',
    '    customLayerData = {',
    `        string generator = "Factory Layout Editor"`,
    `        string layoutName = ${str(name)}`,
    `        double3 factorySize = (${f(factory.width)}, ${f(factory.length)}, ${f(factory.height)})`,
    '    }',
    '    defaultPrim = "Factory"',
    '    metersPerUnit = 1',
    '    upAxis = "Z"',
    ')',
    '',
    'def Xform "Factory" (',
    '    kind = "assembly"',
    ')',
    '{',
  ];
  return [...header, mats.write(ind1), ...body, '}', ''].join('\n');
}
