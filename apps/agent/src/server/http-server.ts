import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, relative, extname } from "node:path";
import type { Server as ViteServer } from "node:http";
import type { StandaloneAgentHost } from "./agent-host.ts";
import { AgentHostError } from "./agent-host.ts";
import { ModelCatalogError } from "./model-catalog.ts";
import { SettingsStoreError } from "./connection-store.ts";
import { SessionStoreError } from "./session-store.ts";

interface Options {
  readonly host: StandaloneAgentHost;
  readonly clientDirectory?: string;
  readonly middleware?: (request: IncomingMessage, response: ServerResponse, next: () => void) => void;
}

async function jsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  if (request.headers["content-type"]?.split(";")[0] !== "application/json") throw new Error("请求需为 JSON");
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const part of request) {
    const chunk = Buffer.isBuffer(part) ? part : Buffer.from(part);
    bytes += chunk.length;
    if (bytes > 65536) throw new Error("请求超过大小限制");
    chunks.push(chunk);
  }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("请求格式无效");
  return value as Record<string, unknown>;
}

function field(body: Record<string, unknown>, key: string): unknown {
  if (Object.keys(body).length !== 1 || !Object.hasOwn(body, key)) throw new Error("请求格式无效");
  return body[key];
}

export function createStandaloneServer(options: Options): ViteServer {
  const server = createServer((request, response) => { void handle(request, response).catch((error: unknown) => {
    if (!response.headersSent) send(response, error instanceof AgentHostError && error.code === "busy" ? 409
      : error instanceof SettingsStoreError || error instanceof SessionStoreError ? 503 : error instanceof ModelCatalogError ? (error.code === "catalog-timeout" ? 504 : 502) : 400,
      { code: error instanceof AgentHostError || error instanceof ModelCatalogError || error instanceof SettingsStoreError || error instanceof SessionStoreError ? error.code : "invalid-input", error: error instanceof AgentHostError || error instanceof ModelCatalogError || error instanceof SettingsStoreError || error instanceof SessionStoreError ? error.message : "请求未完成，请检查输入或模型配置" });
    else response.end();
  }); });
  function send(response: ServerResponse, status: number, data: unknown): void {
    if (response.destroyed) return;
    response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    response.end(JSON.stringify(data));
  }
  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const address = server.address();
    const port = address && typeof address !== "string" ? address.port : 0;
    const localHosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    if (!request.headers.host || !localHosts.includes(request.headers.host)) { send(response, 403, { error: "宿主地址无效" }); return; }
    const pathname = new URL(request.url ?? "/", `http://${request.headers.host}`).pathname;
    if (pathname.startsWith("/api/")) {
      if (request.headers.origin && request.headers.origin !== `http://${request.headers.host}`) { send(response, 403, { error: "请求来源无效" }); return; }
      if (request.method === "GET" && pathname === "/api/session") { send(response, 200, options.host.getSnapshot()); return; }
      if (request.method === "GET" && pathname === "/api/session/events") {
        response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
        let waitingForDrain = false;
        let pending: ReturnType<StandaloneAgentHost["getSnapshot"]> | null = null;
        const emit = (snapshot: ReturnType<StandaloneAgentHost["getSnapshot"]>): void => {
          if (response.destroyed) return;
          if (waitingForDrain) { pending = snapshot; return; }
          waitingForDrain = !response.write(`id: ${snapshot.sequence}\ndata: ${JSON.stringify(snapshot)}\n\n`);
        };
        response.on("drain", () => { waitingForDrain = false; const latest = pending; pending = null; if (latest) emit(latest); });
        emit(options.host.getSnapshot());
        const unsubscribe = options.host.subscribe(emit);
        const heartbeat = setInterval(() => { if (!waitingForDrain && !response.destroyed) waitingForDrain = !response.write(": heartbeat\n\n"); }, 15000);
        response.on("close", () => { unsubscribe(); clearInterval(heartbeat); });
        return;
      }
      if (request.method !== "POST" && request.method !== "PUT") { send(response, 405, { error: "请求方法不支持" }); return; }
      const body = await jsonBody(request);
      switch (`${request.method} ${pathname}`) {
        case "PUT /api/model-config": await options.host.configure(body); break;
        case "PUT /api/model-credential": await options.host.saveCredential(field(body, "apiKey")); break;
        case "POST /api/profiles/save": await options.host.saveProfile(body); break;
        case "POST /api/profiles/select": await options.host.selectProfile(field(body, "profileId")); break;
        case "POST /api/profiles/delete": await options.host.deleteProfile(field(body, "profileId")); break;
        case "POST /api/conversations/select": await options.host.selectConversation(field(body, "sessionId")); break;
        case "POST /api/conversations/rename": {
          if (Object.keys(body).length !== 2 || !Object.hasOwn(body, "sessionId") || !Object.hasOwn(body, "title")) throw new Error("请求格式无效");
          await options.host.renameConversation(body.sessionId, body.title); break;
        }
        case "POST /api/conversations/archive": {
          if (Object.keys(body).length !== 2 || !Object.hasOwn(body, "sessionId") || !Object.hasOwn(body, "archived")) throw new Error("请求格式无效");
          await options.host.archiveConversation(body.sessionId, body.archived); break;
        }
        case "POST /api/conversations/save": if (Object.keys(body).length) throw new Error("请求格式无效"); await options.host.retrySessionSave(); break;
        case "POST /api/model-catalog": {
          const controller = new AbortController();
          const abort = (): void => { if (!response.writableEnded) controller.abort(); };
          response.once("close", abort);
          try { send(response, 200, await options.host.discoverModels(body, controller.signal)); }
          finally { response.removeListener("close", abort); }
          return;
        }
        case "POST /api/session/enable": {
          const enabled = field(body, "enabled");
          if (typeof enabled !== "boolean") throw new Error("启用状态无效");
          await options.host.setEnabled(enabled); break;
        }
        case "POST /api/session/messages": {
          const message = field(body, "message");
          if (typeof message !== "string") throw new Error("消息格式无效");
          options.host.submit(message); break;
        }
        case "POST /api/session/cancel": if (Object.keys(body).length) throw new Error("请求格式无效"); await options.host.cancel(); break;
        case "POST /api/session/reset": if (Object.keys(body).length) throw new Error("请求格式无效"); await options.host.reset(); break;
        case "POST /api/model-test": {
          if (Object.keys(body).length) throw new Error("请求格式无效");
          send(response, 200, { connected: await options.host.testConnection() }); return;
        }
        default: send(response, 404, { error: "入口不存在" }); return;
      }
      send(response, 200, options.host.getSnapshot()); return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") { response.writeHead(405); response.end(); return; }
    if (options.middleware) { options.middleware(request, response, () => { response.writeHead(404); response.end(); }); return; }
    if (!options.clientDirectory) { response.writeHead(404); response.end(); return; }
    const target = resolve(options.clientDirectory, "." + decodeURIComponent(pathname === "/" ? "/index.html" : pathname));
    if (relative(options.clientDirectory, target).startsWith("..")) { response.writeHead(404); response.end(); return; }
    try {
      const data = await readFile(target);
      const mime: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
      response.writeHead(200, { "content-type": `${mime[extname(target)] ?? "application/octet-stream"}; charset=utf-8`, "cache-control": "no-store" });
      response.end(request.method === "HEAD" ? undefined : data);
    } catch { response.writeHead(404); response.end(); }
  }
  return server;
}
