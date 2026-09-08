import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Species, Weapon } from './state';

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

export function weaponModel(type: Weapon) {
  const g = new T.Group();
  if (type === 'sword') {
    const blade = box(g, 0.14, 1.3, 0.055, 0xe4ecdf, 0, 0.73); blade.rotation.z = -0.04;
    const tip = mesh(g, new T.ConeGeometry(0.10, 0.23, 4), 0xe4ecdf, 0, 1.48); tip.rotation.y = Math.PI / 4;
    box(g, 0.45, 0.10, 0.11, 0xc5a45e, 0, 0.06);
    cylinder(g, 0.05, 0.06, 0.35, 0x44352a, 0, -0.14);
    ico(g, 0.09, 0xc5a45e, 0, -0.33);
  } else if (type === 'spear') {
    cylinder(g, 0.035, 0.045, 2.75, 0x765537, 0, 0.35);
    mesh(g, new T.ConeGeometry(0.13, 0.6, 4), 0xd8e1d4, 0, 1.93);
    cylinder(g, 0.065, 0.065, 0.25, 0xc9a36d, 0, 1.55);
  } else {
    const curve = new T.CatmullRomCurve3([new T.Vector3(0, -0.9, 0), new T.Vector3(0.36, -0.5, 0), new T.Vector3(0.45, 0, 0), new T.Vector3(0.36, 0.5, 0), new T.Vector3(0, 0.9, 0)]);
    mesh(g, new T.TubeGeometry(curve, 12, 0.055, 5, false), 0xa78047);
    cylinder(g, 0.008, 0.008, 1.8, 0xe4dec0);
    box(g, 0.055, 0.32, 0.08, 0x594736, 0.45);
  }
  return g;
}

export function character(npc = false, cloak = 0x9b5141) {
  const root = new T.Group(); const body = new T.Group(); root.add(body);
  const legs: T.Group[] = [];
  for (const side of [-1, 1]) {
    const leg = new T.Group(); leg.position.set(side * 0.17, 0.9, 0); body.add(leg);
    box(leg, 0.25, 0.48, 0.27, 0x4a4a3c, 0, -0.22);
    box(leg, 0.27, 0.38, 0.31, 0x3c322b, 0, -0.64, 0.035);
    box(leg, 0.28, 0.16, 0.43, 0x312b26, 0, -0.84, 0.1); legs.push(leg);
  }
  const chest = cylinder(body, 0.35, 0.30, 0.72, npc ? 0x646954 : 0x617166, 0, 1.25, 0, 6);
  box(body, 0.67, 0.12, 0.45, 0x48392b, 0, 0.96);
  box(body, 0.13, 0.12, 0.055, 0xc4a063, 0, 0.96, 0.26);
  const cape = new T.Group(); cape.position.set(0, 1.63, -0.18); body.add(cape);
  const capeShape = new T.Shape(); capeShape.moveTo(-0.33, 0); capeShape.lineTo(0.33, 0); capeShape.lineTo(0.51, -1.14); capeShape.lineTo(0.1, -1.23); capeShape.lineTo(-0.5, -1.13); capeShape.closePath();
  const capeMesh = mesh(cape, new T.ExtrudeGeometry(capeShape, { depth: 0.045, bevelEnabled: false }), cloak);
  capeMesh.rotation.x = 0.22;
  const shoulder = ico(body, 0.33, cloak, 0, 1.61, -0.05, 1); shoulder.scale.set(1.48, 0.57, 1.2);
  cylinder(body, 0.10, 0.12, 0.20, 0xd7aa7e, 0, 1.72);
  const head = ico(body, 0.28, 0xd6ad85, 0, 1.99, 0.02, 1); head.scale.set(0.87, 1.12, 0.9);
  const hood = ico(body, 0.32, npc ? 0xd6d0b2 : 0x3e4634, 0, 2.10, -0.06, 1); hood.scale.set(1, 0.74, 1);
  box(body, 0.43, 0.14, 0.16, npc ? 0xd6d0b2 : 0x3e4634, 0, 2.13, 0.16);
  for (const side of [-1, 1]) box(body, 0.038, 0.045, 0.025, 0x282921, side * 0.10, 2.00, 0.263);
  if (npc) { const beard = mesh(body, new T.ConeGeometry(0.19, 0.42, 5), 0xd6d0b2, 0, 1.77, 0.16); beard.rotation.z = Math.PI; }
  const arms: T.Group[] = [];
  for (const side of [-1, 1]) {
    const arm = new T.Group(); arm.position.set(side * 0.42, 1.54, 0); body.add(arm);
    cylinder(arm, 0.12, 0.1, 0.45, 0x657265, 0, -0.17);
    cylinder(arm, 0.11, 0.10, 0.30, 0x4c3c2a, 0, -0.5, 0.04);
    ico(arm, 0.11, 0xd7aa7e, 0, -0.68, 0.065, 1); arms.push(arm);
  }
  const hand = new T.Group(); hand.position.set(0, -0.68, 0.09); hand.rotation.x = 0.3; arms[0].add(hand);
  if (npc) { cylinder(hand, 0.05, 0.045, 2.5, 0x6e5135, 0, 0.42); ico(hand, 0.17, 0x8fbfa8, 0, 1.74); }
  root.userData = { body, legs, arms, cape, hand, chest }; return root;
}

export function animal(type: Species) {
  const root = new T.Group(); const body = new T.Group(); root.add(body);
  const colors: Record<Species, number> = { squirrel: 0xb57945, rabbit: 0xe3ddc6, cow: 0x9f8261, horse: 0x63534b, hippo: 0x8c9095, tiger: 0xc79143, shark: 0x689098, dragon: 0x544c69 };
  const color = colors[type];
  const small = type === 'rabbit' || type === 'squirrel';
  const aquatic = type === 'shark'; const dragon = type === 'dragon';
  const torso = ico(body, 0.7, color, 0, small ? 0.5 : 0.8, 0, 1);
  torso.scale.set(small ? 0.6 : 0.8, small ? 0.65 : 0.85, 1.2);
  const head = ico(body, small ? 0.32 : 0.43, color, 0, small ? 0.77 : 1.08, 0.7, 1);
  head.scale.set(1, type === 'horse' ? 1.3 : 0.95, type === 'hippo' ? 1.2 : 1);
  if (!aquatic) {
    const snout = ico(body, small ? 0.18 : 0.3, type === 'cow' || type === 'hippo' ? 0xaf9b8d : color, 0, small ? 0.66 : 0.95, small ? 0.95 : 1.01, 1); snout.scale.set(1.15, 0.6, 0.9);
    ico(body, 0.055, 0x3c3433, 0, small ? 0.7 : 1.04, small ? 1.07 : 1.26);
  }
  const eyesY = small ? 0.85 : 1.17;
  for (const side of [-1, 1]) {
    ico(body, small ? 0.045 : 0.06, 0x24292a, side * (small ? 0.22 : 0.32), eyesY, small ? 0.9 : 0.97, 1);
    if (!aquatic) {
      const ear = ico(body, type === 'rabbit' ? 0.25 : 0.14, color, side * 0.2, small ? 1.12 : 1.43, 0.65, 0);
      ear.scale.set(type === 'rabbit' ? 0.38 : 1, type === 'rabbit' ? 1.8 : 1, 0.5); ear.rotation.z = side * -0.17;
      if (type === 'rabbit') { const inner = ico(body, 0.19, 0xc89991, side * 0.2, 1.13, 0.74); inner.scale.set(0.26, 1.55, 0.15); inner.rotation.z = side * -0.17; }
    }
    if (type === 'cow' || dragon) { const horn = mesh(body, new T.ConeGeometry(0.12, 0.6, 5), 0xd5ccb0, side * 0.37, 1.55, 0.57); horn.rotation.z = side * -0.7; }
  }
  const legs: T.Mesh[] = [];
  if (!aquatic) for (const x of [-0.31, 0.31]) for (const z of [-0.45, 0.45]) {
    const leg = cylinder(body, small ? 0.09 : 0.15, small ? 0.11 : 0.13, small ? 0.32 : 0.66, color, x * (small ? 0.7 : 1), small ? 0.18 : 0.35, z);
    legs.push(leg);
    if (!small) box(body, 0.25, 0.15, 0.3, 0x413d38, x, 0.08, z + 0.04);
  }
  if (type === 'squirrel') { const tail = ico(body, 0.5, 0x9f6637, 0, 0.85, -0.87, 1); tail.scale.set(0.6, 1.5, 0.8); tail.rotation.x = -0.5; }
  else if (type === 'rabbit') ico(body, 0.18, 0xf1ecd9, 0, 0.53, -0.72, 1);
  else if (!aquatic) { const tail = cylinder(body, 0.045, 0.08, dragon ? 1.5 : 0.8, color, 0, 0.58, -1); tail.rotation.x = -1.1; }
  if (type === 'horse') { box(body, 0.14, 0.55, 0.7, 0x2b2929, 0, 1.30, 0.34); }
  if (type === 'tiger') for (let i = 0; i < 5; i++) {
    for (const side of [-1, 1]) { const stripe = box(body, 0.035, 0.56, 0.09, 0x3e3831, side * 0.47, 0.88, -0.45 + i * 0.23); stripe.rotation.z = side * -0.24; }
  }
  if (aquatic) {
    torso.scale.set(0.7, 0.65, 1.75); head.scale.set(0.9, 0.6, 1.4);
    const belly = ico(body, 0.58, 0xb8ccc9, 0, 0.59, 0.1, 1); belly.scale.set(0.75, 0.3, 1.8);
    const fin = mesh(body, new T.ConeGeometry(0.35, 0.8, 3), color, 0, 1.48, -0.13); fin.scale.z = 0.3; fin.rotation.y = Math.PI / 2;
    for (const side of [-1, 1]) { const fin = mesh(body, new T.ConeGeometry(0.3, 0.9, 3), color, side * 0.55, 0.65, 0); fin.rotation.z = side * -1.8; fin.scale.z = 0.32; }
    const tail = mesh(body, new T.ConeGeometry(0.45, 0.7, 3), color, 0, 0.9, -1.4); tail.scale.x = 0.2; tail.rotation.x = Math.PI / 2;
    for (let i = 0; i < 5; i++) { const tooth = mesh(body, new T.ConeGeometry(0.045, 0.10, 3), 0xeee7d5, (i - 2) * 0.09, 0.82, 1.13); tooth.rotation.z = Math.PI; }
  }
  const wings: T.Group[] = [];
  if (dragon) {
    torso.scale.set(0.8, 0.95, 1.4);
    for (const side of [-1, 1]) {
      const wing = new T.Group(); wing.position.set(side * 0.4, 1.25, -0.1); body.add(wing);
      const shape = new T.Shape(); shape.moveTo(0, 0); shape.lineTo(side * 1.3, 1.45); shape.lineTo(side * 2.8, 0.45); shape.lineTo(side * 1.9, 0.2); shape.lineTo(side * 1.3, -0.35); shape.lineTo(side * 0.55, -0.7); shape.closePath();
      const membrane = mesh(wing, new T.ExtrudeGeometry(shape, { depth: 0.035, bevelEnabled: false }), 0x81617b); membrane.rotation.x = -0.4; wings.push(wing);
      const bone = cylinder(wing, 0.04, 0.08, 2, 0x403b50, side * 0.65, 0.72); bone.rotation.z = side * -0.72;
    }
    for (let i = 0; i < 5; i++) mesh(body, new T.ConeGeometry(0.15, 0.37, 4), 0xaea1bf, 0, 1.35, -0.85 + i * 0.3);
  }
  root.userData = { body, legs, wings }; return root;
}

export function tree(parent: T.Object3D, x: number, y: number, z: number, size: number, broad = false, variant = 0) {
  const g = new T.Group(); g.position.set(x, y, z); g.scale.setScalar(size); parent.add(g);
  cylinder(g, 0.12, 0.40, broad ? 5.5 : 5.0, 0x65533b, 0, 2.5, 0);
  for (let i = 0; i < 4; i++) { const root = box(g, 0.17, 0.22, 1.1, 0x65533b, Math.sin(i * 1.57) * 0.25, 0.05, Math.cos(i * 1.57) * 0.25); root.rotation.y = i * 1.57; }
  const colors = [0x52764c, 0x668451, 0x78924f, 0x425f43, 0x839b58];
  if (broad) {
    for (let i = 0; i < 5; i++) {
      const a = i * 2.4 + variant; const foliage = ico(g, 2.3, colors[(i + variant) % colors.length], Math.sin(a) * 1.5, 5.3 + (i % 2) * 1.15, Math.cos(a) * 1.3, 1);
      foliage.scale.set(1.2, 0.85, 1.05);
    }
    for (let i = 0; i < 3; i++) { const branch = cylinder(g, 0.08, 0.16, 2.4, 0x65533b, Math.sin(i * 2.1) * 0.5, 4, Math.cos(i * 2.1) * 0.5); branch.rotation.z = Math.sin(i * 2.1) * 0.7; branch.rotation.x = Math.cos(i * 2.1) * 0.7; }
  } else for (let i = 0; i < 4; i++) {
    const leaf = mesh(g, new T.ConeGeometry(2.2 - i * 0.38, 3.2 - i * 0.33, 7), colors[(i + variant) % colors.length], 0, 3.0 + i * 1.03, 0);
    leaf.rotation.y = i * 0.63;
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
