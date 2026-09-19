export type AgentReadIntent = "summary" | "metadata" | "structure" | "measures";
export type AgentEditIntent = "update-title" | "update-tempo" | "update-metadata";
export type AgentIntent = AgentReadIntent | AgentEditIntent;

export type AgentReadCapabilityId =
  | "score.read-summary"
  | "score.read-metadata"
  | "score.read-structure"
  | "score.read-measures";
export type AgentEditCapabilityId =
  | "score.update-title"
  | "score.update-tempo"
  | "score.update-metadata";
export type AgentCapabilityId = AgentReadCapabilityId | AgentEditCapabilityId;

export type AgentIntentConfidence = "default" | "matched" | "ambiguous";

export interface AgentIntentRoute {
  readonly kind: "read" | "edit";
  readonly normalizedGoal: string;
  readonly matchedIntents: readonly AgentIntent[];
  readonly selectedIntent: AgentIntent | null;
  readonly capabilityId: AgentCapabilityId | null;
  readonly confidence: AgentIntentConfidence;
  readonly requiresClarification: boolean;
  readonly clarificationMessage: string | null;
}

interface IntentRule {
  readonly intent: AgentReadIntent;
  readonly capabilityId: AgentReadCapabilityId;
  readonly terms: readonly string[];
}

const INTENT_RULES: readonly IntentRule[] = Object.freeze([
  {
    intent: "summary",
    capabilityId: "score.read-summary",
    terms: [
      "概要",
      "摘要",
      "概览",
      "总览",
      "整体信息",
      "小节数量",
      "小节数",
      "有多少小节",
      "summary",
      "overview",
      "measure count",
    ],
  },
  {
    intent: "metadata",
    capabilityId: "score.read-metadata",
    terms: [
      "元数据",
      "作者",
      "作曲",
      "作词",
      "标题",
      "速度",
      "metadata",
      "author",
      "composer",
      "lyricist",
      "title",
      "tempo",
      "bpm",
    ],
  },
  {
    intent: "structure",
    capabilityId: "score.read-structure",
    terms: [
      "结构",
      "声部",
      "谱表",
      "structure",
      "part",
      "parts",
      "staff",
      "staves",
      "voice",
      "voices",
    ],
  },
  {
    intent: "measures",
    capabilityId: "score.read-measures",
    terms: [
      "小节范围",
      "选中的小节",
      "选择的小节",
      "当前小节",
      "measure range",
      "selected measure",
    ],
  },
]);

const TITLE_UPDATE_TERMS = Object.freeze([
  "修改标题",
  "更改标题",
  "设置标题",
  "标题改成",
  "标题改为",
  "改名为",
  "重命名为",
  "rename",
  "change the title",
  "set the title",
  "update the title",
]);

const TEMPO_UPDATE_TERMS = Object.freeze([
  "修改速度",
  "更改速度",
  "设置速度",
  "速度改成",
  "速度改为",
  "bpm 改成",
  "bpm 改为",
  "change the tempo",
  "set the tempo",
  "update the tempo",
]);

const INTENT_LABELS: Readonly<Record<AgentReadIntent, string>> = Object.freeze({
  summary: "乐谱概要",
  metadata: "标题、作者和速度等元数据",
  structure: "声部、谱表和结构信息",
  measures: "指定小节范围",
});

const INTENT_CAPABILITIES: Readonly<Record<AgentReadIntent, AgentReadCapabilityId>> = Object.freeze({
  summary: "score.read-summary",
  metadata: "score.read-metadata",
  structure: "score.read-structure",
  measures: "score.read-measures",
});

function containsTerm(goal: string, term: string): boolean {
  return goal.includes(term);
}

function clarificationMessage(intents: readonly AgentReadIntent[]): string {
  const labels = intents.map((intent) => INTENT_LABELS[intent]);
  return `这个任务同时涉及${labels.join("和")}。请明确你想先读取哪一类信息。`;
}

function hasExplicitMeasureReference(goal: string): boolean {
  const ordinal = /第\s*\d+\s*(?:到|至|[-~～—–])\s*(?:第\s*)?\d+\s*(?:个)?小节/u.test(goal)
    || /第\s*\d+\s*(?:个)?小节/u.test(goal);
  const englishOrdinal = /\bmeasures?\s+\d+\s*(?:to|through|[-~])\s*\d+\b/i.test(goal);
  const stableIds = (goal.match(/\bmeasure-[a-z0-9_-]+\b/gi)?.length ?? 0) >= 2;
  const selection = /(?:当前)?(?:选中|选择)(?:的)?(?:小节|范围)/u.test(goal);
  return ordinal || englishOrdinal || stableIds || selection;
}

function routeFor(
  normalizedGoal: string,
  matchedIntents: readonly AgentReadIntent[],
): AgentIntentRoute {
  if (matchedIntents.length === 0) {
    return Object.freeze({
      kind: "read",
      normalizedGoal,
      matchedIntents: Object.freeze([]),
      selectedIntent: "summary",
      capabilityId: "score.read-summary",
      confidence: "default",
      requiresClarification: false,
      clarificationMessage: null,
    });
  }

  if (matchedIntents.length > 1) {
    return Object.freeze({
      kind: "read",
      normalizedGoal,
      matchedIntents: Object.freeze([...matchedIntents]),
      selectedIntent: null,
      capabilityId: null,
      confidence: "ambiguous",
      requiresClarification: true,
      clarificationMessage: clarificationMessage(matchedIntents),
    });
  }

  const selectedIntent = matchedIntents[0]!;
  return Object.freeze({
    kind: "read",
    normalizedGoal,
    matchedIntents: Object.freeze([...matchedIntents]),
    selectedIntent,
    capabilityId: INTENT_CAPABILITIES[selectedIntent],
    confidence: "matched",
    requiresClarification: false,
    clarificationMessage: null,
  });
}

function editRoute(normalizedGoal: string): AgentIntentRoute | null {
  const updatesTitle = TITLE_UPDATE_TERMS.some((term) => containsTerm(normalizedGoal, term));
  const updatesTempo = TEMPO_UPDATE_TERMS.some((term) => containsTerm(normalizedGoal, term));
  if (!updatesTitle && !updatesTempo) return null;
  if (updatesTitle && updatesTempo) return Object.freeze({
    kind: "edit",
    normalizedGoal,
    matchedIntents: Object.freeze(["update-title", "update-tempo"] as const),
    selectedIntent: "update-metadata",
    capabilityId: "score.update-metadata",
    confidence: "matched",
    requiresClarification: false,
    clarificationMessage: null,
  });
  const selectedIntent = updatesTitle ? "update-title" as const : "update-tempo" as const;
  return Object.freeze({
    kind: "edit",
    normalizedGoal,
    matchedIntents: Object.freeze([selectedIntent]),
    selectedIntent,
    capabilityId: selectedIntent === "update-title" ? "score.update-title" : "score.update-tempo",
    confidence: "matched",
    requiresClarification: false,
    clarificationMessage: null,
  });
}

/** Converts a user goal into a bounded read intent before the Agent run starts. */
export class AgentIntentRouter {
  route(goal: string): AgentIntentRoute {
    const normalizedGoal = goal.trim().toLocaleLowerCase();
    const edit = editRoute(normalizedGoal);
    if (edit !== null) return edit;
    let matchedIntents = INTENT_RULES
      .filter((rule) => rule.terms.some((term) => containsTerm(normalizedGoal, term)))
      .map((rule) => rule.intent);
    if (hasExplicitMeasureReference(normalizedGoal)) {
      matchedIntents = matchedIntents.filter((intent) => intent !== "summary" && intent !== "structure");
      if (!matchedIntents.includes("measures")) matchedIntents.push("measures");
    }
    return routeFor(normalizedGoal, matchedIntents);
  }
}

export const DEFAULT_AGENT_INTENT_ROUTER = new AgentIntentRouter();
