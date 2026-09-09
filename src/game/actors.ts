import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, ico, cylinder, mesh, material } from './primitives';
import { ITEMS, STARTER_ITEMS, type Weapon, type ItemId } from './catalog';
import type { Species } from './state';

const surfaces = new Map<string, T.MeshStandardMaterial>();
function surface(color: number, metallic = false, glow = false) {
  const key = `${color}:${metallic}:${glow}`;
  if (!surfaces.has(key)) surfaces.set(key, new T.MeshStandardMaterial({ color, roughness: metallic ? .35 : .82, metalness: metallic ? .62 : 0, flatShading: false, emissive: glow ? color : 0, emissiveIntensity: glow ? .45 : 0 }));
  return surfaces.get(key)!;
}
function ellipsoid(parent: T.Object3D, color: number, x: number, y: number, z: number, sx: number, sy: number, sz: number) {
  const m = new T.Mesh(new T.SphereGeometry(1, 12, 8), surface(color)); m.position.set(x,y,z); m.scale.set(sx,sy,sz); m.castShadow = m.receiveShadow = true; parent.add(m); return m;
}
function joint(parent: T.Object3D, name: string, x=0,y=0,z=0) { const g=new T.Group();g.name=name;g.position.set(x,y,z);parent.add(g);return g; }
function link(parent: T.Object3D, a: number[], b: number[], radius: number, color: number, metallic=false) {
  const from=new T.Vector3(...a),to=new T.Vector3(...b),delta=to.clone().sub(from);
  const m=cylinder(parent,radius*.7,radius,delta.length(),color);m.position.copy(from.add(to).multiplyScalar(.5));m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());if(metallic)m.material=surface(color,true);return m;
}
function curve(parent: T.Object3D, points: number[][], color: number, radius: number) {
  return mesh(parent,new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),12,radius,5,false),color);
}
/** Merge only the direct static meshes of each pivot, retaining all articulated joints. */
function bake(root: T.Group) {
  for(const child of [...root.children])if(child instanceof T.Group)bake(child);
  const sets=new Map<T.Material,T.Mesh[]>();
  for(const child of root.children)if(child instanceof T.Mesh && !Array.isArray(child.material) && !child.userData.dynamic){ if(!sets.has(child.material))sets.set(child.material,[]);sets.get(child.material)!.push(child); }
  for(const [mat,list] of sets){if(list.length<2)continue;const geometries=list.map(m=>{m.updateMatrix();const g=m.geometry.clone().applyMatrix4(m.matrix);g.deleteAttribute('uv');const n=g.index?g.toNonIndexed():g;if(n!==g)g.dispose();return n;});const combined=mergeGeometries(geometries);geometries.forEach(g=>g.dispose());if(!combined)continue;for(const m of list){m.geometry.dispose();m.removeFromParent();}const m=new T.Mesh(combined,mat);m.castShadow=m.receiveShadow=true;root.add(m);}
}
export interface HumanRig { body:T.Group; legs:T.Group[]; knees:T.Group[]; arms:T.Group[]; elbows:T.Group[]; cape:T.Group; head:T.Group; hand:T.Group; armor:T.Group; shoulderArmor:T.Group[]; weapon?:T.Group; stride:number; motion:number; landing:number }
export function character(npc=false, cloak=0x9b5141) {
  const root=new T.Group(); root.name=npc?'elder':'traveler'; const body=joint(root,'body');
  const legs:T.Group[]=[],knees:T.Group[]=[],arms:T.Group[]=[],elbows:T.Group[]=[],shoulderArmor:T.Group[]=[];
  const cloth=0x536a5c,leather=0x493a2b,skin=0xd8ad83;
  for(const side of [-1,1]){
    const leg=joint(body,`hip-${side}`,side*.17,.93,0);cylinder(leg,.145,.115,.42,cloth,0,-.2);const knee=joint(leg,`knee-${side}`,0,-.4,.01);
    cylinder(knee,.12,.105,.37,leather,0,-.17);ellipsoid(knee,0x352d26,0,-.4,.09,.145,.13,.24);cylinder(knee,.135,.13,.12,0x786041,0,-.04);legs.push(leg);knees.push(knee);
  }
  ellipsoid(body,cloth,0,1.29,0,.34,.42,.22);cylinder(body,.33,.38,.26,cloth,0,1.0,0,10);cylinder(body,.35,.35,.10,leather,0,1.0,0,10);
  const buckle=box(body,.14,.11,.06,0xc6a15b,0,.99,.23);buckle.material=surface(0xc6a15b,true);
  link(body,[-.24,1.59,.18],[.21,1.02,.25],.036,leather);ellipsoid(body,0x7a5840,.30,1.00,-.04,.12,.17,.12);
  const cape=joint(body,'cape',0,1.62,-.27);const shape=new T.Shape();shape.moveTo(-.3,0);shape.quadraticCurveTo(-.38,-.55,-.48,-1.17);shape.lineTo(-.18,-1.28);shape.lineTo(.04,-1.20);shape.lineTo(.32,-1.25);shape.lineTo(.48,-1.13);shape.quadraticCurveTo(.37,-.55,.3,0);shape.closePath();
  const capeMesh=mesh(cape,new T.ExtrudeGeometry(shape,{depth:.035,bevelEnabled:false}),cloak);capeMesh.rotation.x=.16;
  for(const x of [-.22,0,.22])curve(cape,[[x,-.12,.03],[x*1.3,-.65,.06],[x*1.5,-1.13,.17]],0x7b3e36,.011);
  cylinder(body,.1,.11,.2,skin,0,1.72);const head=joint(body,'head',0,1.96,0);
  ellipsoid(head,skin,0,0,.01,.245,.29,.215);ellipsoid(head,0xe1b890,0,-.04,.213,.062,.085,.065);
  for(const side of [-1,1]){
    ellipsoid(head,skin,side*.24,0,0,.06,.09,.045);ellipsoid(head,0xeee5ce,side*.093,.035,.196,.064,.045,.025);
    ellipsoid(head,0x34352b,side*.093,.035,.217,.026,.034,.014);ellipsoid(head,0xffffff,side*.10,.048,.229,.008,.011,.006);
    const brow=box(head,.105,.025,.028,0x443b2a,side*.095,.106,.21);brow.rotation.z=side*.1;
  }
  curve(head,[[-.07,-.145,.198],[0,-.153,.215],[.07,-.145,.198]],0x966b55,.011);
  const hair=ellipsoid(head,npc?0xcfc9b5:0x343c31,0,.18,-.025,.258,.19,.23);
  for(let i=0;i<5;i++){const lock=ico(head,.085,npc?0xcfc9b5:0x343c31,-.18+i*.085,.16,.15,1);lock.scale.set(.75,1.3,.7);}
  if(npc){const beard=ellipsoid(head,0xd2c9b4,0,-.18,.14,.18,.20,.10);beard.rotation.x=-.25;}
  else {ellipsoid(head,0x343c31,0,.03,-.16,.235,.21,.11);}
  void hair;
  for(const side of [-1,1]){
    const arm=joint(body,`shoulder-${side}`,side*.405,1.55,0);ellipsoid(arm,cloth,0,-.18,0,.14,.26,.14);
    const elbow=joint(arm,`elbow-${side}`,0,-.39,0);cylinder(elbow,.115,.095,.29,leather,0,-.135);cylinder(elbow,.123,.119,.065,0x94794b,0,-.02);
    ellipsoid(elbow,skin,0,-.315,.015,.103,.125,.085);ellipsoid(elbow,skin,side*.071,-.285,.052,.04,.069,.035);
    arms.push(arm);elbows.push(elbow);shoulderArmor.push(joint(arm,'pauldron',0,-.03,0));
  }
  const hand=joint(elbows[0],'weapon-grip',0,-.33,.035);const armor=joint(body,'armor');
  root.userData={body,legs,knees,arms,elbows,cape,head,hand,armor,shoulderArmor,stride:0,motion:0,landing:0} satisfies HumanRig;
  if(npc){cylinder(hand,.04,.06,2.4,0x6e5135,0,.5);ico(hand,.14,0xb5d1a6,0,1.74,0,1);}
  bake(root);dressArmor(root,0);return root;
}
export function dressArmor(root:T.Group,tier:number){
  const rig=root.userData as HumanRig;
  for(const group of [rig.armor,...rig.shoulderArmor]){group.traverse(o=>{if(o instanceof T.Mesh)o.geometry.dispose();});group.clear();}
  if(!tier)return;
  const colors=[0,0x886542,0x94a5a1,0xc8b88c],color=colors[tier];
  const cuirass=ellipsoid(rig.armor,color,0,1.34,.015,.355,.34,.24);cuirass.material=surface(color,tier>=2);
  for(const side of [-1,1]){link(rig.armor,[side*.23,1.59,.15],[side*.20,1.08,.20],.035,tier===3?0xebd69a:0x594834,tier>=2);const shoulder=ellipsoid(rig.shoulderArmor[(side+1)/2],color,0,-.03,0,.21,.145,.20);shoulder.material=surface(color,tier>=2);if(tier>=2)cylinder(rig.shoulderArmor[(side+1)/2],.19,.20,.05,0x635641,0,-.1);}
  if(tier===3){const badge=mesh(rig.armor,new T.OctahedronGeometry(.105),0xbcdcb9,0,1.44,.263);badge.material=surface(0xa9cfa7,false,true);for(let i=0;i<3;i++)box(rig.armor,.39-i*.05,.03,.06,0xdbc38c,0,1.24-i*.09,.235);}
  else if(tier===2)for(let row=0;row<3;row++)for(let col=0;col<4;col++){const stud=ico(rig.armor,.025,0xd2d9cb,(col-1.5)*.1,1.43-row*.09,.255);stud.material=surface(0xd2d9cb,true);}
  bake(rig.armor);rig.shoulderArmor.forEach(bake);
}
export function weaponModel(type:Weapon,id:ItemId=STARTER_ITEMS[type]){
  const item=ITEMS[id],g=new T.Group();g.name=id;const unique=item.effect!=='none',accent=new T.Color(item.color).getHex();const steel=type==='sword'&&id==='ember_sword'?0xb99b7b:0xc3d2cd;
  if(type==='sword'){
    const outline=new T.Shape();outline.moveTo(-.065,.16);outline.lineTo(-.11,unique?1.22:1.14);outline.lineTo(0,unique?1.58:1.48);outline.lineTo(.11,unique?1.22:1.14);outline.lineTo(.065,.16);outline.closePath();
    const blade=new T.Mesh(new T.ExtrudeGeometry(outline,{depth:.055,bevelEnabled:true,bevelSize:.013,bevelThickness:.008,bevelSegments:1,steps:1}),surface(steel,true));blade.position.z=-.025;blade.castShadow=true;g.add(blade);
    link(g,[0,.23,.04],[0,1.26,.04],.013,unique?accent:0xebede1,true);
    const guard=box(g,id==='ward_sword'?.63:.46,.09,.13,0xb79a57,0,.10);guard.material=surface(0xb79a57,true);for(const side of [-1,1]){const quillon=ico(g,.085,unique?accent:0xb79a57,side*(id==='ward_sword'?.3:.21),.12,0,1);quillon.scale.y=.5;}
    cylinder(g,.055,.06,.35,0x43332a,0,-.11);for(let i=0;i<5;i++)cylinder(g,.062,.062,.024,0x806a44,0,-.25+i*.06);ico(g,.10,unique?accent:0xb49a5d,0,-.32,0,1);
    if(id==='ember_sword')for(let i=0;i<4;i++){const rune=box(g,.027,.08,.01,accent,(i%2?1:-1)*.025,.5+i*.18,.056);rune.rotation.z=.35;rune.material=surface(accent,false,true);}
    if(id==='ward_sword'){const stone=mesh(g,new T.OctahedronGeometry(.105),accent,0,.11,.11);stone.material=surface(accent,false,true);}
  }else if(type==='spear'){
    cylinder(g,.032,.05,2.7,0x6a4931,0,.28);for(const y of [-.55,-.32,.05,1.5]){const band=cylinder(g,.057,.057,.13,0xb29452,0,y);band.material=surface(0xb29452,true);}
    const head=mesh(g,new T.ConeGeometry(id==='dragon_spear'?.18:.13,.67,4),steel,0,1.95);head.material=surface(steel,true);head.scale.z=.48;
    if(unique){for(const side of [-1,1]){const barb=mesh(g,new T.ConeGeometry(.07,.39,4),accent,side*.12,1.70);barb.rotation.z=side*-.4;barb.material=surface(accent,true);}}
    if(id==='earth_spear')curve(g,[[.05,.55,0],[.10,.88,.02],[.05,1.18,.04],[-.05,1.38,0]],0x7d934e,.026);
    if(id==='dragon_spear'){for(let i=0;i<3;i++)mesh(g,new T.OctahedronGeometry(.09),accent,0,1.30+i*.12,0);}
  }else{
    curve(g,[[0,-.95,0],[0,-.68,.28],[0,0,.34],[0,.68,.28],[0,.95,0]],id==='frost_bow'?0x638d99:id==='storm_bow'?0x4e6677:0x8b6139,.055);
    const string=new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(0,-.94,0),new T.Vector3(0,0,0),new T.Vector3(0,.94,0)]),new T.LineBasicMaterial({color:unique?accent:0xe4d9af}));g.add(string);g.userData.string=string;g.position.z=-.30;
    box(g,.09,.32,.11,0x44382d,0,0,.33);
    for(const sign of [-1,1]){link(g,[0,sign*.36,.33],[0,sign*.60,.29],.075,unique?accent:0xc0a465,true);if(unique){const ornament=mesh(g,new T.OctahedronGeometry(.13),accent,0,sign*.76,.20);ornament.scale.set(.5,1.4,.7);ornament.material=surface(accent,false,true);}}
    const arrow=joint(g,'nocked-arrow');link(arrow,[0,0,-.42],[0,0,.70],.014,0xcbb68d);const tip=mesh(arrow,new T.ConeGeometry(.045,.13,4),0xd7e1d3,0,0,.75);tip.rotation.x=Math.PI/2;g.userData.arrow=arrow;
  }
  bake(g);return g;
}

export interface AnimalRig {body:T.Group;legs:T.Group[];knees:T.Group[];head:T.Group;neck:T.Group;jaw:T.Group;tail:T.Group;wings:T.Group[];ears:T.Group[];stride:number;motion:number;altitude:number;species:Species}
export function animal(type:Species){
  const root=new T.Group();root.name=type;const body=joint(root,'body');const small=type==='squirrel'||type==='rabbit',dragon=type==='dragon',aquatic=type==='shark';
  const colors:Record<Species,number>={squirrel:0xa96635,rabbit:0xe3ddc9,cow:0x927250,horse:0x725043,hippo:0x7e8c8c,tiger:0xd19744,shark:0x527c8b,dragon:0x465663};const color=colors[type];
  const y=small?.43:type==='horse'?1.03:dragon?.88:.7;
  const width=small?.27:type==='hippo'?.62:type==='horse'?.37:.45, height=small?.29:type==='hippo'?.52:.47, length=small?.46:type==='hippo'?.87:dragon?1.02:.76;
  ellipsoid(body,color,0,y,0,width,height,length);ellipsoid(body,dragon?0xa69c78:aquatic?0xc0d1c7:small?0xe0c7a1:type==='tiger'?0xe8d1a0:color,0,y-.14,.12,width*.88,height*.62,length*.86);
  const neck=joint(body,'neck',0,y+.10,length*.54);
  if(type==='horse'){ellipsoid(neck,color,0,.31,.05,.25,.52,.29);neck.rotation.x=.15;for(let i=0;i<6;i++){const mane=ico(neck,.12,0x302d2a,0,.06+i*.13,-.15,1);mane.scale.set(.5,1.15,1.3);}}
  if(dragon){ellipsoid(neck,color,0,.24,.19,.28,.49,.30);for(let i=0;i<3;i++)ellipsoid(neck,0xb5a682,0,.13+i*.18,.38,.20,.09,.075);}
  const head=joint(neck,'head',0,type==='horse'?.73:dragon?.64:small?.21:.25,type==='horse'?.21:dragon?.47:small?.13:.24);
  ellipsoid(head,color,0,0,0,small?.25:type==='hippo'?.49:.31,small?.25:type==='hippo'?.31:.32,small?.26:.36);
  const muzzleColor=type==='tiger'?0xebd6b5:type==='cow'?0xbc9c7e:type==='hippo'?0x97a3a0:color;
  const muzzleZ=small?.23:dragon?.39:.33;ellipsoid(head,muzzleColor,0,-.11,muzzleZ,small?.15:type==='hippo'?.49:.27,small?.11:type==='hippo'?.24:.18,small?.17:type==='horse'?.33:.24);
  const jaw=joint(head,'jaw',0,-.16,.09);ellipsoid(jaw,dragon?0x89917c:muzzleColor,0,-.025,.27,small?.12:type==='hippo'?.44:.24,.08,small?.17:.29);
  const eyesX=small?.17:type==='hippo'?.34:.25;
  for(const side of [-1,1]){
    ellipsoid(head,0xe7d9b4,side*eyesX,.083,.20,small?.06:.076,.061,.040);ellipsoid(head,dragon?0xebbd65:0x282d28,side*eyesX,.084,.233,small?.035:.043,.045,.020);ellipsoid(head,0xfff7df,side*eyesX-.008,.098,.25,.012,.014,.008);
    if(!small){ellipsoid(head,0x393c34,side*(type==='hippo'?.28:.13),-.055,muzzleZ+.21,.04,.026,.026);}
    if(type==='tiger'){for(let i=0;i<3;i++)link(head,[side*.13,-.12,.5],[side*(.36+i*.04),-.10-i*.045,.47],.008,0xe8ddbe);}
  }
  if(small)ellipsoid(head,0x775849,0,-.07,.385,.043,.03,.025);
  const ears:T.Group[]=[];
  if(!aquatic)for(const side of [-1,1]){const ear=joint(head,`ear-${side}`,side*(small?.15:.25),small?.21:.25,-.06);const rabbit=type==='rabbit';ellipsoid(ear,color,0,rabbit?.25:.03,0,rabbit?.085:.105,rabbit?.32:.13,.075);ellipsoid(ear,rabbit?0xcdaca0:0xaf8b75,0,rabbit?.27:.04,.059,rabbit?.042:.06,rabbit?.23:.075,.02);ear.rotation.z=side*-.22;ears.push(ear);}
  if(type==='cow'||dragon)for(const side of [-1,1]){curve(head,[[side*.24,.19,-.13],[side*.43,.33,-.20],[side*.51,.56,-.30]],0xd7c596,.07);}
  if(dragon||type==='hippo'||type==='shark')for(const side of [-1,1])for(let i=0;i<(dragon?3:2);i++){const tooth=mesh(jaw,new T.ConeGeometry(.04,.15,5),0xe4d8b8,side*(type==='hippo'?.32:.15),.06,.35+i*.075);if(type==='shark')tooth.rotation.x=Math.PI;}
  const legs:T.Group[]=[],knees:T.Group[]=[];
  if(!aquatic)for(const x of [-1,1])for(const z of [-1,1]){
    const h=small?.32:type==='horse'?.85:dragon?.76:.53;const leg=joint(body,`leg-${x}-${z}`,x*width*.76,y-.08,z*length*.64);const thick=small?.083:type==='hippo'?.17:.12;
    ellipsoid(leg,color,0,-h*.23,0,thick,h*.36,thick*1.2);const knee=joint(leg,'knee',0,-h*.47,0);cylinder(knee,thick*.7,thick*.65,h*.43,color,0,-h*.19);
    ellipsoid(knee,type==='cow'||type==='horse'?0x363633:color,0,-h*.46,.06,thick*1.2,.09,thick*1.65);
    if(dragon||type==='tiger')for(const toe of [-1,0,1]){const claw=mesh(knee,new T.ConeGeometry(.026,.13,4),0xd8c9a8,toe*.05,-h*.44,.20);claw.rotation.x=Math.PI/2;}
    legs.push(leg);knees.push(knee);
  }
  const tail=joint(body,'tail',0,y-.01,-length*.83);
  if(type==='squirrel'){curve(tail,[[0,0,0],[0,.38,-.35],[0,.92,-.33],[0,1.09,-.05]],0x975d32,.19);ellipsoid(tail,0xb8793d,0,.73,-.26,.25,.48,.27);ellipsoid(tail,0xd6ab78,0,.77,-.06,.12,.32,.11);}
  else if(type==='rabbit')ellipsoid(tail,0xf0e8d1,0,0,-.10,.15,.16,.17);
  else if(type==='horse'){curve(tail,[[0,.1,0],[0,-.10,-.35],[0,-.50,-.53]],0x302d2a,.10);}
  else if(dragon){curve(tail,[[0,0,0],[0,-.02,-.46],[.07,.03,-1.03],[0,.25,-1.63]],color,.13);for(let i=0;i<4;i++){const spike=mesh(tail,new T.ConeGeometry(.085,.27,4),0xb2b69f,0,.14+i*.025,-.3-i*.32);spike.rotation.x=-.4;}}
  else if(!aquatic){curve(tail,[[0,0,0],[.05,-.04,-.40],[.1,-.15,-.70]],color,type==='tiger'?.062:.037);ellipsoid(tail,0x393932,.1,-.15,-.73,.07,.08,.10);}
  if(type==='cow')for(const side of [-1,1]){const patch=ellipsoid(body,0x62513d,side*.35,y+.03,-.20,.11,.34,.33);patch.rotation.z=side*.18;}
  if(type==='tiger')for(const side of [-1,1])for(let i=0;i<5;i++){const z=-.53+i*.22;curve(body,[[side*.13,y+.44,z],[side*.38,y+.30,z-.06],[side*.446,y+.02,z-.04],[side*.35,y-.24,z+.05]],0x393b32,.028);}
  const wings:T.Group[]=[];
  if(aquatic){
    // A tapering body, vertical tail, dorsal fin and paired pectoral fins replace the quadruped silhouette.
    neck.scale.set(.88,.78,1.13);head.scale.set(.94,.62,1.18);ellipsoid(body,color,0,y,-.76,.26,.30,.52);
    const fin=mesh(body,new T.ConeGeometry(.34,.75,3),color,0,y+.54,-.17);fin.scale.z=.28;fin.rotation.y=Math.PI/2;
    for(const side of [-1,1]){const fin=joint(body,'pectoral-fin',side*.32,y-.15,.13);const blade=mesh(fin,new T.ConeGeometry(.25,.81,3),color,side*.25,-.1,-.12);blade.rotation.z=side*-1.8;blade.scale.z=.23;wings.push(fin);}
    const tailBlade=mesh(tail,new T.ConeGeometry(.48,.88,3),color,0,.13,-.70);tailBlade.rotation.x=Math.PI/2;tailBlade.scale.x=.14;
    for(const side of [-1,1])for(let i=0;i<3;i++)curve(body,[[side*.38,y+.10,.34-i*.10],[side*.44,y-.08,.29-i*.10]],0x354e59,.013);
  }
  if(dragon){
    for(const side of [-1,1]){
      const wing=joint(body,'wing',side*.35,1.20,-.16);const shape=new T.Shape();shape.moveTo(0,0);shape.lineTo(side*.83,1.10);shape.lineTo(side*2.22,.44);shape.quadraticCurveTo(side*1.74,.13,side*1.72,-.02);shape.quadraticCurveTo(side*1.13,-.01,side*1.01,-.38);shape.quadraticCurveTo(side*.50,-.25,0,-.58);shape.closePath();
      const membrane=mesh(wing,new T.ShapeGeometry(shape,8),0x8b727d);membrane.material=surface(0x866b79);membrane.material.side=T.DoubleSide;
      link(wing,[0,0,.02],[side*.83,1.10,.02],.055,color);for(const tip of [[side*2.22,.44,0],[side*1.72,-.02,0],[side*1.01,-.38,0]]){link(wing,[side*.83,1.10,.02],tip,.038,color);}
      wing.rotation.x=-.48;wings.push(wing);
    }
    for(let i=0;i<6;i++){const spike=mesh(body,new T.ConeGeometry(.12,.35,4),0xb6b79b,0,1.32,-.84+i*.28);spike.rotation.x=-.2;}
  }
  root.userData={body,legs,knees,head,neck,jaw,tail,wings,ears,stride:0,motion:0,altitude:0,species:type} satisfies AnimalRig;bake(root);return root;
}
