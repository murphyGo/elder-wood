import * as T from 'three';
import { box, cylinder, ico, mesh, tree, batch } from './models';
import { terrainHeight, random, type Environment, type Landmark, type Obstacle } from './world';
import { FINAL_SITES, CHOICES, type FinaleState, type FinalSiteId } from './finale-data';
import type { Zone } from './state';

/** Open battle space, readable paths, and a distant tree instead of dense foreground props. */
export function createSkytree(zone: Zone, finale: FinaleState): Environment {
  const ruins = zone === 'ruins', trial = zone === 'trial';
  const group = new T.Group(), statics = new T.Group(); group.add(statics);
  const rng = random(ruins ? 2719 : trial ? 8713 : 6293), obstacles: Obstacle[] = [], landmarks: Landmark[] = [];
  const geo = new T.PlaneGeometry(160, 160, 56, 56); geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position, colors: number[] = [], base = new T.Color(ruins ? 0x879583 : trial ? 0x79798c : 0x827f6b);
  for (let i = 0; i < p.count; i++) {
    p.setY(i, terrainHeight(p.getX(i), p.getZ(i)) - .03);
    const c = base.clone().offsetHSL(0, 0, (rng() - .5) * .05); colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new T.Float32BufferAttribute(colors, 3)); geo.computeVertexNormals();
  const ground = new T.Mesh(geo, new T.MeshStandardMaterial({ vertexColors: true, roughness: 1 })); ground.receiveShadow = true; group.add(ground);
  const waterGeo = new T.PlaneGeometry(120, 150, 6, 40); waterGeo.rotateX(-Math.PI / 2);
  const water = new T.Mesh(waterGeo, new T.MeshStandardMaterial({ color: trial ? 0x646e99 : 0x87adb0, transparent: true, opacity: .8, roughness: .4 })); water.position.set(-81, -.15, 0); group.add(water);
  for (let z = -27; z <= 23; z += 2) box(statics, 3.6, .08, 1.7, z % 4 ? 0xb7b9a2 : 0xc1c2ad, 0, terrainHeight(0, z) + .01, z);
  // The massive tree is beyond the walkable arena; its roots frame, rather than block, the fight.
  if (!trial) {
    const trunk = cylinder(statics, 3.2, 5.3, 25, 0x77765a, 0, 12, -39, 9); trunk.rotation.z = -.1;
    for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
      const branch = cylinder(statics, .45, 1.25, 12, 0x77765a, side * (4 + i), 17 + i * 2, -39 + i * 2, 7); branch.rotation.z = side * -.9;
      const crown = ico(statics, 7 - i * .6, i % 2 ? 0xb2bda0 : 0x9aaa8d, side * (8 + i * 3), 23 + i, -39 + i * 3, 1); crown.scale.y = .45;
      const root = cylinder(statics, .45, 1.7, 17, 0x7d8164, side * (10 + i * 4), 1, -22 - i * 3, 7); root.rotation.set(Math.PI / 2, side * .6, 0);
    }
    const star = mesh(statics, new T.OctahedronGeometry(2), 0xf3dd9b, 0, 19, -36, 0x705c2e); star.scale.set(.6, 1.5, .6);
  }
  for (let i = 0; i < 18; i++) {
    const a = i / 18 * Math.PI * 2, x = Math.sin(a) * 36, z = Math.cos(a) * 38;
    const rock = ico(statics, 3 + rng() * 3, trial ? 0x71718b : 0x8a9488, x, 1.5, z, 0); rock.scale.y = 1.5;
    if (ruins && i % 2 === 0) tree(statics, x, .1, z, .7, true, 1);
  }
  for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
    const x = side < 0 ? -13 : 16, z = 15 - i * 12, h = 3.6 + rng() * 2;
    cylinder(statics, .40, .65, h, trial ? 0xaaa5bb : 0xb3b8a3, x, h / 2, z, 7);
    box(statics, 1.6, .35, 1.6, 0xc4c5ae, x, h, z); ico(statics, .35, trial ? 0xc3b1df : 0xe3d49f, x, h + .55, z);
    obstacles.push({ x, z, radius: .8 });
  }
  if (!ruins) {
    const disk = mesh(statics, new T.RingGeometry(10.5, 11, 64), trial ? 0xb9abc9 : 0xd5c999, 0, .15, -6); disk.rotation.x = -Math.PI / 2;
    const rings = new T.Group(); rings.position.set(0, 10, -26); statics.add(rings);
    for (let i = 0; i < 3; i++) { const ring = mesh(rings, new T.TorusGeometry(3.4 + i * .5, .08, 6, 48), trial ? 0xc5b4d4 : 0xd8c98f); ring.rotation.set(.3 + i * .5, i * .8, 0); }
  }
  const storyViews = new Map<FinalSiteId, T.Group>();
  for (const [id, site] of Object.entries(FINAL_SITES) as [FinalSiteId, typeof FINAL_SITES[FinalSiteId]][]) {
    if (site.zone !== zone) continue;
    landmarks.push({ x: site.x, z: site.z, kind: 'finale', finalId: id, name: site.name });
    if (site.kind === 'ally') continue;
    const view = new T.Group(); view.position.set(site.x, terrainHeight(site.x, site.z), site.z); group.add(view); storyViews.set(id, view);
    cylinder(view, .55, .7, .65, 0xaaa991, 0, .32, 0, 8);
    const rune = new T.Mesh(site.kind === 'switch' ? new T.TorusGeometry(.4, .07, 6, 24) : new T.OctahedronGeometry(site.kind === 'choice' ? .7 : .4), new T.MeshBasicMaterial({ color: id === 'sea_song' || id === 'sea_echo' ? 0xa1d6d1 : 0xe3d39d })); rune.position.y = 1.3; view.add(rune);
  }
  const barrier = new T.Group(), crossing = new T.Group(); group.add(barrier, crossing);
  if (ruins) {
    for (let i = -14; i <= 14; i++) { const root = ico(barrier, 1.25, 0x6c7257, i * 2.2, .35, 0, 0); root.scale.y = 1.1; }
    for (let z = -3; z <= 3; z++) box(crossing, 4.3, .12, .9, 0xd2ca9a, 0, terrainHeight(0, z) + .02, z);
  }
  const blade = new T.ConeGeometry(.07, .46, 3); blade.translate(0, .23, 0);
  const grass = new T.InstancedMesh(blade, new T.MeshStandardMaterial({ color: trial ? 0x9c93b6 : 0xa4b383, roughness: 1 }), 1000), dummy = new T.Object3D();
  let count = 0;
  while (count < 1000) { const x = -12 + rng() * 44, z = -34 + rng() * 65; if (Math.abs(x) < 4 || (ruins && Math.abs(z) < 4)) continue; dummy.position.set(x, terrainHeight(x, z), z); dummy.rotation.y = rng() * 6; dummy.scale.setScalar(.5 + rng()); dummy.updateMatrix(); grass.setMatrixAt(count++, dummy.matrix); }
  group.add(grass); const wind = { value: 0 };
  (grass.material as T.MeshStandardMaterial).onBeforeCompile = shader => { shader.uniforms.elderWind = wind; shader.vertexShader = 'uniform float elderWind;\n' + shader.vertexShader; shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.x += sin(elderWind + instanceMatrix[3].z) * max(0.0, position.y) * .14;'); };
  (grass.material as T.MeshStandardMaterial).customProgramCacheKey = () => 'elderwood-skytree-grass-v1';
  const portal = new T.Group(); portal.position.set(0, terrainHeight(0, ruins ? -26 : 20), ruins ? -26 : 20); group.add(portal);
  const ring = new T.Mesh(new T.TorusGeometry(1.4, .06, 6, 40), new T.MeshBasicMaterial({ color: 0xe0d3a8, transparent: true, opacity: .7 })); ring.position.y = 1.8; portal.add(ring);
  const veil = new T.Mesh(new T.CircleGeometry(1.35, 32), new T.MeshBasicMaterial({ color: 0xbeb996, transparent: true, opacity: .16, depthWrite: false, side: T.DoubleSide })); veil.position.y = 1.8; portal.add(veil);
  landmarks.push({ x: 0, z: portal.position.z, kind: 'portal', destination: ruins ? 'roots' : 'village', name: ruins ? '별의 뿌리로' : trial ? '도전을 마치고 마을로' : '그린헤이븐으로' });
  if (ruins) landmarks.push({ x: -6, z: 22, kind: 'portal', destination: 'village', name: '마을로 돌아가기' });
  const particlesGeo = new T.BufferGeometry(), points = new Float32Array(300);
  for (let i = 0; i < 100; i++) points.set([(rng() - .5) * 55, 1 + rng() * 12, (rng() - .5) * 60], i * 3);
  particlesGeo.setAttribute('position', new T.BufferAttribute(points, 3));
  const particles = new T.Points(particlesGeo, new T.PointsMaterial({ color: trial ? 0xd9c6f1 : 0xffe9ae, size: .06, transparent: true, opacity: .65, depthWrite: false })); group.add(particles); batch(statics);
  const env: Environment = { group, obstacles, landmarks, portal, particles, water, dark: !ruins, grass, grassCount: count, wind, foliageMaterials: [], skytree: { zone, baseObstacles: [...obstacles], barrier, crossing, storyViews } };
  refreshSkytree(env, finale); return env;
}

export function refreshSkytree(env: Environment, finale: FinaleState) {
  const sky = env.skytree;
  if (sky) {
    const open = finale.flags.includes('bridge'); sky.crossing.visible = sky.zone === 'ruins' && open; sky.barrier.visible = sky.zone === 'ruins';
    env.obstacles.splice(0, env.obstacles.length, ...sky.baseObstacles);
    if (sky.zone === 'ruins') {
      for (let i = -14; i <= 14; i++) if (!open || Math.abs(i * 2.2) > 3.5) env.obstacles.push({ x: i * 2.2, z: 0, radius: 1.3 });
      sky.barrier.children.forEach(o => { o.visible = !open || Math.abs(o.position.x) > 3.5; });
    }
    for (const [id, view] of sky.storyViews) { view.visible = finale.step >= FINAL_SITES[id].step; view.scale.setScalar(finale.flags.includes(id) ? .8 : 1); }
  }
  if (env.ending) {
    env.ending.renew.visible = finale.step === 6 && finale.choice === 'renew'; env.ending.release.visible = finale.step === 6 && finale.choice === 'release';
    const monument = env.landmarks.find(l => l.ending);
    if (monument && finale.choice) { monument.name = CHOICES[finale.choice].ending; monument.text = CHOICES[finale.choice].description; }
  }
}

export function addEndingWorld(env: Environment, zone: Zone) {
  if (zone !== 'village' && zone !== 'harbor') return;
  const renew = new T.Group(), release = new T.Group(); renew.name = 'shared-wardstones'; release.name = 'scattered-starlight'; env.group.add(renew, release);
  const x = zone === 'village' ? 6 : 5, z = zone === 'village' ? 7 : 14, y = terrainHeight(x, z);
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2, px = x + Math.sin(a) * 1.3, pz = z + Math.cos(a) * 1.3;
    cylinder(renew, .2, .3, 1, 0xc1b98c, px, y + .5, pz, 6); mesh(renew, new T.OctahedronGeometry(.22), 0xf1d58c, px, y + 1.2, pz, 0x66531f);
  }
  for (let i = 0; i < 32; i++) {
    const a = i * 2.4, r = .4 + i % 7 * .33, px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r;
    cylinder(release, .02, .025, .36, 0x789772, px, y + .18, pz, 4);
    const flower = ico(release, .13, i % 2 ? 0xbde2cc : 0xd5d7ef, px, y + .40, pz, 0); flower.scale.y = .5;
  }
  batch(renew); batch(release); env.ending = { renew, release };
  env.landmarks.push({ x, z, kind: 'resident', name: '새벽의 약속', ending: true, text: '' });
}
