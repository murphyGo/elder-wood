import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const materials = new Map<string, T.MeshStandardMaterial>();
export function material(color: number, emissive = 0) {
  const key = `${color}:${emissive}`;
  if (!materials.has(key)) materials.set(key, new T.MeshStandardMaterial({ color, roughness: 0.87, flatShading: true, emissive, emissiveIntensity: 0.65 }));
  return materials.get(key)!;
}
export function mesh(parent: T.Object3D, geometry: T.BufferGeometry, color: number, x = 0, y = 0, z = 0, emissive = 0) {
  const object = new T.Mesh(geometry, material(color, emissive));
  object.position.set(x, y, z); object.castShadow = true; object.receiveShadow = true; parent.add(object); return object;
}
export const box = (p: T.Object3D, w: number, h: number, d: number, c: number, x = 0, y = 0, z = 0) => mesh(p, new T.BoxGeometry(w, h, d), c, x, y, z);
export const ico = (p: T.Object3D, r: number, c: number, x = 0, y = 0, z = 0, detail = 0) => mesh(p, new T.IcosahedronGeometry(r, detail), c, x, y, z);
export const cylinder = (p: T.Object3D, top: number, bottom: number, h: number, c: number, x = 0, y = 0, z = 0, sides = 7) => mesh(p, new T.CylinderGeometry(top, bottom, h, sides), c, x, y, z);

export function batch(group: T.Group) {
  group.updateMatrixWorld(true);
  const sets = new Map<T.Material, T.BufferGeometry[]>();
  const originals = new Set<T.BufferGeometry>();
  group.traverse(object => {
    if (!(object instanceof T.Mesh) || Array.isArray(object.material)) return;
    const geom = object.geometry.clone().applyMatrix4(object.matrixWorld);
    geom.deleteAttribute('uv');
    if (!geom.index) { /* all attributes merge as nonindexed below */ }
    const nonIndexed = geom.index ? geom.toNonIndexed() : geom;
    if (geom !== nonIndexed) geom.dispose();
    if (!sets.has(object.material)) sets.set(object.material, []);
    sets.get(object.material)!.push(nonIndexed); originals.add(object.geometry);
  });
  group.clear();
  for (const [mat, geoms] of sets) {
    const combined = mergeGeometries(geoms);
    if (combined) { const m = new T.Mesh(combined, mat); m.castShadow = true; m.receiveShadow = true; group.add(m); }
    geoms.forEach(g => g.dispose());
  }
  originals.forEach(g => g.dispose());
}

