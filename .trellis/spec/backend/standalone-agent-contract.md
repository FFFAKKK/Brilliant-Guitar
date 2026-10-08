# Standalone Agent Contract

## 1. Scope / Trigger

Applies to `packages/agent-runtime`, `apps/agent`, and Workbench compatibility adapters. An independent page is insufficient: the runtime must install and run without Workbench, Guitar, Tauri, React, or score implementations. Pi 1.0.3 is reused; the Controller remains the sole capability execution owner.

## 2. Signatures

```ts
createAgentSession({ provider, tools?, store?, budget?, retainTranscript?, checkpoint? }): AgentSession
session.getSnapshot(): AgentSessionSnapshot
session.subscribe(listener): () => void
session.setEnabled(enabled): Promise<void>
session.submit(message): Promise<AgentRunOutcome>
session.cancel/reset/dispose(): Promise<void>
session.hasActiveRun(): boolean
session.restoreTranscript(sessionId, messages): Promise<void>
parseSessionLibrary(value): AgentSessionLibrary
parseTranscript(value): readonly AgentChatMessage[]
new AgentToolRegistry(tools?: readonly RegisteredAgentTool[])
new StandaloneAgentHost({ tools? })
await StandaloneAgentHost.open({ tools?, settingsStore?, credentialProtector?, sessionStore? })
host.saveCredential(apiKey): Promise<void>
host.saveProfile({ profileId: string|null, name, configuration, rememberCredential, apiKey? }): Promise<void>
host.selectProfile(profileId)/deleteProfile(profileId): Promise<void>
new FileConnectionSettingsStore(directory): ConnectionSettingsStorePort
new WindowsCredentialProtector(): CredentialProtectorPort
new FileSessionStore(directory): SessionStorePort
host.selectConversation(sessionId)/renameConversation(sessionId, title)/archiveConversation(sessionId, archived): Promise<void>
host.retrySessionSave(): Promise<void>
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
| POST `/api/profiles/save` | exact `{profileId: string|null, name, configuration, rememberCredential, apiKey?: string}` → v2 snapshot |
| POST `/api/profiles/select`, `/api/profiles/delete` | exact `{profileId: string}` → v2 snapshot |
| POST `/api/session/enable` | exact `{enabled: boolean}` → snapshot |
| POST `/api/session/messages` | exact `{message: string}` → accepted snapshot, completion through SSE |
| POST `/api/session/cancel`, `/api/session/reset` | exact `{}` → snapshot |
| POST `/api/conversations/select` | exact `{sessionId: string}` → v3 snapshot |
| POST `/api/conversations/rename` | exact `{sessionId: string,title: string}` → v3 snapshot |
| POST `/api/conversations/archive` | exact `{sessionId: string,archived: boolean}` → v3 snapshot |
| POST `/api/conversations/save` | exact `{}` → v3 snapshot, retries disk save only |
| POST `/api/model-test` | exact `{}` → `{connected: boolean}`, isolated probe Session |
| POST `/api/model-catalog` | exact `{connection: {providerId, protocol, baseUrl}, apiKey?: string}` → `{connection, models: [{id}]}` |

## 3. Contracts

- Common public contracts are defined in the runtime package. Application decoders consume them; UI does not implement a second run state machine. Workbench old imports are thin exports or business compositions over the same Controller.
- Preserve historical Run/event/External Protocol v1 DTOs, including measure input compatibility fields. Actual selection matching, score reading/mutation and completion verification stay with the software host. Missing business recovery handlers reject input restoration.
- Default Session has no tools. Injected query/analysis tools require no document and use the same resolved allowlist, validation and invocation path. Pi tools capture decisions; they never execute the registry.
- Default context retains the latest 16 successful complete user/assistant pairs. Budget overflow omits whole older pairs and exposes `omittedHistoryTurns`; failure/cancellation/interruption do not enter successful history. Legacy Session consumers keep a bounded display window. Standalone opts into `retainTranscript=true`: visible/persisted messages keep all accepted turns up to4096 messages; omission counts include earlier successful turns beyond the model window. The default in-memory RunStore keeps32 terminal runs; it is distinct from SessionStore. Software stores retain their existing behavior.
- Reserve an active run before publishing snapshots. Observer reentry cannot submit another run. Repeated enable does not change a running state. Disabling revokes submissions before awaiting cancellation. Reset/dispose invalidate the old generation; late progress must match the active run and generation.
- `StandaloneAgentSnapshot` v3 has exact fields: `schemaVersion=3`, `sequence`, `configuration`, `credentialPresent`, `testingConnection`, `session`, `connections`, `storage`, `conversations`. `connections={schemaVersion:1,selectedProfileId,profiles:[{id,name,configuration,recentModels,credentialRemembered}]}`; selected configuration equals the top-level configuration. `storage={configuration:memory|file,credentialProtection:windows-dpapi|unavailable,notice:string|null}`. `conversations={selectedSessionId,items:[{sessionId,title,createdAt,updatedAt,archived,messageCount}],storage:memory|file,saving:boolean,notice:string|null}`. Selected session ID/messageCount must agree with the active Session snapshot, and cannot select an archived record. No credential values/ciphertext. Old standalone snapshots require client reload; connection filev1 and Runtime/External decision DTOs retain their versions.
- `SessionStorePort={kind:memory|file,load():Promise<AgentSessionLibrary|null>,save(library):Promise<void>,dispose?():Promise<void>}`. `sessions.json`v1 exact `{schemaVersion:1,selectedSessionId,sessions:[{sessionId,title,createdAt,updatedAt,archived,messages}]}`. 1–200 unique sessions; safe IDs 1–160 characters; titles1–80 characters without controls; nonnegative safe timestamps with updatedAt>=createdAt; up to4096 messages/session, each content<=32768 chars, library<=16MiB. Messages are exact `{id,runId,role,content,status}`, alternating complete user and assistant with matching run IDs, unique message/run IDs per conversation. Assistant status includes interrupted. Shared Runtime decoder owns persistent and restoration validation; private/extra/future fields fail.
- Runtime `checkpoint(snapshot)` is awaited before Controller starts and after terminal messages. Start failure sends zero model/tool requests and retains a failed record. End failure keeps actual completed output/outcome in memory; host shows unsaved notice. Host coalesces streaming checkpoints at250ms and serializes all writes; record saves are temporary/fsync/rename with file PID lock. `hasActiveRun` remains true through terminal checkpoint, preventing overlap. No user-visible disk success before completion; explicit retry saves without generation. An absent file is `undefined` at the Node file adapter boundary, so literal JSON null remains invalid and is never treated as missing.
- Startup normalizes streaming assistant messages to interrupted, persists the normalization, restores transcript and successful history while staying disabled, and never resumes tools/model. Startup failure disposal must not write default data over invalid files. Host has one active Session; new-session cancels and preserves the old transcript, persists a new record before selecting it. Idle select/rename/archive persist metadata first; active changes409. Archiving the selected session chooses another unarchived record or creates one. Model configuration remains global. Probe Sessions have no chat store. Shutdown cancels and flushes before releasing storage locks.
- UI uses the authoritative v3 projection for desktop/sidebar and mobile native dialog; searches conversation names and supports archive restore. Session mutations freeze composer input until accepted selection is installed. Assistant Markdown uses react-markdown10.1.0 + remark-gfm4.0.1; raw HTML skipped, remote images rendered as text, links retain default URL filtering. User text is literal. Message/code copies preserve source; Windows clipboard newline normalization is expected. Markdown whitespace must override plain-text pre-wrap by a scoped `.message-content.markdown` selector.
- Provider IDs: `deepseek` or `openai-compatible`; protocol: `chat-completions`. Base URL is HTTPS, or loopback HTTP for fixtures; no URL credentials/query/fragment. Model ID is trimmed, nonempty, <=160 characters, without controls.
- Credentials default to process memory and are passed explicitly to Pi's completions transport without environment discovery. Opt-in remembering uses host-side Windows DPAPI/CurrentUser; plaintext never enters browser persistence or files. Each profile's key is bound to its ID, provider, protocol and normalized full URL. Changing a profile's service target invalidates that profile's memory key/ciphertext and disables Agent; selecting another profile uses only its own key and disables Agent. Draft target changes clear the unsaved key and model list. Saving/opening/reading/activation sends no supplier traffic; enabled submission or explicit probe sends generation, explicit discovery sends metadata only while disabled.
- `connections.json` v1: exact `{schemaVersion:1,selectedProfileId,profiles:[{id,name,configuration,recentModels,sealedCredential:string|null}]}`. IDs match `[a-zA-Z0-9_-]{1,80}`, names have 1–80 non-control characters, 1–20 distinct profiles, at most 5 distinct valid recent model IDs; selected ID must exist. Validated ciphertext is bounded base64 <=8192 characters. Unknown/private fields and future versions fail; <=256 KiB file. The shared connection contract owns normalization and public projection.
- Production startup uses `.agent-data` relative to cwd, overridable by `--data-dir <directory>`; root npm scripts run the standalone package so the normal directory is `apps/agent/.agent-data`. Saving is temporary write + fsync + rename; host installs/publishes the new configuration only after storage succeeds. Mutation serialization blocks enable/reset/submit during save. Disposal waits for pending saves before releasing resources. A PID lock prevents simultaneous hosts using a directory; only a definitely exited owner permits stale-lock removal. Invalid/future data is preserved rather than reset.
- DPAPI receives data and entropy via stdin of a hidden fixed-command PowerShell child; no user values in command arguments, no raw stderr in errors. 10-second deadline and bounded stdout. Unsupported platform or failure never falls back to plaintext. Remembering requires a file store and supported protector; UI leaves the option unavailable otherwise. Forgetting removes ciphertext while the current memory key can remain usable. Startup restore failure preserves ciphertext but exposes absent credential plus a stable notice; startup always remains disabled and sends no model request.
- Legacy model-config/model-credential endpoints bridge through the same profile mutations. `saveCredential` is now async: callers must await it before enabling or querying. The settings UI uses one atomic profile save, clears its password on success, supports named profiles/new/select/delete, service presets, model search and recent choices. New unsaved profiles cannot reuse an active profile's credential in the UI. Disconnected client epochs discard stale results for every action.
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
| Host reset | cancel current work; persist old conversation and new selected ID; new active history empty, previous transcript retained |
| Dispose | cancel work, clear memory keys and listeners; remembered ciphertext can restore on next startup |
| Remembered startup | restore settings/selected key if decryptable and selected chat; Agent disabled, no supplier traffic |
| Interrupted startup | keep partial content, mark interrupted, exclude from successful model history; no execution replay |
| Conversation mutation during run/probe/save | 409 busy; current selection/metadata remain authoritative |
| Session disk write failure | 503 sessions-unavailable or async unsaved notice; in-memory content retained, metadata selection unchanged |
| Invalid/future/null session file or file lock | startup sessions-invalid; original file unchanged, no disposal overwrite |
| Profile save failure | 503 `settings-unavailable`; old public configuration and memory key remain authoritative |
| Unsupported remembering | 400 with explicit explanation; no plaintext persistence |
| Protector failure | 503 `credential-unavailable`; stable diagnostic, no raw stderr/secret |
| Invalid/future storage file or live directory lock | startup fails visibly and leaves the original file intact |
| Profile switch/delete during run/probe/save | 409 `busy`; no target/key change |
| Delete final profile / unknown ID | 400; keep at least one valid connection |
| Model catalog missing key / wrong target / invalid body | 400; no metadata traffic, no stored target/key mutation |
| Catalog during active generation/probe | 409 `busy`; no metadata traffic |
| Supplier 401/403 | 502 `catalog-unauthorized`; actionable key/address message, no raw body |
| Supplier 404/405/501 | 502 `catalog-unavailable`; retain custom input |
| Invalid/oversized catalog | 502 `catalog-invalid`; stable diagnostic, no secret echo |
| Catalog timeout / cancellation | 504 `catalog-timeout` / 502 `catalog-cancelled`; abort supplier transport |
| Empty valid catalog | 200 with `models: []`; UI explains custom input remains available |

## 5. Good / Base / Bad Cases

- Good: install a packed runtime alone, inject Fake decision provider, and complete a headless conversation; separately verify real Pi against local HTTP fixture.
- Base: production standalone UI opens disabled with no model traffic, even if a remembered key restores; user configures or manually activates.
- Bad: UI calls the model SDK, reuses a key for a new address, fills fake production replies, or maintains another Controller.
- Good: get model IDs with an unsaved target/key while Agent is disabled, select one, then explicitly save. Catalog failure leaves custom input usable.
- Good: restore40 messages, supply only budgeted successful turns to Pi, mark partial old streams interrupted and let the user explicitly submit a new request.

## 6. Tests Required

- Packed isolated installation + dependency boundaries; this smoke is Fake, not a real service result.
- True Pi + Fake stream: two turns with >800-character reply tail, empty tools, single tool execution, authoritative next-turn feedback, invalid tool zero execution, budget omission, cancel/reset, synchronous reentry and enable races.
- Local HTTP model fixture: exact URL/header/options; request-local aliases; usage-only ending; full JSON; unknown alias; incomplete/non-object JSON; missing finish; errors; cancellation/timeout; identity mismatches send no traffic.
- Production host + HTTP/SSE: disabled/config-only zero requests, multi-turn history, explicit isolated probe, busy 409, strict snapshot, sentinel credential isolation, target-bound key reset, Host/Origin checks.
- Actual browser desktop/narrow view: configure/save/enable/two turns/stream/stop/failure/reset, password input clears, no browser direct model calls or credential persistence. Local fixture results must be labeled.
- Workbench typecheck/test/build, existing score approval/recovery/external fixtures. Rust check/test for original host compatibility. In restricted Windows sessions set test `TEMP/TMP` to a workspace-owned scratch directory if default temp file replacement is denied; do not patch unrelated Rust storage logic.
- Real DeepSeek remains a separate acceptance step with the user entering their own key in the UI. Never infer real API success from Fake/fixture tests.
- Catalog fixture: exact GET path/Bearer, no generation or snapshot mutation, temporary vs target-bound saved key, strict input/output, deduplication/stripped metadata, empty list, 401/403/404/500, malformed/oversized response, redirects, timeout, caller/host/HTTP-close cancellation and busy rejection. Browser: fetch/select/save, preserved custom ID, key input clearing, error/empty/cancel, target invalidation, desktop/narrow layout.
- M1 persistence: real file restart with two suppliers and independent Bearer headers; memory-only key absent after restart; actual Windows DPAPI round-trip, wrong target rejection, remembered restart/forget/target change; public snapshot/file free of plaintext key; future/malformed files unchanged; second host lock rejection; injected write failure rolls back state; pending save rejects select/enable; strict profile HTTP schemas and busy status. Actual desktop/narrow browser: create/save/select/delete, remember/forget, model search/recent IDs, probe/chat/stop, password clearing, no vendor traffic beyond local fixture.
- M2: >16 turns survive disk restart; earlier content visible but omitted from budgeted model input; two sessions isolate context; failed/cancelled/interrupted partial replies retained and excluded from successful memory; pre-request write failure sends zero supplier requests; terminal failure retains actual output and explicit save repairs disk without new generation; streaming checkpoint crash restore does not replay; corrupt/null/future files preserved through failed Host.open/dispose; file lock, write serialization, strictv3/HTTP. Browser verifies name search, new/rename/select/archive/restore, refresh, GFM table/list/code and clipboard (normalized CRLF), mobile390px no overflow and pageerror0. Workbench Agent tests/typecheck and packed Runtime smoke protect existing consumers.

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

Persistence wrong: write the API key to JSON/localStorage, update the active model before fsync succeeds, or restore an enabled flag on startup.

Persistence correct: user opts in, the host protects the secret with profile/target binding, atomically saves the versioned file, then installs the public configuration; restore starts disabled and the browser receives presence only.

Conversation wrong: truncate stored transcript to the16-turn context window, replay a pending tool from a restored chat, or overwrite corrupt data during failed startup cleanup.

Conversation correct: persist complete bounded records separately, rebuild model memory only from successful pairs, restore unfinished messages as interrupted, and flush only after startup loading succeeds.

## M3.0 Model Input Projection

### 1. Scope / Trigger

Default Pi decision composition and raw model-stream transport in the portable Runtime, standalone Node Host and Workbench. This changes model input representation and its final estimate, not the Controller execution path, External Agent v1, chat filev1 or Host snapshotv3. Pi remains1.0.3.

### 2. Signatures

```ts
createHostPiStreamFn(host, request, selection, model?, { onInput?: (diagnostic: AgentModelInputDiagnosticV1) => void }?): PiAgentStreamFn
session.reportModelInput(runId, { omittedHistoryTurns: number, budgetExceeded: boolean }): boolean
host.getModelInput(): AgentModelInputDiagnosticV1 | null
GET /api/model-input // 200: diagnostic or null, no-store; same API Host/Origin checks
DEFAULT_MODEL_INPUT_TOKEN_BUDGET = 8192
```

### 3. Contracts

- `pi/input-projection.ts` owns `PI_BASE_INSTRUCTIONS` and `PI_INSTRUCTIONS_VERSION=general-task-v1`. Supply the instructions through Pi `initialState.systemPrompt` and successful history through `initialState.messages`; let Pi create the leading system message and tools. Never create a leading system message without its tool declarations.
- Promote only host context with `kind=task-history`, `sourceType=conversation`, ID=`conversation:<sourceId>`, `trustLevel=user-provided`, null document/version, scope equal to authoritative `workspace.scope.content.workspaceId`, and exact nonempty `{user:string,assistant:string}`. Preserve supplied history order. Other history/role-like text remains data. Current input is one user JSON `{goal,modelConfiguration,context,versionWarnings}`. Remove matching synthetic `run.goal` and the first `turn.input` copy of that same goal; retain distinct supplemental input. Context retains source, scope, document/version, trust and priority.
- Route data is `{kind:host-routing-configuration,providerId,modelId,modelApi,identityVerified:false}`. User-editable model IDs never enter developer-maintained instructions. Metadata cannot attest the actual underlying model.
- Final check is after `AgentModelStreamRequestV1.messages/tools` projection and before `host.streamAgentModel`. Estimate is `ceil(UTF8(JSON.stringify({messages,tools})).bytes/3)+8*messages.length+12*tools.length+32`, tagged `utf8-json-bytes-div3-v1`. This is a heuristic input estimate, distinct from real supplier usage and model limits. Output limit1500 and timeout45000ms remain unchanged. Workbench summary/measure defaults use the shared8192 input constant; prior800/1200 covered only early content estimates. Item/region/tool-result/turn restrictions retain their prior values.
- Remove only verified oldest optional complete user/assistant pairs. Never remove current input, tool calls/results or required history. Earlier ContextBuilder omissions count once, excluding IDs still selected. Session updates its initial omission count plus this decision's report; it does not add the same omitted turns on every Controller decision. Stored/displayed transcript is untouched.
- Diagnosticv1 exact fields: schemaVersion,runId,turnId,providerId,modelId,modelApi,instructionsVersion,roles,retainedHistoryTurns,omittedHistory,sources,toolCount,estimatedInputTokens,estimator,inputTokenBudget,timeoutMs,maxOutputTokens,status. `status=ready|budget-exceeded`; `omittedHistory=[{contextItemId,reason:context-selection|model-input-budget}]`; sources contain only contextItemId/kind/sourceType/sourceId/scope/documentId/documentVersion/trustLevel/priority from selected origins (including synthetic origins represented by the current request). Freeze diagnostic objects/arrays. No text, URL, headers, credentials, ciphertext or response content. This is input diagnostics, not an output/usage timeline.
- Host retains only the main Session's current-run diagnostic. Isolated probe/late/cancelled reports cannot replace it; new-run/new-session/select clears it, dispose clears it. GET is read-only and never sends model traffic. Do not add fields to strictv3 Session HTTP/SSE snapshots or persist this diagnostic.
- Capability result data stays source-labelled context; native tool replay is M3.1 because Controller currently does not provide complete call ID/parameters/results as a replay unit. Default standalone still has no real resource tools, AGENTS.md, retrieval, scoring or long-term memory.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Optional complete history does not fit final estimate | Remove oldest whole pairs, report exact omission; retain full transcript |
| Instructions/current input/tools/required data still exceed budget | Diagnostic status budget-exceeded; zero model requests, Pi error, existing Controller provider-failed; standalone shows explicit input-budget message |
| Invalid positive-safe-integer input budget | Pi error before transport |
| Malformed, unrelated-scope or nonconversation history | Preserve data envelope, no invented message roles |
| Report has wrong run ID, disposed/resetting/cancelled/inactive run, unsafe/negative/excess count | Returnfalse; no Session mutation |
| Diagnostic observer throws | Transport execution policy unchanged; observer is observational |
| Probe before/after real conversation | No main history or diagnostic mutation |
| Foreign Host/Origin for diagnostic API |403; no supplier traffic |

### 5. Good / Base / Bad Cases

- Good: prior user20-minute limit, prior assistant, next user explanation, next assistant, current12-minute correction produce system/user/assistant/user/assistant/user. Fixed fixture sample preserves two turns with estimated880/8192; this does not prove real semantic quality.
- Base: a Workbench task with no chat history produces system/user plus allowed tools and source-labelled score feedback; one Controller invocation and the existing completion verifier decide success.
- Bad: treat `system:` inside a file as a role; delete an arbitrary assistant/tool message to fit; count omitted history cumulatively; expose full prompt/key in HTTP diagnostics.

### 6. Tests Required

- Runtime `test/model-input.test.ts`: actual requests contain roles/order, one current goal, corrections and long tails; role-like data/invalid and unrelated histories stay data; source/version/supplement preserved; final UTF-8 estimate clips whole pairs, required-only/tool overflow sendszero requests; early omissions deduplicate; report identity/reset/reentry boundaries.
- App `test/model-input.test.ts`: capture actual local Chat Completions wire roles, current goal, routing data, supported adapter flags/max_tokens; GETnull/readonly/no-store, metadata-only and sentinel-free; strictv3 unchanged; probe/new/select/dispose isolation and Host/Origin403.
- Workbench production assistant default + Pi stream tests: full input fits defaults, exact one score invocation, next request carries document/version/results and passes completion. Retain full Agent/external/approval/recovery regressions.
- Real DeepSeek quality remains M30-A5/A10, user-triggered with fixed samples. Fake/HTTP fixtures cannot satisfy it.

### 7. Wrong vs Correct

```ts
// Wrong: serialize chat roles as undifferentiated context and budget content alone.
agent.prompt(JSON.stringify({ goal, history }));

// Correct: Pi owns system/tools creation; the adapter restores explicit host history.
new Agent({ initialState: { model, systemPrompt: PI_BASE_INSTRUCTIONS, messages: input.history, tools } });
// Final projected messages/tools are checked before host.streamAgentModel.
```
