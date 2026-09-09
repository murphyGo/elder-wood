export const SETTINGS_KEY = 'elderwood-settings-v1';
export type Quality = 'auto' | 'high' | 'medium' | 'low';
export interface DisplaySettings { quality: Quality; shake: number; aimZoom: boolean; ambientMotion: boolean }
export interface DisplayDevice { width: number; coarse: boolean; pixelRatio: number; reducedMotion: boolean }
export const QUALITY_NAMES: Record<Quality, string> = { auto: '자동', high: '높음', medium: '보통', low: '낮음' };
export const PROFILES = {
  high: { pixelRatio: 1.7, shadow: 2048, grass: 4200, particles: 100, sparks: 160 },
  medium: { pixelRatio: 1.25, shadow: 1024, grass: 2500, particles: 60, sparks: 80 },
  low: { pixelRatio: 1, shadow: 0, grass: 1000, particles: 25, sparks: 40 },
};
export function defaultSettings(reducedMotion = false): DisplaySettings {
  return { quality: 'auto', shake: reducedMotion ? 0 : 0.35, aimZoom: !reducedMotion, ambientMotion: !reducedMotion };
}
export function resolveQuality(settings: DisplaySettings, device: DisplayDevice): Exclude<Quality, 'auto'> {
  return settings.quality === 'auto' ? device.width < 600 || (device.coarse && device.pixelRatio > 2) ? 'low' : device.coarse ? 'medium' : 'high' : settings.quality;
}
export function readSettings(storage: Pick<Storage, 'getItem'> | undefined, reducedMotion = false): DisplaySettings {
  const defaults = defaultSettings(reducedMotion);
  try {
    const raw: unknown = JSON.parse(storage?.getItem(SETTINGS_KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return defaults;
    const value = raw as Partial<DisplaySettings>;
    return {
      quality: typeof value.quality === 'string' && Object.hasOwn(QUALITY_NAMES, value.quality) ? value.quality : defaults.quality,
      shake: [0, 0.35, 0.7].includes(value.shake!) ? value.shake! : defaults.shake,
      aimZoom: typeof value.aimZoom === 'boolean' ? value.aimZoom : defaults.aimZoom,
      ambientMotion: typeof value.ambientMotion === 'boolean' ? value.ambientMotion : defaults.ambientMotion,
    };
  } catch { return defaults; }
}
export function writeSettings(storage: Pick<Storage, 'setItem'> | undefined, settings: DisplaySettings) {
  try { if (!storage) return false; storage.setItem(SETTINGS_KEY, JSON.stringify(settings)); return true; } catch { return false; }
}
