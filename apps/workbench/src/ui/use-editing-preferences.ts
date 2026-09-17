import { useEffect, useState } from "react";
import type { DeleteTimePolicy } from "../contracts/note-input.ts";

const RULE_WARNING_KEY = "brilliant.workbench.rule-warnings-visible.v1";
const DELETE_TIME_POLICY_KEY = "brilliant.workbench.delete-time-policy.v1";

export interface EditingPreferences {
  readonly ruleWarningsVisible: boolean;
  readonly deleteTimePolicy: DeleteTimePolicy;
}

export function readEditingPreferences(storage: Pick<Storage, "getItem">): EditingPreferences {
  return {
    ruleWarningsVisible: storage.getItem(RULE_WARNING_KEY) !== "false",
    deleteTimePolicy: storage.getItem(DELETE_TIME_POLICY_KEY) === "collapse" ? "collapse" : "preserve",
  };
}

export function useEditingPreferences() {
  const [preferences, setPreferences] = useState<EditingPreferences>(() => {
    try { return readEditingPreferences(localStorage); }
    catch { return { ruleWarningsVisible: true, deleteTimePolicy: "preserve" }; }
  });
  useEffect(() => {
    try {
      localStorage.setItem(RULE_WARNING_KEY, String(preferences.ruleWarningsVisible));
      localStorage.setItem(DELETE_TIME_POLICY_KEY, preferences.deleteTimePolicy);
    } catch { /* Remains active for this session. */ }
  }, [preferences]);
  return {
    ...preferences,
    setRuleWarningsVisible: (ruleWarningsVisible: boolean) => setPreferences((current) => ({ ...current, ruleWarningsVisible })),
    setDeleteTimePolicy: (deleteTimePolicy: DeleteTimePolicy) => setPreferences((current) => ({ ...current, deleteTimePolicy })),
  };
}
