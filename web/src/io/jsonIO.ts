import type { EffectDocument, EffectLayer } from '../core/types';
import { SCHEMA_VERSION, makeLayer } from '../core/presets';
import { sanitizeDocument } from './sanitize';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  doc: EffectDocument;
}

/**
 * Deep-merges `patch` onto `base`, keeping `base`'s shape. Used so that
 * JSON files saved by an older/newer version of this tool (missing fields,
 * or fields this build doesn't know about) still load with sane defaults
 * instead of crashing. Arrays are replaced wholesale, never merged element
 * by element (that is handled explicitly for `layers`, see below).
 */
function mergeDefaults<T>(base: T, patch: unknown): T {
  if (patch === null || typeof patch !== 'object' || Array.isArray(base)) {
    return (patch !== undefined && typeof patch === typeof base ? (patch as T) : base);
  }
  const result: any = { ...(base as any) };
  const patchObj = patch as Record<string, unknown>;
  for (const key of Object.keys(base as any)) {
    if (!(key in patchObj)) continue;
    const baseVal = (base as any)[key];
    const patchVal = patchObj[key];
    if (Array.isArray(baseVal)) {
      if (Array.isArray(patchVal) && patchVal.every((v) => typeof v === 'number')) {
        result[key] = patchVal;
      }
    } else if (baseVal !== null && typeof baseVal === 'object') {
      result[key] = mergeDefaults(baseVal, patchVal);
    } else if (typeof patchVal === typeof baseVal) {
      result[key] = patchVal;
    }
  }
  return result;
}

function normalizeLayer(raw: unknown): EffectLayer {
  const template = makeLayer('レイヤー');
  const merged = mergeDefaults(template, raw);
  if (typeof (raw as any)?.id === 'string' && (raw as any).id.length > 0) {
    merged.id = (raw as any).id;
  }
  return merged;
}

/**
 * Normalizes an arbitrary parsed-JSON value into a well-formed
 * EffectDocument, filling in defaults for anything missing or malformed.
 * Collects human-readable warnings/errors along the way but never throws —
 * the caller decides whether to surface `errors` to the user.
 */
export function normalizeDocument(input: unknown, fallback: EffectDocument): ValidationResult {
  const errors: string[] = [];

  if (input === null || typeof input !== 'object') {
    return { ok: false, errors: ['JSONの内容がオブジェクトではありません。'], doc: fallback };
  }
  const obj = input as Record<string, unknown>;

  if (obj.effectType !== undefined && obj.effectType !== 'rotating_barrage') {
    errors.push(`未対応の effectType "${String(obj.effectType)}" です。rotating_barrage として読み込みます。`);
  }
  if (obj.schemaVersion !== undefined && typeof obj.schemaVersion === 'string') {
    const major = obj.schemaVersion.split('.')[0];
    if (major !== SCHEMA_VERSION.split('.')[0]) {
      errors.push(`JSONのスキーマバージョン ${obj.schemaVersion} は現在のバージョン ${SCHEMA_VERSION} と互換性がない可能性があります。`);
    }
  }

  const baseMerge = mergeDefaults({ ...fallback, layers: [] }, { ...obj, layers: undefined });
  let layers: EffectLayer[];
  if (Array.isArray(obj.layers) && obj.layers.length > 0) {
    layers = obj.layers.map((l) => normalizeLayer(l));
  } else {
    errors.push('layers が見つからないため、既定のレイヤーを使用します。');
    layers = fallback.layers;
  }

  const doc: EffectDocument = {
    ...baseMerge,
    effectType: 'rotating_barrage',
    schemaVersion: SCHEMA_VERSION,
    layers,
  };

  // Structural merge above only guarantees the right JS *type* for every
  // field (mergeDefaults falls back to the default on a type mismatch) --
  // it does not guarantee values are in range, enums are valid members, or
  // layer ids are unique. sanitizeDocument closes that gap and records a
  // Japanese warning for every value it had to adjust.
  sanitizeDocument(doc, errors);

  return { ok: errors.length === 0, errors, doc };
}

export function serializeDocument(doc: EffectDocument): string {
  return JSON.stringify(doc, null, 2);
}

export function parseDocument(jsonText: string, fallback: EffectDocument): ValidationResult {
  try {
    const parsed = JSON.parse(jsonText);
    return normalizeDocument(parsed, fallback);
  } catch (e) {
    return { ok: false, errors: [`JSONの解析に失敗しました: ${(e as Error).message}`], doc: fallback };
  }
}
