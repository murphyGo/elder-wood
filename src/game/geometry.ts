export interface Point { x: number; z: number }
export interface Obstacle extends Point { radius: number }
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
export const direction = (yaw: number): Point => ({ x: Math.sin(yaw), z: Math.cos(yaw) });
export const angleTo = (a: Point, b: Point) => Math.atan2(b.x - a.x, b.z - a.z);
export const copyPoint = (p: Point): Point => ({ x: p.x, z: p.z });
export const addPoint = (p: Point, d: Point, scale: number): Point => ({ x: p.x + d.x * scale, z: p.z + d.z * scale });
export function segmentDistance(p: Point, a: Point, b: Point): number {
  const x = b.x - a.x, z = b.z - a.z, length2 = x * x + z * z;
  const t = length2 ? Math.max(0, Math.min(1, ((p.x - a.x) * x + (p.z - a.z) * z) / length2)) : 0;
  return Math.hypot(p.x - a.x - x * t, p.z - a.z - z * t);
}
export function clearLine(a: Point, b: Point, obstacles: Obstacle[], radius = 0): boolean {
  return !obstacles.some(o => segmentDistance(o, a, b) < o.radius + radius);
}
export function segmentHitTime(a: Point, b: Point, center: Point, radius: number): number | null {
  const dx = b.x - a.x, dz = b.z - a.z, fx = a.x - center.x, fz = a.z - center.z;
  const c = fx * fx + fz * fz - radius * radius;
  if (c <= 0) return 0;
  const aa = dx * dx + dz * dz; if (aa < 1e-12) return null;
  const bb = 2 * (fx * dx + fz * dz), discriminant = bb * bb - 4 * aa * c;
  if (discriminant < 0) return null;
  const t = (-bb - Math.sqrt(discriminant)) / (2 * aa);
  return t >= 0 && t <= 1 ? t : null;
}
export function inCone(origin: Point, target: Point, yaw: number, range: number, angle: number, radius = 0): boolean {
  const d = distance(origin, target); if (d > range + radius) return false; if (d <= radius) return true;
  const diff = Math.atan2(Math.sin(angleTo(origin, target) - yaw), Math.cos(angleTo(origin, target) - yaw));
  return Math.abs(diff) <= angle * Math.PI / 360 + Math.asin(Math.min(1, radius / d));
}
export function moveBody(p: Point, delta: Point, radius: number, obstacles: Obstacle[], village = false): Point {
  const result = copyPoint(p); const steps = Math.max(1, Math.ceil(Math.hypot(delta.x, delta.z) / 0.16));
  for (let i = 0; i < steps; i++) {
    let x = Math.max(-31 + radius, Math.min(31 - radius, result.x + delta.x / steps));
    let z = Math.max(-30 + radius, Math.min(30 - radius, result.z + delta.z / steps));
    for (const o of obstacles) {
      const d = Math.hypot(x - o.x, z - o.z); const min = radius + o.radius;
      if (d < min) { const angle = d > 0.0001 ? Math.atan2(x - o.x, z - o.z) : 0; x = o.x + Math.sin(angle) * min; z = o.z + Math.cos(angle) * min; }
    }
    const bank = -16.7 + Math.sin(z * 0.06) * 2;
    if (!(village && z > 3.3 && z < 6.7) && x < bank && result.x >= bank - 0.1) x = bank;
    result.x = Math.max(-31 + radius, Math.min(31 - radius, x)); result.z = Math.max(-30 + radius, Math.min(30 - radius, z));
  }
  return result;
}
