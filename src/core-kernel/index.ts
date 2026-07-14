export const PURE_CORE_KERNEL_V1_SCOPE = {
  milestone: "Pure Core Kernel V1",
  runtime: "pure-typescript",
  forbiddenCapabilities: [
    "react-ui",
    "tauri-shell",
    "vexflow-rendering",
    "web-audio-playback",
    "pdf-export",
    "png-export",
    "guitar-pro-import-export",
    "physical-bgp-io",
    "plugin-runtime",
  ],
} as const;

export * from "./domain/fraction";
export * from "./domain/extensions";
export * from "./domain/musical-time";
export * from "./domain/pitch";
export * from "./domain/score-document";
export * from "./codec/decode-score-document";
export * from "./codec/score-json";
export * from "./validation/diagnostics";
export * from "./validation/validate-score-semantics";
export * from "./profiles/score-feature-profile";
