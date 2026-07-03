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
