import { isNotationView } from "../vendor/shared-notation/notation-model.js";

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

function deepFreeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
