import * as T from 'three';

/** One fixed allocation and one draw call for every short lived impact spark. */
export class ImpactParticles {
  readonly capacity = 160;
  limit = this.capacity;
  private cursor = 0;
  private positions = new Float32Array(this.capacity * 3);
  private colors = new Float32Array(this.capacity * 3);
  private velocity = new Float32Array(this.capacity * 3);
  private life = new Float32Array(this.capacity);
  private baseColors = new Float32Array(this.capacity * 3);
  readonly mesh: T.Points<T.BufferGeometry, T.PointsMaterial>;
  constructor() {
    const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.BufferAttribute(this.positions, 3)); geometry.setAttribute('color', new T.BufferAttribute(this.colors, 3));
    this.mesh = new T.Points(geometry, new T.PointsMaterial({ size: .09, vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending })); this.mesh.frustumCulled = false;
  }
  setLimit(limit: number) { this.limit = Math.min(this.capacity, limit); this.mesh.geometry.setDrawRange(0, this.limit); this.cursor %= this.limit; this.clear(); }
  clear() { this.life.fill(0); this.colors.fill(0); this.mesh.geometry.attributes.color.needsUpdate = true; }
  burst(point: T.Vector3, color: T.Color, heavy = false) {
    for (let n = 0; n < (heavy ? 14 : 7); n++) {
      const i = this.cursor++ % this.limit, j = i * 3;
      this.positions.set([point.x, point.y + .85, point.z], j);
      this.velocity.set([(Math.random() - .5) * 4, 1.2 + Math.random() * 3, (Math.random() - .5) * 4], j);
      this.baseColors.set([color.r, color.g, color.b], j); this.life[i] = .35 + Math.random() * .2;
    }
  }
  update(dt: number) {
    for (let i = 0; i < this.limit; i++) {
      const j = i * 3; this.life[i] = Math.max(0, this.life[i] - dt);
      for (let k = 0; k < 3; k++) { this.positions[j + k] += this.velocity[j + k] * dt; this.colors[j + k] = this.baseColors[j + k] * Math.min(1, this.life[i] * 3); }
      this.velocity[j + 1] -= dt * 7;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true; this.mesh.geometry.attributes.color.needsUpdate = true;
  }
  dispose() { this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.mesh.removeFromParent(); }
}

export function contactShadow(radius: number) {
  // Concentric translucent discs provide a soft contact cue even with shadow maps disabled.
  const group = new T.Group();
  for (let i = 0; i < 4; i++) {
    const disc = new T.Mesh(new T.CircleGeometry(radius * (1 - i * .15), 20), new T.MeshBasicMaterial({ color: 0x1a2827, transparent: true, opacity: .035 + i * .012, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = .02 + i * .001; group.add(disc);
  }
  return group;
}
