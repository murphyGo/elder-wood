import * as T from 'three';

/** Sweep several sight lines to protect the near plane as well as the camera center. */
export class FollowCamera {
  private ray = new T.Raycaster();
  private offsets = [new T.Vector3(), new T.Vector3(.22, 0, 0), new T.Vector3(-.22, 0, 0), new T.Vector3(0, .18, 0), new T.Vector3(0, -.18, 0)];
  private intersections: T.Intersection[] = [];
  clearDistance(focus: T.Vector3, point: T.Vector3, occluders: T.Object3D[]) {
    const direction = point.clone().sub(focus); const length = direction.length();
    if (length < .001) return 0;
    direction.normalize(); let available = length;
    for (const offset of this.offsets) {
      this.ray.set(focus.clone().add(offset), direction); this.ray.near = .1; this.ray.far = length;
      this.intersections.length = 0;
      // Also detect the exit face when a previous camera position was inside a canopy.
      for (const object of occluders) {
        const mesh = object as T.Mesh; const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const sides = materials.map(m => m.side); materials.forEach(m => { m.side = T.DoubleSide; });
        try { this.ray.intersectObject(mesh, false, this.intersections); }
        finally { materials.forEach((m, i) => { m.side = sides[i]; }); }
      }
      const hit = this.intersections[0];
      if (hit) available = Math.min(available, Math.max(.35, hit.distance - .38));
    }
    return available;
  }
  update(camera: T.PerspectiveCamera, focus: T.Vector3, yaw: number, elevation: number, distance: number, occluders: T.Object3D[], dt: number, shake: T.Vector3) {
    const at = (angle: number) => focus.clone().add(new T.Vector3(Math.sin(yaw) * Math.cos(angle) * distance, Math.sin(angle) * distance + .25, Math.cos(yaw) * Math.cos(angle) * distance));
    const destination = at(elevation); let available = this.clearDistance(focus, destination, occluders);
    if (available < 6) for (const angle of [.8, 1.05, 1.3]) {
      if (angle <= elevation) continue;
      const candidate = at(angle); const clear = this.clearDistance(focus, candidate, occluders);
      if (clear > available) { destination.copy(candidate); available = clear; }
      if (clear >= candidate.distanceTo(focus) - .01) break;
    }
    destination.sub(focus).setLength(available).add(focus);
    camera.position.lerp(destination, 1 - Math.exp(-dt * 8)).add(shake);
    // Interpolation and shake can cross a corner even when both endpoints are clear.
    const safe = this.clearDistance(focus, camera.position, occluders);
    if (safe < camera.position.distanceTo(focus)) camera.position.sub(focus).setLength(safe).add(focus);
    camera.lookAt(focus);
  }
}
