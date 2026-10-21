import { isNotationView } from "../vendor/shared-notation/notation-model.js";
import { isTablatureProjection, pairedNotationMatches } from "../vendor/shared-notation/tablature-model.js";

/** Validate against the established projection contract; never invent IDs or music. */
export function normalizeStaffSnapshot(input) {
  if (!input || !Array.isArray(input.measures) || !input.measures.length) {
    throw new TypeError("五线谱快照需要至少一个小节");
  }
  if (!isNotationView(input) || input.kind !== "staff") {
    throw new TypeError("五线谱快照或事件无效（音高、时值、拍号、身份或调号合同不匹配）");
  }
  return deepFreeze(structuredClone(input));
}

export function normalizeNotationSnapshot(input) {
  if (input?.kind === "staff") return normalizeStaffSnapshot(input);
  if (input?.kind !== "tablature" || !isTablatureProjection(input)) {
    throw new TypeError("Tab 快照或弦品、时值、拍号、身份合同无效");
  }
  return deepFreeze(structuredClone(input));
}

/** Accept both projections atomically; never infer fingering from staff pitch. */
export function normalizeNotationPair(staff, tablature) {
  const notation = staff === null ? null : normalizeStaffSnapshot(staff);
  if (tablature === undefined) return { notation, tablature: undefined };
  if (!isTablatureProjection(tablature)) throw new TypeError("文档 Tab 投影无效");
  if (notation && tablature.kind === "tablature" && !pairedNotationMatches(notation, tablature)) {
    throw new TypeError("五线谱和 Tab 必须来自同一文档版本、声部和事件序列");
  }
  return { notation, tablature: deepFreeze(structuredClone(tablature)) };
}

function deepFreeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
