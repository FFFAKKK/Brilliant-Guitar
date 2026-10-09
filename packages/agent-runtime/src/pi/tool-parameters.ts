import { Type, type TSchema } from "typebox";

const EMPTY_OBJECT_SCHEMA = Type.Object({});
/** Match the decision adapter's executable tool declarations in pure input previews. */
export function piToolParameters(schema: unknown): TSchema {
  return typeof schema === "object" && schema !== null ? schema as TSchema : EMPTY_OBJECT_SCHEMA;
}
