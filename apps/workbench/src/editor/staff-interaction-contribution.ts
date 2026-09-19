import type { PluginNotationInteractionContribution } from "../plugins/plugin-sdk.ts";
import { staffInputAdapter } from "./staff-input-adapter.ts";
import type { StaffInputContext, StaffInsertIntent } from "./staff-input-adapter.ts";
import type { PitchDraft } from "./pitch-entry.ts";
import type { EditComposition } from "./editor-machine.ts";
import { resolveStaffNavigation } from "./staff-navigation-policy.ts";
import type { StaffNavigationContext, StaffNavigationResolution } from "./staff-navigation-policy.ts";
import { resolveStaffEditKey } from "./staff-edit-key-policy.ts";
import type { StaffEditKeyContext, StaffEditKeyResolution } from "./staff-edit-key-policy.ts";

export const staffInteractionContribution: PluginNotationInteractionContribution<StaffInputContext, NonNullable<PitchDraft>,
  StaffInsertIntent, StaffNavigationContext, StaffNavigationResolution, StaffEditKeyContext, StaffEditKeyResolution> = {
  id: "notation.staff.interaction",
  notationKind: "staff",
  input: staffInputAdapter,
  readDraft: (composition) => staffInputAdapter.draft(composition as EditComposition<NonNullable<PitchDraft>>),
  startComposition: (draft) => ({ methodId: staffInputAdapter.compositionMethodId, draft }),
  navigate: resolveStaffNavigation,
  edit: resolveStaffEditKey,
};
