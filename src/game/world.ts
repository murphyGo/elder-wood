import * as T from 'three';
import { box, ico, cylinder, mesh, tree, house, batch } from './models';
import type { Zone } from './state';
import { STORY_SITES, newJourney, type JourneyState, type StoryId } from './journey-data';
import { createCoast, refreshCoast } from './coast';
import { createSkytree, addEndingWorld, refreshSkytree } from './skytree';
import { newFinale, type FinaleState, type FinalSiteId } from './finale-data';

export interface Obstacle { x: number; z: number; radius: number }
export interface Landmark { x: number; z: number; name: string; kind: 'elder' | 'shop' | 'portal' | 'seal' | 'story' | 'resident' | 'finale' | 'root'; destination?: Zone; index?: number; storyId?: StoryId; finalId?: FinalSiteId; ending?: boolean; text?: string }
export interface Environment { group: T.Group; obstacles: Obstacle[]; landmarks: Landmark[]; portal: T.Group; particles: T.Points; water: T.Mesh; dark: boolean; grass: T.InstancedMesh; grassCount: number; wind: { value: number }; foliageMaterials: T.Material[]; coast?: { zone: Zone; baseObstacles: Obstacle[]; barrier: T.Group; crossing: T.Group; tideWater: T.Mesh; beacon: T.Group; storyViews: Map<StoryId, T.Group> } }
export interface Environment { skytree?: { zone: Zone; baseObstacles: Obstacle[]; barrier: T.Group; crossing: T.Group; storyViews: Map<FinalSiteId, T.Group> }; ending?: { renew: T.Group; release: T.Group } }
export const terrainHeight = (x: number, z: number) => Math.sin(x * 0.14) * Math.cos(z * 0.13) * 0.24 + Math.sin(z * 0.19) * 0.12;
export function random(seed: number) { let a = seed; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export function createEnvironment(zone: Zone, journey = newJourney(), finale = newFinale()): Environment {
  if (zone === 'ruins' || zone === 'roots' || zone === 'trial') return createSkytree(zone, finale);
  if (zone === 'harbor' || zone === 'wreck' || zone === 'abyss') { const env = createCoast(zone, journey); addEndingWorld(env, zone); refreshSkytree(env, finale); return env; }
  const rng = random(8436 + Object.keys({ village: 0, forest: 1, plains: 2, depths: 3, sanctum: 4 }).indexOf(zone) * 831);
  const group = new T.Group(); const statics = new T.Group(); group.add(statics);
  const obstacles: Obstacle[] = []; const landmarks: Landmark[] = [];
  const dark = zone === 'depths' || zone === 'sanctum'; const village = zone === 'village';
  const base = new T.Color(dark ? (zone === 'sanctum' ? 0x424352 : 0x496264) : zone === 'plains' ? 0x82905b : 0x758b50);
  const groundGeo = new T.PlaneGeometry(160, 160, 85, 85).toNonIndexed(); groundGeo.rotateX(-Math.PI / 2);
  const pos = groundGeo.attributes.position; const colors = [];
  for (let i = 0; i < pos.count; i += 3) {
    const variation = (rng() - 0.5) * 0.08; const color = base.clone().offsetHSL(variation * 0.3, variation * 0.2, variation);
    for (let j = 0; j < 3; j++) { pos.setY(i + j, terrainHeight(pos.getX(i + j), pos.getZ(i + j)) - 0.015); colors.push(color.r, color.g, color.b); }
  }
  groundGeo.setAttribute('color', new T.Float32BufferAttribute(colors, 3)); groundGeo.computeVertexNormals();
  const ground = new T.Mesh(groundGeo, new T.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 })); ground.receiveShadow = true; group.add(ground);

  function trail(points: T.Vector3[], width: number) {
    const curve = new T.CatmullRomCurve3(points); const vertices: number[] = [];
    for (let i = 0; i < 70; i++) {
      const a = curve.getPoint(i / 70); const b = curve.getPoint((i + 1) / 70); const ta = curve.getTangent(i / 70); const tb = curve.getTangent((i + 1) / 70);
      const pa = new T.Vector3(-ta.z, 0, ta.x).multiplyScalar(width / 2); const pb = new T.Vector3(-tb.z, 0, tb.x).multiplyScalar(width / 2);
      const corners = [a.clone().add(pa), a.clone().sub(pa), b.clone().add(pb), b.clone().sub(pb)];
      for (const k of [0, 2, 1, 1, 2, 3]) { const v = corners[k]; vertices.push(v.x, terrainHeight(v.x, v.z) + 0.035, v.z); }
    }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(vertices, 3)); geo.computeVertexNormals();
    mesh(statics, geo, dark ? 0x626669 : 0xb5a47c);
  }
  trail([new T.Vector3(4, 0, 30), new T.Vector3(1, 0, 12), new T.Vector3(0, 0, 0), new T.Vector3(3, 0, -12), new T.Vector3(0, 0, -33)], 3.5);
  if (village) trail([new T.Vector3(0, 0, 4), new T.Vector3(-8, 0, 0), new T.Vector3(-15, 0, 2), new T.Vector3(-30, 0, 8)], 3.2);

  for (let i = 0; i < 115; i++) {
    const angle = rng() * Math.PI * 2; const radius = 24 + rng() * 44;
    const x = Math.sin(angle) * radius; const z = Math.cos(angle) * radius;
    if (village && x < -7 && z < 10 && z > -13) continue;
    if (dark) {
      const rockRadius = 3 + rng() * 5;
      const rock = ico(statics, radius < 34 ? 2.5 : rockRadius, zone === 'sanctum' ? 0x4e495b : 0x55676a, x, 1, z, 0); rock.scale.set(1, 1 + rng() * 1.8, 1);
      if (i % 5 === 0) { const crystal = mesh(statics, new T.OctahedronGeometry(2), zone === 'sanctum' ? 0xa18dbd : 0x8fbcba, x, 2, z, 0x284750); crystal.scale.set(0.4, 2, 0.4); }
    } else tree(statics, x, terrainHeight(x, z), z, 0.7 + rng() * 1.3, i % 4 === 0, i % 5);
    if (radius < 34) obstacles.push({ x, z, radius: dark ? 2.5 : 0.6 });
  }
  if (!dark) {
    const foregroundTrees = [[11, -6, 1.7, 1], [-10, 12, 1.25, 0], [14, 13, 1.6, 0], [-8, -16, 1.55, 1], [17, -17, 1.4, 0], [-16, -23, 1.1, 0]];
    for (const [x, z, s, broad] of foregroundTrees) { tree(statics, x, terrainHeight(x, z), z, s, !!broad, 1); obstacles.push({ x, z, radius: s * 0.45 }); }
  }

  // A flowing stream stays outside the playable clearing, with a bridge into the village.
  const waterGeometry = new T.PlaneGeometry(5, 115, 1, 50); waterGeometry.rotateX(-Math.PI / 2);
  const waterPositions = waterGeometry.attributes.position;
  for (let i = 0; i < waterPositions.count; i++) waterPositions.setX(i, waterPositions.getX(i) - 20 + Math.sin(waterPositions.getZ(i) * 0.06) * 2);
  const water = new T.Mesh(waterGeometry, new T.MeshStandardMaterial({ color: dark ? 0x385d6a : 0x619d9a, roughness: 0.22, metalness: 0.25, transparent: true, opacity: 0.87 }));
  water.position.y = 0.1; water.receiveShadow = true; group.add(water);
  for (let i = 0; i < 65; i++) {
    const z = -52 + rng() * 110; const x = -20 + Math.sin(z * 0.06) * 2 + (i % 2 ? 3 : -3);
    const rock = ico(statics, 0.35 + rng() * 0.65, dark ? 0x6b7777 : 0x929888, x, terrainHeight(x, z) + 0.2, z, 0); rock.scale.y = 0.65;
  }
  if (village) {
    house(statics, -11, terrainHeight(-11, -5), -5, 1.25, 0.23); obstacles.push({ x: -11, z: -5, radius: 3.1 });
    house(statics, -20, terrainHeight(-20, -8), -8, 1.05, 0.35); obstacles.push({ x: -20, z: -8, radius: 2.6 });
    house(statics, -27, terrainHeight(-27, -2), -2, 0.95, 0.55); obstacles.push({ x: -27, z: -2, radius: 2.4 });
    house(statics, -6, terrainHeight(-6, -13), -13, 0.8, 0.2); obstacles.push({ x: -6, z: -13, radius: 2.1 });
    for (let i = 0; i < 15; i++) box(statics, 0.42, 0.16, 3.7, i % 2 ? 0x8d7753 : 0x9d8560, -22.5 + i * 0.41, 0.42 + Math.sin(i / 14 * Math.PI) * 0.4, 5);
    for (const z of [3.3, 6.7]) {
      for (let i = 0; i < 5; i++) box(statics, 0.15, 1.2, 0.15, 0x6e5d40, -22.4 + i * 1.4, 1.07, z);
      box(statics, 6, 0.13, 0.13, 0x7e6948, -19.5, 1.55, z);
    }
    // Village well, warm lanterns, mushrooms, fences, and hand-built signposts.
    const well = new T.Group(); well.position.set(-8, terrainHeight(-8, 2), 2); statics.add(well);
    cylinder(well, 1, 1.1, 0.65, 0x8f9280, 0, 0.33, 0, 12); cylinder(well, 0.77, 0.77, 0.02, 0x45696a, 0, 0.67, 0, 12);
    for (const x of [-0.95, 0.95]) box(well, 0.14, 2.3, 0.15, 0x726044, x, 1.4);
    box(well, 2.3, 0.17, 1.8, 0x66563e, 0, 2.55); obstacles.push({ x: -8, z: 2, radius: 1.2 });
    for (let i = 0; i < 8; i++) {
      const x = 5.5 + i * 1.5; const z = -8 + i * 0.13;
      box(statics, 0.14, 1.05, 0.14, 0x8a7951, x, terrainHeight(x, z) + 0.53, z);
      if (i < 7) for (const y of [0.42, 0.86]) box(statics, 1.52, 0.1, 0.1, 0x9a855a, x + 0.75, terrainHeight(x, z) + y, z);
    }
    landmarks.push({ x: -2.8, z: 5.7, name: '장로 엘리온', kind: 'elder' }, { x: -12, z: 0.4, name: '상인 로웬', kind: 'shop' });
  }

  for (let i = 0; i < 38; i++) {
    const x = (rng() - 0.5) * 58; const z = (rng() - 0.5) * 58;
    if (Math.abs(x) < 4 || (village && x < -5 && z < 9 && z > -13)) continue;
    const radius = 0.35 + rng() * 1.6;
    const rock = ico(statics, radius, dark ? 0x667078 : 0x939787, x, terrainHeight(x, z) + 0.2, z, 0); rock.scale.set(1.2, 0.65 + rng() * 0.5, 1);
    if (radius > 1) obstacles.push({ x, z, radius: radius * 0.7 });
  }
  if (dark) {
    for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
      const x = side * 11; const z = 13 - i * 9; const h = 4 + rng() * 2;
      box(statics, 2, 0.5, 2, 0x747d7e, x, 0.25, z);
      cylinder(statics, 0.55, 0.65, h, 0x72767b, x, h / 2 + 0.4, z, 8);
      box(statics, 1.7, 0.4, 1.7, 0x88908c, x, h + 0.4, z); obstacles.push({ x, z, radius: 1 });
      ico(statics, 0.4, zone === 'sanctum' ? 0xbd8cce : 0x80d0cc, x, h + 0.9, z);
    }
    const altar = cylinder(statics, 5, 5.4, 0.3, 0x646373, 0, 0.04, -8, 12);
    altar.rotation.y = 0.13;
  }
  const portal = new T.Group(); const portalZ = -23; portal.position.set(0, terrainHeight(0, portalZ), portalZ); group.add(portal);
  for (const side of [-1, 1]) {
    for (let j = 0; j < 5; j++) box(statics, 1, 0.79, 1.1, j % 2 ? 0x858a76 : 0x959a85, side * 2.2, 0.4 + j * 0.79, portalZ);
    const cap = box(statics, 1.35, 0.55, 1.3, 0x9da08c, side * 1.78, 4.1, portalZ); cap.rotation.z = side * 0.6;
  }
  box(statics, 2.4, 0.58, 1.3, 0xa4a58e, 0, 4.48, portalZ);
  const ring = new T.Mesh(new T.TorusGeometry(1.75, 0.055, 7, 50), new T.MeshBasicMaterial({ color: dark ? 0xbc9ce5 : 0xb9d9bb, transparent: true, opacity: 0.75 })); ring.position.y = 2.1; portal.add(ring);
  const veil = new T.Mesh(new T.CircleGeometry(1.7, 48), new T.MeshBasicMaterial({ color: dark ? 0x8974b8 : 0x82b7a4, transparent: true, opacity: 0.18, side: T.DoubleSide, depthWrite: false })); veil.position.y = 2.1; portal.add(veil);
  const next: Partial<Record<Zone, Zone>> = { village: 'forest', forest: 'plains', plains: 'depths', depths: 'sanctum', sanctum: 'village', harbor: 'wreck', wreck: 'abyss', abyss: 'harbor' };
  landmarks.push({ x: 0, z: portalZ + 2, name: zone === 'sanctum' ? '그린헤이븐으로' : '다음 지역으로', kind: 'portal', destination: next[zone] });
  if (zone === 'forest') for (const id of ['herb', 'camp', 'lyra'] as const) {
    const site = STORY_SITES[id]; landmarks.push({ x: site.x, z: site.z, name: site.name, kind: 'story', storyId: id });
    if (id !== 'lyra') { const page = box(statics, .6, .12, .45, id === 'herb' ? 0x8fa665 : 0xe1ce9b, site.x, terrainHeight(site.x, site.z) + .18, site.z); page.rotation.y = .2; }
  }

  // Thousands of grass blades share one draw call.
  const grassGeo = new T.ConeGeometry(0.07, 0.5, 3); grassGeo.translate(0, 0.22, 0);
  const grass = new T.InstancedMesh(grassGeo, new T.MeshStandardMaterial({ color: dark ? 0x72898b : 0x7c984e, flatShading: true, roughness: 1 }), 4200);
  const dummy = new T.Object3D(); let actual = 0;
  for (let i = 0; i < 6500 && actual < 4200; i++) {
    const x = (rng() - 0.5) * 77; const z = (rng() - 0.5) * 77;
    if (Math.abs(x - (z > 0 ? 1 : 2)) < 2.3 || Math.abs(x + 20 - Math.sin(z * 0.06) * 2) < 3 || (village && x < -4 && z > -12 && z < 8)) continue;
    dummy.position.set(x, terrainHeight(x, z), z); dummy.rotation.set((rng() - 0.5) * 0.4, rng() * 6.28, (rng() - 0.5) * 0.3); dummy.scale.set(0.7 + rng() * 1.5, 0.5 + rng() * 1.1, 1); dummy.updateMatrix(); grass.setMatrixAt(actual, dummy.matrix);
    grass.setColorAt(actual, new T.Color().setHSL(dark ? 0.47 : 0.20 + rng() * 0.05, dark ? 0.16 : 0.35, 0.3 + rng() * 0.18)); actual++;
  }
  grass.count = actual; grass.receiveShadow = true; group.add(grass);
  for (let i = 0; i < 80; i++) {
    const x = (rng() - 0.5) * 38; const z = (rng() - 0.5) * 45;
    if (Math.abs(x) < 3.7) continue;
    const y = terrainHeight(x, z);
    if (i % 3 === 0) { cylinder(statics, 0.035, 0.04, 0.25, 0xcebf9d, x, y + 0.12, z); const cap = ico(statics, 0.17, dark ? 0x97c7c4 : 0xb77955, x, y + 0.26, z, 1); cap.scale.y = 0.45; }
    else { cylinder(statics, 0.015, 0.02, 0.45, 0x567342, x, y + 0.2, z); ico(statics, 0.10, i % 2 ? 0xe2d7a0 : 0xc5b6c9, x, y + 0.47, z); }
  }
  // Distant mountains form a layered horizon beyond the forest.
  for (let i = 0; i < 17; i++) {
    const a = i / 17 * Math.PI * 2; const r = 85 + rng() * 15; const h = 15 + rng() * 30;
    const mountain = mesh(statics, new T.ConeGeometry(16 + rng() * 13, h, 5), dark ? 0x4d5667 : 0x8baba0, Math.sin(a) * r, h / 2 - 6, Math.cos(a) * r);
    mountain.rotation.y = rng() * 6;
  }
  const wind = { value: 0 }; const foliage = new Map<T.Material, T.MeshStandardMaterial>();
  statics.traverse(o => {
    if (!(o instanceof T.Mesh) || !o.userData.foliage || Array.isArray(o.material)) return;
    let animated = foliage.get(o.material);
    if (!animated) {
      animated = (o.material as T.MeshStandardMaterial).clone();
      animated.onBeforeCompile = shader => {
        shader.uniforms.elderWind = wind;
        shader.vertexShader = 'uniform float elderWind;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.x += sin(elderWind * 1.1 + position.x * .35 + position.z * .27) * .08 * smoothstep(2.0, 7.0, position.y);');
      };
      animated.customProgramCacheKey = () => 'elderwood-leaves-v1'; foliage.set(o.material, animated);
    }
    o.material = animated;
  });
  (grass.material as T.MeshStandardMaterial).onBeforeCompile = shader => {
    shader.uniforms.elderWind = wind;
    shader.vertexShader = 'uniform float elderWind;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.x += sin(elderWind * 1.8 + instanceMatrix[3].x * .5 + instanceMatrix[3].z * .3) * max(0.0, position.y) * .18;');
  };
  (grass.material as T.MeshStandardMaterial).customProgramCacheKey = () => 'elderwood-grass-v1';
  batch(statics);
  const particleGeo = new T.BufferGeometry(); const particlePos = new Float32Array(100 * 3);
  for (let i = 0; i < 100; i++) { particlePos[i * 3] = (rng() - 0.5) * 60; particlePos[i * 3 + 1] = 0.5 + rng() * 10; particlePos[i * 3 + 2] = (rng() - 0.5) * 60; }
  particleGeo.setAttribute('position', new T.BufferAttribute(particlePos, 3));
  const particles = new T.Points(particleGeo, new T.PointsMaterial({ color: dark ? 0xb8b1f1 : 0xffe5a5, size: 0.075, transparent: true, opacity: 0.72, depthWrite: false, blending: T.AdditiveBlending })); group.add(particles);
  const env: Environment = { group, obstacles, landmarks, portal, particles, water, dark, grass, grassCount: actual, wind, foliageMaterials: [...foliage.values()] };
  addEndingWorld(env, zone); refreshSkytree(env, finale); return env;
}
export { refreshCoast, refreshSkytree };

export function animateEnvironment(env: Environment, dt: number) {
  env.wind.value += dt; const time = env.wind.value;
  const water = env.water.geometry.attributes.position;
  for (let i = 0; i < water.count; i++) water.setY(i, Math.sin(water.getZ(i) * 2 - time * 1.8) * .035 + Math.sin(water.getX(i) * 1.4 + time) * .025);
  water.needsUpdate = true; env.water.geometry.computeVertexNormals();
  const particles = env.particles.geometry.attributes.position;
  for (let i = 0; i < particles.count; i++) { particles.setY(i, (particles.getY(i) + dt * .13) % 11); particles.setX(i, particles.getX(i) + Math.sin(time * .4 + i) * dt * .04); }
  particles.needsUpdate = true;
  env.portal.children[0].rotation.z = Math.sin(time * .4) * .1;
  (env.portal.children[1] as T.Mesh<T.BufferGeometry, T.MeshBasicMaterial>).material.opacity = .15 + Math.sin(time * 2) * .05;
}

export function disposeEnvironment(env: Environment) {
  env.group.traverse(o => { if (o instanceof T.Mesh || o instanceof T.Points) { o.geometry.dispose(); if (o instanceof T.InstancedMesh) o.dispose(); if (o.material instanceof T.MeshBasicMaterial) o.material.dispose(); } });
  // Shared model materials remain cached; environment-only materials are released.
  for (const child of env.group.children) if ((child instanceof T.Mesh || child instanceof T.Points) && !Array.isArray(child.material)) child.material.dispose();
  env.portal.traverse(o => { if (o instanceof T.Mesh && !Array.isArray(o.material)) o.material.dispose(); });
  env.foliageMaterials.forEach(m => m.dispose());
  env.group.removeFromParent();
}
