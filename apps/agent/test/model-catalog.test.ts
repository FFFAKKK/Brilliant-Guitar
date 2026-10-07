import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { parseAgentModelConfiguration, parseAgentModelConnection, type AgentModelConnection } from "@brilliant-guitar/agent-runtime";
import { matchesModelConnection, parseModelCatalog, parseModelCatalogRequest, parseSupplierModels } from "../src/contracts/model-catalog.ts";
import { fetchModelCatalog, ModelCatalogError } from "../src/server/model-catalog.ts";
import { AgentHostError, StandaloneAgentHost } from "../src/server/agent-host.ts";
import { createStandaloneServer } from "../src/server/http-server.ts";
import { createModelFixture, type CatalogFixtureReply } from "./model-fixture.ts";

const sentinel = "catalog-fixture-private-key";
const connection = (baseUrl: string): AgentModelConnection => ({ providerId: "openai-compatible", protocol: "chat-completions", baseUrl });
async function waitUntil(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 200; ++attempt) { if (predicate()) return; await delay(5); }
  throw new Error("Fixture did not observe the operation");
}

test("connection and catalog decoders retain strict existing config semantics", () => {
  const target = connection("https://service.example/v1/");
  assert.equal(parseAgentModelConnection(target).baseUrl, "https://service.example/v1");
  assert.equal(parseAgentModelConfiguration({ ...target, modelId: "custom-model" }).modelId, "custom-model");
  for (const invalid of [{ ...target, modelId: "extra" }, { ...target, protocol: "responses" }, { ...target, baseUrl: "https://user:pass@service.example/v1" }, { ...target, baseUrl: "https://service.example/v1?token=value" }]) assert.throws(() => parseAgentModelConnection(invalid));
  assert.throws(() => parseAgentModelConfiguration({ ...target, modelId: " model " }));
  assert.throws(() => parseModelCatalogRequest({ connection: target, extra: true }));
  assert.throws(() => parseModelCatalogRequest({ connection: target, apiKey: "" }));
  assert.deepEqual(parseSupplierModels({ data: [{ id: "a", secret: sentinel }, { id: "a" }, { id: "b" }] }), [{ id: "a" }, { id: "b" }]);
  assert.throws(() => parseModelCatalog({ connection: target, models: [{ id: "a", secret: sentinel }] }));
  assert.throws(() => parseSupplierModels({ data: [{ id: "bad\nmodel" }] }));
  assert.throws(() => parseSupplierModels({ data: Array.from({ length: 501 }, (_, index) => ({ id: `m${index}` })) }));
});

test("catalog uses GET/Bearer at the exact prefix, deduplicates IDs and strips provider metadata", async (t) => {
  const fixture = await createModelFixture([], { catalog: { value: { object: "list", data: [{ id: "first", owned_by: sentinel }, { id: "first" }, { id: "second" }] } } }); t.after(fixture.close);
  for (const baseUrl of [fixture.baseUrl, fixture.baseUrl.replace(/\/v1$/, "")]) {
    const result = await fetchModelCatalog(connection(baseUrl), sentinel);
    assert.deepEqual(result.models, [{ id: "first" }, { id: "second" }]);
    assert.ok(matchesModelConnection(result.connection, connection(baseUrl)));
    assert.ok(!JSON.stringify(result).includes(sentinel));
  }
  assert.deepEqual(fixture.catalogRequests.map((item) => item.url), ["/v1/models", "/models"]);
  assert.ok(fixture.catalogRequests.every((item) => item.headers.authorization === `Bearer ${sentinel}`));
  assert.equal(fixture.requests.length, 0);
});

test("discovery works before configuration/activation and keeps drafts and credentials ephemeral", async (t) => {
  const fixture = await createModelFixture([]); t.after(fixture.close);
  const host = new StandaloneAgentHost(); t.after(() => host.dispose());
  const before = host.getSnapshot();
  assert.equal((await host.discoverModels({ connection: connection(fixture.baseUrl), apiKey: sentinel })).models.length, 2);
  assert.deepEqual(host.getSnapshot(), before);
  assert.equal(host.getSnapshot().credentialPresent, false);
  await assert.rejects(host.discoverModels({ connection: connection(fixture.baseUrl) }), /API Key/);
  await host.configure({ ...connection(fixture.baseUrl), modelId: "custom" }); await host.saveCredential(sentinel);
  const saved = host.getSnapshot();
  const result = await host.discoverModels({ connection: { ...connection(fixture.baseUrl), baseUrl: `${fixture.baseUrl}/` } });
  assert.equal(result.models[0]?.id, "fixture-model"); assert.deepEqual(host.getSnapshot(), saved);
  await assert.rejects(host.discoverModels({ connection: connection(`${fixture.baseUrl}/other`) }), /API Key/);
  assert.equal(fixture.catalogRequests.length, 2); assert.equal(fixture.requests.length, 0);
});

test("supplier errors, malformed bodies and secrets produce stable actionable diagnostics", async (t) => {
  const cases: { reply: CatalogFixtureReply; code: ModelCatalogError["code"] }[] = [
    { reply: { status: 401, value: { error: sentinel } }, code: "catalog-unauthorized" },
    { reply: { status: 403, value: { error: sentinel } }, code: "catalog-unauthorized" },
    { reply: { status: 404, value: { error: sentinel } }, code: "catalog-unavailable" },
    { reply: { status: 500, value: { error: sentinel } }, code: "catalog-failed" },
    { reply: { raw: "not json" }, code: "catalog-invalid" },
    { reply: { value: { data: [{ id: sentinel }] } }, code: "catalog-invalid" },
    { reply: { value: { data: [{ id: " model " }] } }, code: "catalog-invalid" },
    { reply: { raw: "x".repeat(1048577) }, code: "catalog-invalid" },
    { reply: { status: 302, location: "http://127.0.0.1:1/models" }, code: "catalog-failed" },
  ];
  for (const { reply, code } of cases) {
    const fixture = await createModelFixture([], { catalog: reply }); t.after(fixture.close);
    await assert.rejects(fetchModelCatalog(connection(fixture.baseUrl), sentinel), (error: unknown) => error instanceof ModelCatalogError && error.code === code && !error.message.includes(sentinel));
  }
  const empty = await createModelFixture([], { catalog: { value: { data: [] } } }); t.after(empty.close);
  assert.deepEqual((await fetchModelCatalog(connection(empty.baseUrl), sentinel)).models, []);
});

test("catalog timeout and caller cancellation abort the actual supplier transport", async (t) => {
  const fixture = await createModelFixture([], { catalog: { hang: true } }); t.after(fixture.close);
  await assert.rejects(fetchModelCatalog(connection(fixture.baseUrl), sentinel, { timeoutMs: 30 }), (error: unknown) => error instanceof ModelCatalogError && error.code === "catalog-timeout");
  const controller = new AbortController();
  const operation = fetchModelCatalog(connection(fixture.baseUrl), sentinel, { signal: controller.signal });
  const rejected = assert.rejects(operation, (error: unknown) => error instanceof ModelCatalogError && error.code === "catalog-cancelled");
  await waitUntil(() => fixture.catalogRequests.length === 2); controller.abort(); await rejected;
  await waitUntil(() => fixture.catalogClosed === 2);
});

test("host lifecycle invalidates outstanding metadata without enabling the Agent", async (t) => {
  for (const mutate of [
    (host: StandaloneAgentHost) => host.configure({ ...connection("https://other.example/v1"), modelId: "other" }),
    (host: StandaloneAgentHost) => host.saveCredential("replacement-key"),
    (host: StandaloneAgentHost) => host.cancel(),
    (host: StandaloneAgentHost) => host.reset(),
    (host: StandaloneAgentHost) => host.dispose(),
  ]) {
    const fixture = await createModelFixture([], { catalog: { hang: true } }); t.after(fixture.close);
    const host = new StandaloneAgentHost(); t.after(() => host.dispose());
    const operation = host.discoverModels({ connection: connection(fixture.baseUrl), apiKey: sentinel });
    const rejected = assert.rejects(operation, (error: unknown) => error instanceof ModelCatalogError && error.code === "catalog-cancelled");
    await waitUntil(() => fixture.catalogRequests.length === 1); await mutate(host); await rejected;
    assert.equal(host.getSnapshot().session.enabled, false); assert.equal(host.getSnapshot().session.messages.length, 0);
  }
});

test("active generation rejects discovery without metadata traffic", async (t) => {
  const fixture = await createModelFixture([{ hang: true }]); t.after(fixture.close);
  const host = new StandaloneAgentHost(); t.after(() => host.dispose());
  await host.configure({ ...connection(fixture.baseUrl), modelId: "fixture-model" }); await host.saveCredential(sentinel); await host.setEnabled(true);
  host.submit("挂起回复"); await waitUntil(() => host.getSnapshot().session.status === "running");
  await assert.rejects(host.discoverModels({ connection: connection(fixture.baseUrl) }), (error: unknown) => error instanceof AgentHostError && error.code === "busy");
  assert.equal(fixture.catalogRequests.length, 0); await host.cancel();
});

test("HTTP catalog returns its own DTO, preserves snapshot and validates origin/body", async (t) => {
  const fixture = await createModelFixture([]); t.after(fixture.close);
  const host = new StandaloneAgentHost(); t.after(() => host.dispose());
  const server = createStandaloneServer({ host });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/api/model-catalog`;
  t.after(async () => { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); });
  const body = { connection: connection(fixture.baseUrl), apiKey: sentinel };
  const before = host.getSnapshot();
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  assert.equal(response.status, 200); const value: unknown = await response.json();
  assert.equal(parseModelCatalog(value).models.length, 2); assert.ok(!JSON.stringify(value).includes(sentinel));
  assert.deepEqual(host.getSnapshot(), before);
  for (const [headers, data, status] of [
    [{ "content-type": "application/json", origin: "http://unrelated.local" }, body, 403],
    [{ "content-type": "application/json" }, { ...body, unexpected: true }, 400],
    [{ "content-type": "application/json" }, { connection: body.connection }, 400],
  ] as const) {
    const result = await fetch(url, { method: "POST", headers, body: JSON.stringify(data) });
    assert.equal(result.status, status); assert.ok(!(await result.text()).includes(sentinel));
  }
  assert.equal(fixture.catalogRequests.length, 1); assert.equal(fixture.requests.length, 0);
});

test("closing the local HTTP client cancels its pending supplier request", async (t) => {
  const fixture = await createModelFixture([], { catalog: { hang: true } }); t.after(fixture.close);
  const host = new StandaloneAgentHost(); t.after(() => host.dispose());
  const server = createStandaloneServer({ host });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  t.after(async () => { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); });
  const controller = new AbortController();
  const operation = fetch(`http://127.0.0.1:${address.port}/api/model-catalog`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ connection: connection(fixture.baseUrl), apiKey: sentinel }), signal: controller.signal });
  const rejected = assert.rejects(operation);
  await waitUntil(() => fixture.catalogRequests.length === 1); controller.abort(); await rejected;
  await waitUntil(() => fixture.catalogClosed === 1);
});
