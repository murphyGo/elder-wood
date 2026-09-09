import * as T from 'three';
import { box, cylinder, ico, mesh, house, batch } from './models';
import { terrainHeight, random, type Environment, type Landmark, type Obstacle } from './world';
import { STORY_SITES, type JourneyState, type StoryId } from './journey-data';
import type { Zone } from './state';

/** Coastal scenes share the same combat coordinates and renderer profiles as the forest. */
export function createCoast(zone: Zone, journey: JourneyState): Environment {
  const harbor = zone === 'harbor', wreck = zone === 'wreck', dark = zone === 'abyss';
  const group = new T.Group(), statics = new T.Group(); group.add(statics);
  const rng = random(harbor ? 641 : wreck ? 834 : 937); const obstacles: Obstacle[] = [], landmarks: Landmark[] = [];
  const geo = new T.PlaneGeometry(160, 160, 72, 72); geo.rotateX(-Math.PI / 2);
  const positions = geo.attributes.position, colors: number[] = [];
  const sand = new T.Color(dark ? 0x516777 : wreck ? 0xaaa28a : 0xcbbd95);
  for (let i = 0; i < positions.count; i++) { const x = positions.getX(i), z = positions.getZ(i); positions.setY(i, terrainHeight(x, z) - (x < -17 ? .7 : .02)); const color = sand.clone().offsetHSL(0, 0, (rng() - .5) * .055); colors.push(color.r, color.g, color.b); }
  geo.setAttribute('color', new T.Float32BufferAttribute(colors, 3)); geo.computeVertexNormals();
  const ground = new T.Mesh(geo, new T.MeshStandardMaterial({ vertexColors: true, roughness: 1 })); ground.receiveShadow = true; group.add(ground);
  const oceanGeo = new T.PlaneGeometry(130, 180, 12, 60); oceanGeo.rotateX(-Math.PI / 2);
  const water = new T.Mesh(oceanGeo, new T.MeshStandardMaterial({ color: dark ? 0x234656 : 0x548d96, roughness: .3, metalness: .25, transparent: true, opacity: .88 })); water.position.set(-82, -.12, 0); group.add(water);
  for (let i = 0; i < 44; i++) {
    const z = (rng() - .5) * 100; const stone = ico(statics, .35 + rng() * .6, dark ? 0x627688 : 0x969c94, -17 + Math.sin(z * .06) * 2, .05, z, 1); stone.scale.y = .5;
  }
  // Sparse dune grass and sea lavender, kept away from every interaction and the crossing.
  const blade = new T.ConeGeometry(.07, .48, 3); blade.translate(0, .24, 0);
  const grass = new T.InstancedMesh(blade, new T.MeshStandardMaterial({ color: dark ? 0x697f93 : 0x859b78, roughness: 1 }), 800);
  const dummy = new T.Object3D(); let count = 0;
  while (count < 800) { const x = -12 + rng() * 47, z = -34 + rng() * 70; if (Math.abs(x) < 3 || (wreck && Math.abs(z) < 6)) continue; dummy.position.set(x, terrainHeight(x, z), z); dummy.rotation.y = rng() * 6; dummy.scale.setScalar(.5 + rng()); dummy.updateMatrix(); grass.setMatrixAt(count++, dummy.matrix); }
  group.add(grass);
  const wind = { value: 0 };
  (grass.material as T.MeshStandardMaterial).onBeforeCompile = shader => { shader.uniforms.elderWind = wind; shader.vertexShader = 'uniform float elderWind;\n' + shader.vertexShader; shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.x += sin(elderWind * 1.8 + instanceMatrix[3].z) * max(0.0, position.y) * .16;'); };
  (grass.material as T.MeshStandardMaterial).customProgramCacheKey = () => 'elderwood-coastal-grass-v1';
  const lighthouse = new T.Group(), beacon = new T.Group(); lighthouse.add(beacon); statics.add(lighthouse);
  const towerX = harbor ? 15 : 0, towerZ = harbor ? -15 : -29;
  lighthouse.position.set(towerX, terrainHeight(towerX, towerZ), towerZ);
  cylinder(lighthouse, 1.05, 1.6, 7, dark ? 0x748691 : 0xd4ccb7, 0, 3.5, 0, 12);
  for (const y of [1.3, 4.8]) cylinder(lighthouse, 1.35 - y * .035, 1.37 - y * .035, .35, 0x567b7d, 0, y, 0, 12);
  cylinder(lighthouse, 1.35, 1.35, .25, 0x625d50, 0, 7.05, 0, 12);
  cylinder(lighthouse, 1.25, 0, .8, 0x4d6571, 0, 8.5, 0, 8);
  for (const side of [-1, 1]) for (const z of [-.8, .8]) cylinder(lighthouse, .07, .07, 1.0, 0x566a68, side * .8, 7.65, z, 6);
  const lamp = new T.Mesh(new T.IcosahedronGeometry(.65, 1), new T.MeshBasicMaterial({ color: 0xffdf9a })); lamp.position.y = 7.7; beacon.add(lamp);
  const halo = new T.Mesh(new T.SphereGeometry(1, 14, 8), new T.MeshBasicMaterial({ color: 0xf7d99b, transparent: true, opacity: .16, depthWrite: false })); halo.position.y = 7.7; beacon.add(halo);
  // The light stays dynamic so the solved puzzle visibly changes both coastal regions.
  lighthouse.remove(beacon); beacon.position.copy(lighthouse.position); group.add(beacon); obstacles.push({ x: towerX, z: towerZ, radius: 1.6 });
  function boat(x: number, z: number, scale: number, broken = false) {
    const boat = new T.Group(); boat.position.set(x, terrainHeight(x, z) + .15, z); boat.scale.setScalar(scale); boat.rotation.y = broken ? -.4 : Math.PI / 2; statics.add(boat);
    const hull = mesh(boat, new T.SphereGeometry(1, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), broken ? 0x5d5149 : 0x6d6350); hull.scale.set(1.7, 1, 3.4); hull.position.y = .7;
    for (let i = 0; i < 10; i++) if (!broken || i % 4) box(boat, 2.7, .10, .36, i % 2 ? 0x9d8968 : 0x8c795e, 0, .6, -1.8 + i * .4);
    const mast = cylinder(boat, .10, .16, broken ? 3.5 : 6, 0x5e5347, 0, broken ? 2.2 : 3.6, -.3); mast.rotation.z = broken ? .4 : 0;
    if (!broken) { const sail = mesh(boat, new T.PlaneGeometry(2.7, 3), 0xd8cfb1, .4, 4, -.26); sail.material = new T.MeshStandardMaterial({ color: 0xd8cfb1, side: T.DoubleSide, roughness: 1 }); ownedMaterials.push(sail.material); }
  }
  const ownedMaterials: T.Material[] = [];
  if (harbor) {
    house(statics, -7, terrainHeight(-7, -8), -8, .9, .1); obstacles.push({ x: -7, z: -8, radius: 2.4 });
    house(statics, 9, terrainHeight(9, -7), -7, .85, -.25); obstacles.push({ x: 9, z: -7, radius: 2.2 });
    for (let i = 0; i < 28; i++) box(statics, .48, .16, 4.3, i % 2 ? 0xa08b69 : 0x8d7b5f, -13 - i * .46, .24, 8);
    for (const z of [5.9, 10.1]) for (let i = 0; i < 7; i++) cylinder(statics, .1, .14, 1.0, 0x76664e, -13 - i * 2, .45, z);
    boat(-24, 0, .8); boat(-29, 17, .7);
    for (const x of [-13, 3, 12]) { cylinder(statics, .04, .07, 2.2, 0x5f675b, x, 1.1, 13); ico(statics, .18, 0xe2cb8d, x, 2.3, 13); }
    landmarks.push({ x: -3, z: 15, name: '항구 보급상 로웬', kind: 'shop' }, { x: 5, z: 21, name: '강 상류로', kind: 'portal', destination: 'village' });
  } else if (wreck) {
    boat(13, -15, 1.7, true); boat(-14, -22, 1.2, true);
    // Broad wreckage stays outside the central path and both rescue positions.
    obstacles.push({ x: 14, z: -15, radius: 2.5 }, { x: -14, z: -22, radius: 2 });
    for (let i = 0; i < 22; i++) { const x = 8 + rng() * 9, z = -24 + rng() * 15; const plank = box(statics, .2, .16, 1.6, 0x817359, x, .15, z); plank.rotation.y = rng() * 6; }
    landmarks.push({ x: -6, z: 19, name: '항구로 돌아가기', kind: 'portal', destination: 'harbor' });
  } else {
    cylinder(statics, 13, 14, .15, 0x6a7f88, 0, -.08, -6, 24);
    for (let i = 0; i < 10; i++) { const angle = i / 10 * Math.PI * 2, x = Math.sin(angle) * 22, z = Math.cos(angle) * 22 - 3; cylinder(statics, .45, .7, 4, 0x657687, x, 2, z, 6); const coral = ico(statics, .6, 0x9b94bb, x, 4.3, z, 1); coral.scale.y = 1.8; obstacles.push({ x, z, radius: .8 }); }
  }
  const storyViews = new Map<StoryId, T.Group>();
  for (const [id, site] of Object.entries(STORY_SITES) as [StoryId, typeof STORY_SITES[StoryId]][]) {
    if (site.zone !== zone) continue;
    landmarks.push({ x: site.x, z: site.z, name: site.name, kind: 'story', storyId: id });
    if (site.kind === 'npc' || site.kind === 'rescue' || site.kind === 'workshop') continue;
    const object = new T.Group(); object.position.set(site.x, terrainHeight(site.x, site.z), site.z); group.add(object); storyViews.set(id, object);
    if (site.kind === 'rune') {
      cylinder(object, .5, .65, 1.3, 0x8a9b9c, 0, .65, 0, 8);
      const symbol = new T.Mesh(id === 'star' ? new T.OctahedronGeometry(.3) : id === 'moon' ? new T.TorusGeometry(.24, .07, 5, 20, Math.PI * 1.6) : new T.SphereGeometry(.25, 7, 5), new T.MeshBasicMaterial({ color: 0xb4dadb })); symbol.position.set(0, 1.25, .45); object.add(symbol);
    } else if (site.kind === 'tide') {
      cylinder(object, .35, .5, .9, 0x819494, 0, .45, 0, 8); const wheel = mesh(object, new T.TorusGeometry(.65, .08, 6, 20), 0xb1a273, 0, 1.1, 0); wheel.rotation.x = -.3;
      for (let i = 0; i < 4; i++) { const spoke = box(object, 1.2, .06, .07, 0xb1a273, 0, 1.1); spoke.rotation.z = i * Math.PI / 4; }
    } else if (site.kind === 'chest') { box(object, .9, .65, .6, 0x887455, 0, .35); for (const x of [-.3, .3]) box(object, .08, .7, .65, 0xb4a16f, x, .36); }
    else if (site.kind === 'memory') { const gem = mesh(object, new T.OctahedronGeometry(.65), 0xa4dcdb, 0, 1.4, 0, 0x668b8a); gem.rotation.z = .25; }
    else { box(object, .7, .15, .6, site.kind === 'clue' && id === 'shard' ? 0x9b91b8 : 0xe0cfab, 0, .25); cylinder(object, .025, .035, .7, 0x9e8e60, .4, .4); }
  }
  const portal = new T.Group(); portal.position.set(wreck ? 12 : 0, .15, dark ? 20 : -26); group.add(portal);
  const ring = new T.Mesh(new T.TorusGeometry(1.2, .05, 6, 40), new T.MeshBasicMaterial({ color: 0xa6d7cf, transparent: true, opacity: .7 })); ring.position.y = 1.6; portal.add(ring);
  const veil = new T.Mesh(new T.CircleGeometry(1.15, 32), new T.MeshBasicMaterial({ color: 0x77b1b6, transparent: true, opacity: .15, side: T.DoubleSide, depthWrite: false })); veil.position.y = 1.6; portal.add(veil);
  landmarks.push({ x: portal.position.x, z: portal.position.z, name: dark ? '항구행 물길' : wreck ? '제단으로 열린 길' : '난파선행 나루', kind: 'portal', destination: harbor ? 'wreck' : wreck ? 'abyss' : 'harbor' });
  const barrier = new T.Group(), crossing = new T.Group(); group.add(barrier, crossing);
  const tideWater = new T.Mesh(new T.PlaneGeometry(66, 6), new T.MeshStandardMaterial({ color: 0x54818a, transparent: true, opacity: .9, roughness: .3 })); tideWater.rotation.x = -Math.PI / 2; tideWater.position.y = .30; group.add(tideWater); tideWater.visible = wreck;
  if (wreck) {
    for (let i = -14; i <= 14; i++) { const rock = ico(barrier, 1.1, 0x8d9894, i * 2.2, -.25, 0); rock.scale.y = .35; }
    for (let z = -4; z <= 4; z++) box(crossing, 4.4, .12, .92, 0xb4b5a4, 0, terrainHeight(0, z) + .01, z);
  }
  const particleGeo = new T.BufferGeometry(); const pp = new Float32Array(300);
  for (let i = 0; i < 100; i++) pp.set([(rng() - .5) * 55, rng() * 9 + 1, (rng() - .5) * 60], i * 3);
  particleGeo.setAttribute('position', new T.BufferAttribute(pp, 3));
  const particles = new T.Points(particleGeo, new T.PointsMaterial({ color: 0xd6eeed, size: .05, transparent: true, opacity: .6, depthWrite: false })); group.add(particles);
  batch(statics);
  const env: Environment = { group, obstacles, landmarks, portal, particles, water, dark, grass, grassCount: count, wind, foliageMaterials: ownedMaterials, coast: { zone, baseObstacles: [...obstacles], barrier, crossing, tideWater, beacon, storyViews } };
  refreshCoast(env, journey); return env;
}

export function refreshCoast(env: Environment, journey: JourneyState) {
  const coast = env.coast; if (!coast) return;
  coast.beacon.visible = journey.flags.includes('beacon');
  coast.crossing.visible = coast.zone === 'wreck' && journey.tide === 'low'; coast.barrier.visible = coast.zone === 'wreck';
  coast.tideWater.position.y = journey.tide === 'low' ? -.25 : .3;
  env.obstacles.splice(0, env.obstacles.length, ...coast.baseObstacles);
  if (coast.zone === 'wreck') {
    for (let i = -14; i <= 14; i++) if (journey.tide === 'high' || Math.abs(i * 2.2) > 3.5) env.obstacles.push({ x: i * 2.2, z: 0, radius: 1.2 });
    coast.barrier.children.forEach(o => { o.visible = journey.tide === 'high' || Math.abs(o.position.x) > 3.5; });
  }
  for (const [id, view] of coast.storyViews) {
    if (['net', 'log', 'shard', 'chart', 'wood_cache', 'iron_cache', 'memory'].includes(id)) view.scale.setScalar(journey.flags.includes(id) ? .7 : 1);
    if (['shell', 'moon', 'star'].includes(id)) {
      const symbol = view.children[1] as T.Mesh<T.BufferGeometry, T.MeshBasicMaterial>;
      symbol.material.color.set(journey.flags.includes('beacon') || journey.runes.includes(id as 'shell' | 'moon' | 'star') ? 0xffe4a1 : 0xb4dadb);
    }
  }
}
