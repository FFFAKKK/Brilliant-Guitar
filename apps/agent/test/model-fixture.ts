import { createServer, type IncomingHttpHeaders, type ServerResponse } from "node:http";
import { setTimeout as delay } from "node:timers/promises";

export interface ModelRequest { readonly url: string; readonly headers: IncomingHttpHeaders; readonly body: Record<string, unknown> }
export type FixtureReply = { readonly chunks: readonly Record<string, unknown>[]; readonly delayMs?: number; readonly unfinished?: boolean }
  | { readonly error: string } | { readonly hang: true };

const delta = (value: Record<string, unknown>, finishReason: string | null = null) => ({ id: "fixture-request", object: "chat.completion.chunk", model: "fixture", choices: [{ index: 0, delta: value, finish_reason: finishReason }] });
export function textReply(text: string, options: { readonly unfinished?: boolean; readonly delayMs?: number } = {}): FixtureReply {
  return { chunks: [delta({ role: "assistant", content: text.slice(0, 2) }), delta({ content: text.slice(2) }), ...(options.unfinished ? [] : [delta({}, "stop"), { id: "fixture-request", choices: [], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }])], ...options };
}
export function toolReply(name: string, argumentsText: string, id = "fixture-tool"): FixtureReply {
  return { chunks: [delta({ role: "assistant", tool_calls: [{ index: 0, id, type: "function", function: { name, arguments: argumentsText.slice(0, 3) } }] }),
    delta({ tool_calls: [{ index: 0, function: { arguments: argumentsText.slice(3) } }] }), delta({}, "tool_calls")] };
}

export async function createModelFixture(replies: readonly FixtureReply[] | ((request: ModelRequest, count: number) => FixtureReply)) {
  const requests: ModelRequest[] = [];
  const responses = new Set<ServerResponse>();
  const server = createServer((request, response) => { void (async () => {
    responses.add(response); response.on("close", () => responses.delete(response));
    const parts: Buffer[] = [];
    for await (const part of request) parts.push(Buffer.from(part));
    requests.push({ url: request.url ?? "", headers: request.headers, body: JSON.parse(Buffer.concat(parts).toString("utf8")) });
    const reply = typeof replies === "function" ? replies(requests[requests.length - 1]!, requests.length) : replies[requests.length - 1] ?? textReply("本地 fixture 回复");
    if ("error" in reply) { response.writeHead(401, { "content-type": "application/json" }); response.end(JSON.stringify({ error: { message: reply.error } })); return; }
    response.writeHead(200, { "content-type": "text/event-stream" });
    if ("hang" in reply) { response.write(`data: ${JSON.stringify(delta({ role: "assistant", content: "尚未结束" }))}\n\n`); return; }
    for (const chunk of reply.chunks) {
      if (response.destroyed) return;
      response.write(`data: ${JSON.stringify(chunk)}\n\n`);
      if (reply.delayMs) await delay(reply.delayMs);
    }
    response.end("data: [DONE]\n\n");
  })().catch(() => { response.writeHead(500); response.end(); }); });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fixture address is missing");
  return { requests, baseUrl: `http://127.0.0.1:${address.port}/v1`, close: async () => {
    for (const response of responses) response.destroy();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  } };
}
