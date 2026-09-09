import * as T from 'three';
import { box, ico, cylinder, mesh } from './primitives';
export * from './primitives';
export { character, animal, weaponModel, dressArmor } from './actors';

export function tree(parent: T.Object3D, x: number, y: number, z: number, size: number, broad = false, variant = 0) {
  const g = new T.Group(); g.position.set(x, y, z); g.scale.setScalar(size); parent.add(g);
  cylinder(g, 0.12, 0.40, broad ? 5.5 : 5.0, 0x65533b, 0, 2.5, 0);
  for (let i = 0; i < 4; i++) { const root = box(g, 0.17, 0.22, 1.1, 0x65533b, Math.sin(i * 1.57) * 0.25, 0.05, Math.cos(i * 1.57) * 0.25); root.rotation.y = i * 1.57; }
  const colors = [0x52764c, 0x668451, 0x78924f, 0x425f43, 0x839b58];
  if (broad) {
    for (let i = 0; i < 5; i++) {
      const a = i * 2.4 + variant; const foliage = ico(g, 2.3, colors[(i + variant) % colors.length], Math.sin(a) * 1.5, 5.3 + (i % 2) * 1.15, Math.cos(a) * 1.3, 1);
      foliage.scale.set(1.2, 0.85, 1.05);
      foliage.userData.foliage = true;
    }
    for (let i = 0; i < 3; i++) { const branch = cylinder(g, 0.08, 0.16, 2.4, 0x65533b, Math.sin(i * 2.1) * 0.5, 4, Math.cos(i * 2.1) * 0.5); branch.rotation.z = Math.sin(i * 2.1) * 0.7; branch.rotation.x = Math.cos(i * 2.1) * 0.7; }
  } else for (let i = 0; i < 4; i++) {
    const leaf = mesh(g, new T.ConeGeometry(2.2 - i * 0.38, 3.2 - i * 0.33, 7), colors[(i + variant) % colors.length], 0, 3.0 + i * 1.03, 0);
    leaf.rotation.y = i * 0.63;
    leaf.userData.foliage = true;
  }
  return g;
}

export function house(parent: T.Object3D, x: number, y: number, z: number, scale = 1, rotation = 0) {
  const g = new T.Group(); g.position.set(x, y, z); g.rotation.y = rotation; g.scale.setScalar(scale); parent.add(g);
  box(g, 4.1, 0.4, 3.6, 0x868374, 0, 0.2);
  box(g, 3.8, 2.9, 3.2, 0xc8b99a, 0, 1.7);
  const roofShape = new T.Shape(); roofShape.moveTo(-2.4, 0); roofShape.lineTo(0, 1.9); roofShape.lineTo(2.4, 0); roofShape.closePath();
  mesh(g, new T.ExtrudeGeometry(roofShape, { depth: 4.1, bevelEnabled: false }), 0x755a46, 0, 3.1, -2.05);
  for (let i = 0; i < 7; i++) { const beam = box(g, 4.9, 0.10, 0.13, 0x8b7151, 0, 3.17, -1.9 + i * 0.62); beam.rotation.z = 0; }
  for (const side of [-1, 1]) {
    box(g, 0.16, 3, 3.3, 0x63503b, side * 1.8, 1.65);
    box(g, 0.72, 0.92, 0.09, 0x4e4939, side * 1.11, 1.8, 1.65);
    mesh(g, new T.BoxGeometry(0.57, 0.74, 0.095), 0xf0ce80, side * 1.11, 1.8, 1.69, 0x997342);
    box(g, 0.06, 0.77, 0.10, 0x63503b, side * 1.11, 1.8, 1.75);
    box(g, 0.6, 0.06, 0.10, 0x63503b, side * 1.11, 1.8, 1.75);
    box(g, 0.95, 0.24, 0.36, 0x76604a, side * 1.11, 1.24, 1.8);
    for (let j = 0; j < 4; j++) ico(g, 0.16, j % 2 ? 0xc69a94 : 0x648450, side * 1.11 - 0.3 + j * 0.2, 1.43, 1.8);
  }
  box(g, 0.8, 1.8, 0.10, 0x6b5039, 0, 1.25, 1.66);
  ico(g, 0.055, 0xdcc086, 0.25, 1.2, 1.76);
  box(g, 1.25, 0.15, 0.65, 0x8e8a7c, 0, 0.33, 1.87);
  box(g, 4, 0.16, 0.12, 0x63503b, 0, 2.65, 1.65);
  box(g, 0.6, 2, 0.65, 0x908a79, 1.1, 4);
  box(g, 0.8, 0.18, 0.85, 0x676c62, 1.1, 5);
  return g;
}
