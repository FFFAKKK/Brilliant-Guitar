import { fileURLToPath } from "node:url";
import { createServer } from "../../../../apps/workbench/node_modules/vite/dist/node/index.js";

const directory = fileURLToPath(new URL(".", import.meta.url));
const repository = fileURLToPath(new URL("../../../../", import.meta.url));
const dependencies = fileURLToPath(new URL("../../../../apps/workbench/node_modules/", import.meta.url));
const server = await createServer({
  configFile: false,
  root: directory,
  cacheDir: `${repository}/.local-evidence/coordinator-stage1/vite`,
  resolve: {
    alias: [
      { find: /^react$/, replacement: `${dependencies}/react/index.js` },
      { find: /^react-dom\/client$/, replacement: `${dependencies}/react-dom/client.js` },
    ],
    dedupe: ["react", "react-dom"],
  },
  server: { host: "127.0.0.1", port: 5194, strictPort: true, fs: { allow: [repository] } },
});
await server.listen();
console.log("Audit page: http://127.0.0.1:5194/browser.html");
// The coordinator can stop only this server with Ctrl+C or a newline.
process.stdin.resume();
process.stdin.once("data", async () => { await server.close(); process.exit(0); });
