import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { ScoreSessionService, WorkbenchHostError } from "./score-session.ts";

import { isScoreEditRequest } from "../src/contracts/note-input.ts";
import { isWorkspaceId } from "../src/contracts/workspace-id.ts";

const reply = (response: ServerResponse, status: number, value: unknown) => {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(value));
};

async function body(request: IncomingMessage, limit = 1024 * 1024): Promise<Record<string, unknown>> {
  let bytes = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > limit) throw new WorkbenchHostError("文件过大", 413);
    chunks.push(buffer);
  }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new WorkbenchHostError("创建信息格式不正确");
  return value as Record<string, unknown>;
}

export function workbenchApi(): Plugin {
  const service = new ScoreSessionService();
  const middleware = (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname !== "/api/workbench/session" && url.pathname !== "/api/workbench/document") { next(); return; }
    void (async () => {
      try {
        const workspaceId = url.searchParams.get("workspaceId");
        if (!isWorkspaceId(workspaceId)) throw new WorkbenchHostError("工作区标识无效");
        if (url.pathname === "/api/workbench/document") {
          if (request.method === "GET") { response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": "attachment; filename=score.bgp.json", "Cache-Control": "no-store" }); response.end(service.exportDocument(workspaceId)); return; }
          if (request.method !== "POST") { reply(response, 405, { message: "不支持该操作" }); return; }
          if (request.headers.origin !== `http://${request.headers.host}` || !request.headers["content-type"]?.startsWith("application/json")) throw new WorkbenchHostError("请从当前工作台打开文件", 403);
          const input = await body(request);
          reply(response, 200, { session: service.importDocument(workspaceId, input) }); return;
        }
        if (request.method === "GET") { reply(response, 200, { session: service.read(workspaceId) }); return; }
        if (request.method !== "POST") { reply(response, 405, { message: "不支持该操作" }); return; }
        if (request.headers.origin !== `http://${request.headers.host}` || !request.headers["content-type"]?.startsWith("application/json")) {
          throw new WorkbenchHostError("请从当前工作台发起创建", 403);
        }
        const input = await body(request, 8192);
        if ("action" in input) {
          if (!isScoreEditRequest(input)) throw new WorkbenchHostError("输入信息格式不正确");
          reply(response, 200, { session: service.edit(workspaceId, input) }); return;
        }
        if (!isWorkspaceId(input.requestId) || !(input.expectedDocumentId === null || isWorkspaceId(input.expectedDocumentId))
          || typeof input.title !== "string" || typeof input.measureCount !== "number") throw new WorkbenchHostError("创建信息格式不正确");
        const session = service.create(workspaceId, input.requestId, input.expectedDocumentId, { title: input.title, measureCount: input.measureCount });
        reply(response, 200, { session });
      } catch (error) {
        if (error instanceof WorkbenchHostError) reply(response, error.status,
          { message: error.message, ...(error.issue ? { issue: error.issue } : {}) });
        else if (error instanceof SyntaxError) reply(response, 400, { message: "创建信息格式不正确" });
        else {
          console.error("Workbench creation failed:", error);
          reply(response, 503, { message: "暂时无法完成操作，请稍后重试" });
        }
      }
    })();
  };
  return { name: "brilliant-workbench-api", configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); } };
}
