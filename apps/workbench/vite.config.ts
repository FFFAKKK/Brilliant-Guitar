import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { workbenchApi } from "./host/workbench-api.ts";

export default defineConfig({
  plugins: [react(), ...(process.env.BRILLIANT_DESKTOP_HOST === "1" ? [] : [workbenchApi()])],
  server: {
    fs: { strict: true },
    // The predev/prebuild scripts compile the public kernel into this generated
    // directory. Watching those writes restarts the host and discards its
    // in-memory editing sessions while tests or builds run beside the preview.
    watch: { ignored: ["**/.kernel/**"] },
  },
});
