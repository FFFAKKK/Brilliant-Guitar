# Standalone Agent Contract

## 1. Scope / Trigger

Applies to `packages/agent-runtime`, `apps/agent`, and Workbench compatibility adapters. An independent page is insufficient: the runtime must install and run without Workbench, Guitar, Tauri, React, or score implementations. Pi 1.0.3 is reused; the Controller remains the sole capability execution owner.

## 2. Signatures

```ts
createAgentSession({ provider, tools?, store?, budget? }): AgentSession
session.getSnapshot(): AgentSessionSnapshot
session.subscribe(listener): () => void
session.setEnabled(enabled): Promise<void>
session.submit(message): Promise<AgentRunOutcome>
session.cancel/reset/dispose(): Promise<void>
new AgentToolRegistry(tools?: readonly RegisteredAgentTool[])
new StandaloneAgentHost({ tools? })
host.discoverModels({ connection, apiKey? }, signal?): Promise<AgentModelCatalog>
parseAgentModelConnection(value): AgentModelConnection
```

Root commands: `agent:dev`, `agent:build`, `agent:start`, `agent:typecheck`, `agent:test`. Node >=22.19. Independent startup never calls kernel build, Workbench, or Tauri.

| HTTP endpoint | Request / response |
|---|---|
| GET `/api/session` | authoritative `StandaloneAgentSnapshot` |
| GET `/api/session/events` | SSE snapshot, monotonically increasing sequence per host process |
| PUT `/api/model-config` | exact `{providerId, protocol, baseUrl, modelId}` → snapshot |
| PUT `/api/model-credential` | exact `{apiKey}` → snapshot containing presence only |
| POST `/api/session/enable` | exact `{enabled: boolean}` → snapshot |
| POST `/api/session/messages` | exact `{message: string}` → accepted snapshot, completion through SSE |
| POST `/api/session/cancel`, `/api/session/reset` | exact `{}` → snapshot |
| POST `/api/model-test` | exact `{}` → `{connected: boolean}`, isolated probe Session |
| POST `/api/model-catalog` | exact `{connection: {providerId, protocol, baseUrl}, apiKey?: string}` → `{connection, models: [{id}]}` |

## 3. Contracts

- Common public contracts are defined in the runtime package. Application decoders consume them; UI does not implement a second run state machine. Workbench old imports are thin exports or business compositions over the same Controller.
- Preserve historical Run/event/External Protocol v1 DTOs, including measure input compatibility fields. Actual selection matching, score reading/mutation and completion verification stay with the software host. Missing business recovery handlers reject input restoration.
- Default Session has no tools. Injected query/analysis tools require no document and use the same resolved allowlist, validation and invocation path. Pi tools capture decisions; they never execute the registry.
- Default context retains the latest 16 successful complete user/assistant pairs. Budget overflow omits whole older pairs and exposes `omittedHistoryTurns`; failures/cancellation do not enter successful history. Visible messages are bounded to 16 pairs; the default in-memory Session store keeps 32 terminal records. Software stores retain their existing behavior.
- Reserve an active run before publishing snapshots. Observer reentry cannot submit another run. Repeated enable does not change a running state. Disabling revokes submissions before awaiting cancellation. Reset/dispose invalidate the old generation; late progress must match the active run and generation.
- `StandaloneAgentSnapshot` has exact fields: `schemaVersion=1`, `sequence`, `configuration`, `credentialPresent`, `testingConnection`, `session`. No credential values. Session snapshot and model config use shared strict decoders.
- Provider IDs: `deepseek` or `openai-compatible`; protocol: `chat-completions`. Base URL is HTTPS, or loopback HTTP for fixtures; no URL credentials/query/fragment. Model ID is trimmed, nonempty, <=160 characters, without controls.
- Credentials exist only in host memory, are passed explicitly to Pi's completions transport, and never use environment discovery. Changing service type/address clears the saved key and disables Agent; changing the settings draft target clears its unsaved key and model list. Saving/opening/reading/activation alone sends no supplier request. Enabled submission or explicit connection test sends generation; explicit model discovery sends metadata only and can run while disabled.
- Connection decoder owns the exact three fields `providerId`, `protocol`, `baseUrl`; the existing four-field model configuration remains compatible and adds validated `modelId`. Discovery needs no placeholder model. A draft key is ephemeral; absent draft key can reuse the host key only when provider/protocol/normalized URL match. Discovery never saves, activates, mutates history, or changes the Session snapshot.
- Metadata transport requests GET `${baseUrl}/models` with explicit Bearer auth and preserves the full configured path prefix. No redirect following or automatic service fallback. Deadline 10 seconds, response <=1 MiB, <=500 source items, model IDs satisfy the shared configuration ID validator; deduplicate in supplier order and strip all extra metadata. If projected IDs contain the key, fail with a stable diagnostic.
- Catalog requests have independent cancellation controllers. Configuration/key changes, cancel/reset/dispose and a disconnected local HTTP client abort pending transport. Closing settings aborts its query; a new client connection epoch rejects old results. Draft target/key changes clear the old list. Preserve manually supplied custom IDs; select an existing current ID or fill the first result only when the model was not manually supplied (or is empty). Choices remain drafts until save.
- Model-specific options stay in the transport. DeepSeek sets `thinking.type=disabled`. Request-local aliases `tool_1`, `tool_2`, etc. map canonical capability names to wire names and back. Unknown aliases fail. Do not execute Pi's tolerant partial-JSON parse result: accumulate exact argument deltas and strictly parse a complete JSON object before completion. Missing finish reason, truncation, duplicate IDs, usage inconsistency and unknown tools fail before capability dispatch.
- Local server listens on `127.0.0.1`; exact local Host and same Origin checks; JSON body <=64 KiB. UI and API use one origin. SSE reconnect reads a fresh snapshot and cannot replay execution. Client connection epochs discard old HTTP responses and allow sequence reset after host restart.
- Windows `file:` dependencies use `install-links=true`. Prebuild scripts build the runtime and refresh each installed generated copy. Do not introduce symlink privileges or source aliases back into Workbench.
- Source startup/tests use Node strip-only TypeScript: avoid parameter properties/enums that need transformation. Typecheck alone does not prove source startup; run the actual source test/start command.

## 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Disabled submission/probe | no model request; stable 400 `not-enabled` |
| Active run/probe plus submit/config/credential write | 409 `busy`; no second request or target change |
| Repeated enable during a run | idempotent; status stays running |
| Invalid fields/config/body | stable 400; do not return raw model/SDK errors |
| Invalid Host/Origin | 403; no host mutation |
| Model error includes secrets | stable transport error; no key in context/Run/SSE/logs |
| Unknown alias/incomplete JSON/missing finish | one failed stream terminal; zero tool executions |
| Cancellation/timeout | abort corresponding model transport; isolate late results |
| New service target | key absent and Agent disabled |
| Reset | cancel current work; new session ID; empty history/messages |
| Dispose | cancel work, clear credential and listeners; no process restart persistence promise |
| Model catalog missing key / wrong target / invalid body | 400; no metadata traffic, no stored target/key mutation |
| Catalog during active generation/probe | 409 `busy`; no metadata traffic |
| Supplier 401/403 | 502 `catalog-unauthorized`; actionable key/address message, no raw body |
| Supplier 404/405/501 | 502 `catalog-unavailable`; retain custom input |
| Invalid/oversized catalog | 502 `catalog-invalid`; stable diagnostic, no secret echo |
| Catalog timeout / cancellation | 504 `catalog-timeout` / 502 `catalog-cancelled`; abort supplier transport |
| Empty valid catalog | 200 with `models: []`; UI explains custom input remains available |

## 5. Good / Base / Bad Cases

- Good: install a packed runtime alone, inject Fake decision provider, and complete a headless conversation; separately verify real Pi against local HTTP fixture.
- Base: production standalone UI opens disabled with no key and no model traffic; user fills settings and manually activates.
- Bad: UI calls the model SDK, reuses a key for a new address, fills fake production replies, or maintains another Controller.
- Good: get model IDs with an unsaved target/key while Agent is disabled, select one, then explicitly save. Catalog failure leaves custom input usable.

## 6. Tests Required

- Packed isolated installation + dependency boundaries; this smoke is Fake, not a real service result.
- True Pi + Fake stream: two turns with >800-character reply tail, empty tools, single tool execution, authoritative next-turn feedback, invalid tool zero execution, budget omission, cancel/reset, synchronous reentry and enable races.
- Local HTTP model fixture: exact URL/header/options; request-local aliases; usage-only ending; full JSON; unknown alias; incomplete/non-object JSON; missing finish; errors; cancellation/timeout; identity mismatches send no traffic.
- Production host + HTTP/SSE: disabled/config-only zero requests, multi-turn history, explicit isolated probe, busy 409, strict snapshot, sentinel credential isolation, target-bound key reset, Host/Origin checks.
- Actual browser desktop/narrow view: configure/save/enable/two turns/stream/stop/failure/reset, password input clears, no browser direct model calls or credential persistence. Local fixture results must be labeled.
- Workbench typecheck/test/build, existing score approval/recovery/external fixtures. Rust check/test for original host compatibility. In restricted Windows sessions set test `TEMP/TMP` to a workspace-owned scratch directory if default temp file replacement is denied; do not patch unrelated Rust storage logic.
- Real DeepSeek remains a separate acceptance step with the user entering their own key in the UI. Never infer real API success from Fake/fixture tests.
- Catalog fixture: exact GET path/Bearer, no generation or snapshot mutation, temporary vs target-bound saved key, strict input/output, deduplication/stripped metadata, empty list, 401/403/404/500, malformed/oversized response, redirects, timeout, caller/host/HTTP-close cancellation and busy rejection. Browser: fetch/select/save, preserved custom ID, key input clearing, error/empty/cancel, target invalidation, desktop/narrow layout.

## 7. Wrong vs Correct

Wrong:

```ts
const argumentsValue = piToolCall.arguments; // partial JSON may have been repaired
await tools.invoke(argumentsValue); // model transport becomes an executor
```

Correct:

```ts
const argumentsValue = strictJsonObject(JSON.parse(collectedWireDeltas));
return { type: "tool-call", callId, name: canonicalName, arguments: argumentsValue };
// Pi produces AgentDecision; the existing Controller validates and executes it.
```

Catalog wrong: silently fetch on page open, guess a model before discovery, or forward an old saved key to the current draft URL.

Catalog correct: explicitly query the validated three-field connection, use a provided draft key or an exactly matching stored key, return only validated IDs, and leave saving/activation to separate user actions.
