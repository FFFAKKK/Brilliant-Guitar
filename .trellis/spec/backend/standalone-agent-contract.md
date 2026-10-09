# Standalone Agent Contract

Current standalone snapshot is v5, connection storage/public settings v2, chat file/External protocol v1. Earlier milestone sections record their original boundaries; c1 below supersedes their standalone budget/settings versions.

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
host.saveProfile({ profileId: string|null, name, configuration, rememberCredential, apiKey? }): Promise<void> // legacy bridge
host.saveProfileV2({ schemaVersion:2, profileId, name, configuration, inputPolicy, rememberCredential, apiKey? }): Promise<void>
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
| POST `/api/profiles/save` | exact `{profileId: string|null, name, configuration, rememberCredential, apiKey?: string}` → v5 snapshot |
| POST `/api/connections/profiles-v2` | exact `{schemaVersion:2,profileId,name,configuration,inputPolicy,rememberCredential,apiKey?}` → v5 snapshot |
| POST `/api/profiles/select`, `/api/profiles/delete` | exact `{profileId: string}` → v5 snapshot |
| POST `/api/session/enable` | exact `{enabled: boolean}` → snapshot |
| POST `/api/session/messages` | exact `{message: string}` → accepted snapshot, completion through SSE |
| POST `/api/session/cancel`, `/api/session/reset` | exact `{}` → snapshot |
| POST `/api/conversations/select` | exact `{sessionId: string}` → v5 snapshot |
| POST `/api/conversations/rename` | exact `{sessionId: string,title: string}` → v5 snapshot |
| POST `/api/conversations/archive` | exact `{sessionId: string,archived: boolean}` → v5 snapshot |
| POST `/api/conversations/save` | exact `{}` → v5 snapshot, retries disk save only |
| POST `/api/model-test` | exact `{}` → `{connected: boolean}`, isolated probe Session |
| POST `/api/model-catalog` | exact `{connection: {providerId, protocol, baseUrl}, apiKey?: string}` → `{connection, models: [{id}]}` |

## 3. Contracts

- Common public contracts are defined in the runtime package. Application decoders consume them; UI does not implement a second run state machine. Workbench old imports are thin exports or business compositions over the same Controller.
- Preserve historical Run/event/External Protocol v1 DTOs, including measure input compatibility fields. Actual selection matching, score reading/mutation and completion verification stay with the software host. Missing business recovery handlers reject input restoration.
- Default Session has no tools. Injected query/analysis tools require no document and use the same resolved allowlist, validation and invocation path. Pi tools capture decisions; they never execute the registry.
- Default context retains the latest 16 successful complete user/assistant pairs. Budget overflow omits whole older pairs and exposes `omittedHistoryTurns`; failure/cancellation/interruption do not enter successful history. Legacy Session consumers keep a bounded display window. Standalone opts into `retainTranscript=true`: visible/persisted messages keep all accepted turns up to4096 messages; omission counts include earlier successful turns beyond the model window. The default in-memory RunStore keeps32 terminal runs; it is distinct from SessionStore. Software stores retain their existing behavior.
- Reserve an active run before publishing snapshots. Observer reentry cannot submit another run. Repeated enable does not change a running state. Disabling revokes submissions before awaiting cancellation. Reset/dispose invalidate the old generation; late progress must match the active run and generation.
- `StandaloneAgentSnapshot` v5 has exact fields: `schemaVersion=5`, `sequence`, `configuration`, `credentialPresent`, `testingConnection`, `session`, `connections`, `storage`, `conversations`, `resources`, `activities`. Resource sessionId and activity runId must match Session (M3.1 shapes below). `connections={schemaVersion:2,selectedProfileId,profiles:[{id,name,configuration,inputPolicy,recentModels,credentialRemembered}]}`; selected configuration equals the top-level configuration. `storage={configuration:memory|file,credentialProtection:windows-dpapi|unavailable,notice:string|null}`. `conversations={selectedSessionId,items:[{sessionId,title,createdAt,updatedAt,archived,messageCount}],storage:memory|file,saving:boolean,notice:string|null}`. Selected session ID/messageCount must agree with the active Session snapshot, and cannot select an archived record. No credential values/ciphertext. Old standalone snapshots require client reload; connection filev1 is strictly migrated in memory to v2 (c1 below), Runtime/External decision DTOs retain their versions.
- `SessionStorePort={kind:memory|file,load():Promise<AgentSessionLibrary|null>,save(library):Promise<void>,dispose?():Promise<void>}`. `sessions.json`v1 exact `{schemaVersion:1,selectedSessionId,sessions:[{sessionId,title,createdAt,updatedAt,archived,messages}]}`. 1–200 unique sessions; safe IDs 1–160 characters; titles1–80 characters without controls; nonnegative safe timestamps with updatedAt>=createdAt; up to4096 messages/session, each content<=32768 chars, library<=16MiB. Messages are exact `{id,runId,role,content,status}`, alternating complete user and assistant with matching run IDs, unique message/run IDs per conversation. Assistant status includes interrupted. Shared Runtime decoder owns persistent and restoration validation; private/extra/future fields fail.
- Runtime `checkpoint(snapshot)` is awaited before Controller starts and after terminal messages. Start failure sends zero model/tool requests and retains a failed record. End failure keeps actual completed output/outcome in memory; host shows unsaved notice. Host coalesces streaming checkpoints at250ms and serializes all writes; record saves are temporary/fsync/rename with file PID lock. `hasActiveRun` remains true through terminal checkpoint, preventing overlap. No user-visible disk success before completion; explicit retry saves without generation. An absent file is `undefined` at the Node file adapter boundary, so literal JSON null remains invalid and is never treated as missing.
- Startup normalizes streaming assistant messages to interrupted, persists the normalization, restores transcript and successful history while staying disabled, and never resumes tools/model. Startup failure disposal must not write default data over invalid files. Host has one active Session; new-session cancels and preserves the old transcript, persists a new record before selecting it. Idle select/rename/archive persist metadata first; active changes409. Archiving the selected session chooses another unarchived record or creates one. Model configuration remains global. Probe Sessions have no chat store. Shutdown cancels and flushes before releasing storage locks.
- UI uses the authoritative v5 projection for desktop/sidebar and mobile native dialog; searches conversation names and supports archive restore. Session mutations freeze composer input until accepted selection is installed. Assistant Markdown uses react-markdown10.1.0 + remark-gfm4.0.1; raw HTML skipped, remote images rendered as text, links retain default URL filtering. User text is literal. Message/code copies preserve source; Windows clipboard newline normalization is expected. Markdown whitespace must override plain-text pre-wrap by a scoped `.message-content.markdown` selector.
- Provider IDs: `deepseek` or `openai-compatible`; protocol: `chat-completions`. Base URL is HTTPS, or loopback HTTP for fixtures; no URL credentials/query/fragment. Model ID is trimmed, nonempty, <=160 characters, without controls.
- Credentials default to process memory and are passed explicitly to Pi's completions transport without environment discovery. Opt-in remembering uses host-side Windows DPAPI/CurrentUser; plaintext never enters browser persistence or files. Each profile's key is bound to its ID, provider, protocol and normalized full URL. Changing a profile's service target invalidates that profile's memory key/ciphertext and disables Agent; selecting another profile uses only its own key and disables Agent. Draft target changes clear the unsaved key and model list. Saving/opening/reading/activation sends no supplier traffic; enabled submission or explicit probe sends generation, explicit discovery sends metadata only while disabled.
- `connections.json` v2: exact `{schemaVersion:2,selectedProfileId,profiles:[{id,name,configuration,inputPolicy,recentModels,sealedCredential:string|null}]}`. Exact v1 (without inputPolicy) migrates in memory only; see c1 below. IDs match `[a-zA-Z0-9_-]{1,80}`, names have 1–80 non-control characters, 1–20 distinct profiles, at most 5 distinct valid recent model IDs; selected ID must exist. Validated ciphertext is bounded base64 <=8192 characters. Unknown/private fields and future versions fail; <=256 KiB file. The shared connection contract owns normalization and public projection.
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

## M3.1 Text Resources and Actual Tool Feedback

### 1. Scope / Trigger

Portable Controller/Pi feedback, standalone Node resource host, versioned HTTP/SSE snapshots and resource/activity UI. Pi stays1.0.3; one Controller executes first-party and external decisions. Node snapshotv4 supersedesv3; External v1, raw model-streamv1, chat filev1 and stored Run DTOs retain their shapes.

### 2. Signatures

```ts
AgentSessionOptions.contextItems?: (sessionId: string) => readonly AgentContextItem[];
AgentSessionOptions.allowedToolIds?: () => readonly string[];
AgentSessionOptions.onProgress?: (event: AgentRunProgressEvent) => void;
registry.withTools(tools: readonly RegisteredAgentTool[]): AgentToolRegistry;
AgentProviderRequest.toolFeedback?: readonly AgentToolFeedbackGroup[];
POST /api/resources/add // exact {sessionId,name,text}; request JSON <=256KiB
POST /api/resources/remove // exact {sessionId,resourceId}; request JSON <=64KiB
resource.read-text v1 // exact {resourceId,start,maxCharacters}
```

### 3. Contracts

- Browser File selection is the authorization entry. Check original bytes<=32KiB, decode with fatal UTF-8, validate decoded bytes<=32KiB, TXT/MD basename1–128 with no separators/control characters, reject binary controls and unpaired surrogates. Host repeats validation. At most3 resources; no silent truncation or model-supplied disk paths. Session IDs reuse `isSessionId`, resource IDs are host opaque identities. Keep immutable code-point snapshots in memory only; switch/new-session/dispose releases them. Refresh reuses the same process directory. Run-active mutations reject before changing any resource.
- Public resources exact `{sessionId,items:[{resourceId,version:1,name,byteLength,characterCount}]}` contain no body. Required authoritative `resource.catalog` is metadata only; no resources means no read tool in the allowed catalog. The handler checks current session, running state and strict input before reading and rechecks activity before returning. Probe receives no directory/tools.
- `start` is a nonnegative safe integer, `maxCharacters`1–4096; result exact `{resourceId,version:1,name,start,nextStart,totalCharacters,text,eof,contentTrust:"user-provided"}`. Full serialized result UTF-8 <=12KiB including escaping and metadata; binary-search the actual page length. `nextStart` counts code points; `eof` is true only at the real end. Runtime authoritative execution provenance does not promote document text to instructions.
- New execution records form run-local groups exact `{runId,turnId,calls:[{call,invocationId,result,source}]}` after all calls succeed. Each `call` preserves callId/capabilityId/contractVersion/input; `result` is the actual completed envelope; source is the actual context provenance without body/estimate. Provider gets a detached deeply frozen copy. Groups are not added to persisted Run DTOs or inferred from transcript text.
- Pi validates run identity, nonempty complete groups, unique call and invocation IDs, matching result identity/version, authoritative capability-result source. Restore one current user JSON followed by assistant tool calls and tool results; use `continue()` when feedback exists and `prompt()` otherwise. Current JSON reflects current run/workspace context and need not be byte-identical to the first request. Remove replayed result bodies from ordinary context, retaining the metadata in diagnostics. Optional chat pairs can be removed; native groups stay whole and required. Required overflow blocks the subsequent transport without repeating execution. Old recovered runs without call identity use old source-labelled context.
- Node request aliases cover current declarations and historical call/result names. Only current aliases enter the reverse map for new output calls; replay cannot confer permission. `json-values.ts` owns the strict JSON projection shared by Pi and Node. External v1 still explicitly projects its old context fields and never receives unknown internal replay fields.
- v4 snapshot exact11 fields: schemaVersion,sequence,configuration,credentialPresent,testingConnection,session,connections,storage,conversations,resources,activities. Strict decoder binds resources.sessionId to Session and activities.runId to current Run. Activity snapshot exact `{runId,items}` bounded64; each item exact invocationId/turnId/label/status/startedAt/finishedAt/errorCode, status running|completed|failed|cancelled. Only actual Controller capability events create cards. Terminal Run settles leftover running cards; cancelled/terminal/late events cannot upgrade them. New Run/Session clears cards. Activities and resources are process-local; reconnect performs no execution.
- Sample host directory/policy callbacks before reserving active Run; failures leave no partial transcript. Progress callback exceptions are observational. UI disables file/submit/session changes during upload; late upload error feedback is scoped to the original session. Model/connection settings remain host-owned.

### 4. Validation & Error Matrix

| Condition | Behavior |
|---|---|
| Invalid text/name/encoding/extra fields/limit or missing removal |400 invalid-input with bounded resource-specific message; no mutation/generation |
| Resource mutation during Run/probe/config change, or stale upload session |409 busy; resources unchanged |
| Unknown/removed/cross-session resource, bad start/input or inactive execution |Definite capability failure; no successful body/feedback; ordinary tool failure ends Run |
| Mismatched/missing/duplicate native replay identity |Pi rejects before new model request |
| Required native groups exceed final budget |Entire group preserved, budget-exceeded diagnostic; no next request or re-execution |
| Cancel/late tool completion/new session/dispose |Stopped activity stays stopped; no late successful projection/new generation |
| GET/SSE refresh/reconnect |Current metadata/activity projection only; no model/tool replay |
| File text contains role/call-like instructions |User-provided result data, never a fabricated call or source |

### 5. Good / Base / Bad Cases

- Good: select a real UTF-8 MD file, see metadata only in the first request, execute read-text once, then send system/user/assistant(tool call)/tool(actual result) to the next decision with the same callId and host invocationId.
- Base: no added resource yields the original tool-free conversation; explicit probe remains tool-free even with resources present.
- Bad: read arbitrary model paths, serialize full files on upload, generate activity from answer text, create another executor, split a replay group, or grant a historical tool permission through an alias.

### 6. Tests Required

- Runtime tool-feedback: actual Controller/Pi/raw stream; single/multiple calls and successive groups, true execution count and inputs, ID/source mapping, detached freeze, body/goal deduplication, malformed/mismatched/duplicate groups, final group overflow, observer exception, host callback failure and immutable Registry composition.
- App text-resources: actual UTF-8 file through decoder/store/tool/HTTP model fixture, first-request metadata only, exact native wire, actual return text/trust/eof, multi-page replay, Chinese/emoji/escaped12KiB pages,32KiB/3 files/encoding/binary/extra-field errors, unknown/removed/foreign scopes, busy409, stale upload, process-only restart, chat filev1, cancel/late result, probe isolation, strictv4/public secret isolation, SSE reconnect without generation. Historical alias test verifies replay without new-call rights.
- Refresh Workbench's installed runtime copy before regression; all Agent/external/score/approval/recovery tests and typecheck. Score Fake reads both direct tool data and Controller's metadata wrapper; assertions inspect native tools, not duplicate context bodies.
- Test HTTP fixtures bind high loopback ports with bounded collision retry. Low automatic ports can cause Node fetch `bad port` and misleading empty-output/busy failures; never change production validation to hide this test setup failure.
- Actual browser File chooser, completed/failed card, stop, invalid UTF-8 feedback, refresh, desktop/390px layout and console errors. Persist screenshot proof. Local fixture mechanism is separate from user-triggered real DeepSeek M31-A5/M30-A5/A10.

### 7. Wrong vs Correct

```ts
// Wrong: turn a supplied body into an execution result or execute in Pi.
agent.prompt(JSON.stringify({ fileBody, fabricatedToolResult }));
// Correct: Controller creates actual immutable feedback; Pi only resumes reasoning.
const input = projectPiInput(request, model);
if (input.continueFromTools) await agent.continue();
else await agent.prompt(input.prompt);
```


## M3.2a Shared Context Selection and Protected Final Budgets

### 1. Scope / Trigger

Shared ContextBuilder, Session/Controller, Pi final projection and standalone read-only API. The Node host explicitly enables `standalone-context-v1`; Workbench keeps its existing selection policy. Distinct actual invocation identity is fixed for both policies. No Pi fork, second executor, scoring, long-term memory, AGENTS.md or automatic file indexing. External v1, raw model-stream v1, Host v4, chat file v1 and stored Run DTO shapes remain unchanged.

### 2. Signatures

```ts
AgentSessionOptions.contextSelectionPolicy?: "standalone-context-v1";
AgentSessionOptions.onContextSelection?: (report: ContextSelectionReportV1) => void;
AgentRunControllerDependencies.contextSelectionPolicy?: ContextSelectionPolicyId;
AgentRunControllerDependencies.onContextSelection?: (report: ContextSelectionReportV1) => void;
ContextBuilder.build(input: ContextBuildInput, selection?: ContextSelectionOptions): ContextBuildResult;
// selection = {policy, turnId, executedResultIds: ReadonlySet<string>, onSelection(plan)}
AgentProviderRequest.contextSelection?: ContextSelectionPlan;
// plan = {report, optionalRemovalOrder: readonly string[]} -- request-local, deeply frozen metadata
session.getContextSelection(): ContextSelectionReportV1 | null;
session.reportContextSelection(report: ContextSelectionReportV1): boolean;
createHostPiStreamFn(..., {onInput?, onSelection?});
host.getContextSelection(): ContextSelectionReportV1 | null;
GET /api/context-selection // no-store, same Host/Origin validation as other APIs
```

### 3. Contracts

- Session supplies its full bounded successful-history window (default16), without preemptive token clipping under this policy. Protect the latest `min(2, historyTurnBudget, available successful turns)` whole user/assistant pairs, using input order instead of regenerated timestamps. Select older optional pairs newest-first, project selected history in original order. Keep displayed/persisted transcript complete; failed/cancelled/interrupted answers are excluded from successful history.
- ContextBuilder remains the one selector. Before retention, validate exact conversation envelope and current-session resource catalog, expiry, nonnegative safe-integer estimate and serializable content. Required/protected items get no validation exemption. Estimates use at least JSON content characters/4. Only compare a document's version with the current version when its documentId matches. Executed results preserve old evidence/version warnings.
- Controller supplies actual succeeded/completed invocation context IDs for protection. Capability-result key includes full `capability-result:<invocationId>` for both policies. Different invocations reading the same page stay separate; identical duplicates of one identity collapse once. Conflicting same-ID identity/content fails the new policy. Other sources keep their source/object/version/scope deduplication.
- Required items, recent pairs and all actual result units are protected. Other candidates use existing priorities and stable input order; optional conversations at equal priority select newest-first. The plan's optionalRemovalOrder is the reverse optional-selection order. Final Pi budget removes only these complete optional units, reprojects messages and estimates after each removal; never clips a protected pair, goal or native feedback group. Pi bodies appear once per invocation, while External v1 receives every selected actual result through its existing context fields.
- The plan is a Provider request sidecar, never a new ContextBuildResult/stored Run field. Final projected UTF-8 JSON bytes/3 plus message/tool overhead is an engineering estimate, not supplier usage. Default8192 input estimate,1500 output and45000ms timeout remain. Exceeding required input stops before the next transport; already completed executions remain recorded.
- Selection Report v1 exact top-level keys: `schemaVersion:1, policyVersion:"standalone-context-v1", runId, turnId, stage, status, estimator, selected, omitted, budget`. stage is context-selection or model-input, estimator respectively json-characters-div4-v1 or utf8-json-bytes-div3-v1. status is ready, budget-exceeded or invalid-context. IDs are nonempty strings<=512; arrays<=4096. selected exact `{contextItemId, protected, reason}` where reason required|recent-conversation|executed-result|priority and protected iff reason is not priority. Selected IDs are unique. omitted exact `{contextItemId, reason}`; reasons are duplicate|item-count-budget|token-budget|history-turn-budget|expired|invalid-estimate|out-of-scope|identity-conflict|invalid-content|version-mismatch|model-input-budget. Same-ID duplicate omissions can coexist with a selected identity.
- Report budget exact `{estimatedTokens,itemCount,tokenBudget,itemCountBudget,exceeded}` uses nonnegative safe integers; itemCount equals selected length, exceeded equals token/count overflow. Ready/budget-exceeded status matches exceeded; invalid-context can occur independently. Decoder rejects extra keys at every level, future schema and mismatched estimator/stage/protection/counts. Frozen reports contain metadata only, no bodies, keys, URLs or body fingerprints.
- Only the Controller establishes a current selection Turn. Public reports must match the current active Run/Turn and enabled policy; context-selection cannot overwrite that Turn's model-input report. Probe, cancelled/resetting/disposed/inactive state, old Run/Turn and invalid reports reject without mutation. Per-request omission counts are unique actual history IDs plus outside-window base, never cumulative per tool decision. Synchronous observers that reset/cancel invalidate pending observations before invoking further callbacks. Observer exceptions are isolated.
- GET returns null before selection/new Run, after new/switch/disable/stop/dispose. Completed/failed Run retains its latest report while enabled. Reports are process-local, not restored or added to snapshot v4; probes and refresh/SSE reconnect perform no new work. Final Pi reporting is wired explicitly by the Node host; External reports remain at shared context-selection stage.

### 4. Validation & Error Matrix

| Condition | Behavior |
|---|---|
| Protected count/token overflow at shared selection | Existing run.failed budget-exceeded; zero Provider requests; explicit standalone budget message |
| Required/protected expired, invalid estimate, wrong envelope/scope, non-JSON or identity conflict | Report invalid-context; existing run.failed invalid-decision; zero Provider requests; explicit standalone invalid-context message |
| Optional invalid/stale data | Omit whole unit with reason; same-object required stale version fails; foreign document is not compared with current document's numeric version |
| Optional final input overflow | Remove according to optionalRemovalOrder, reproject, record model-input-budget; full transcript unchanged |
| Protected final messages/tools/feedback still exceed input estimate | Diagnostic/report budget-exceeded, zero next transport; existing provider-failed path; actual invocation records remain completed |
| Wrong Run/Turn/stage, future/extra report field, cancelled/disposed state | reportContextSelection returns false; no mutation |
| Report callback throws or synchronously resets/cancels | Observer failure isolated; no stale report publication or new transport after cancellation |
| Foreign HTTP Host/Origin |403; no model traffic |

### 5. Good / Base / Bad Cases

- Good:20-minute instruction followed by12-minute correction and then “继续” retains both original user/assistant pairs and one current goal. If their final encoding cannot fit, stop explicitly instead of silently forgetting the correction.
- Base: Workbench without policy retains original history selection/version warnings and approval/recovery contracts, with the distinct-invocation feedback fix shared by both plugins.
- Bad: same resource/page under different invocations gets collapsed by capabilityId; final Pi budget deletes protected recent pairs; required metadata bypasses scope/expiry; a report is appended to strict Host v4 or stored Run DTO.

### 6. Tests Required

- Runtime context-selection:1/2/16 history windows, original ordering, distinct/repeated invocation identity, wrong scope/expired/invalid/duplicate/conflicting IDs, same/foreign document versions, truthful count/minimum estimates, zero Provider on protected failure, frozen report/strict decoder, stale Turn/probe/stage downgrade/cancel/reset and observer reentry isolation.
- Runtime model-input/tool-feedback: actual Controller/Pi/raw requests for protected recent pairs and zero transport overflow; restored optional history whole-pair removal and replacement counts; optional host-data reprojection; multiple/repeated-page calls with one body per invocation; actual completed records retained on final group overflow; real ExternalAgentAdapter plus serializing FakeExternalAgentTransport under both policies, all invocation IDs/results present and no sidecar leaking to External v1.
- App context-selection: local HTTP Completions wire captures20→12→继续 and repeated-page reads, exact report/no-store/null, no body/key/base URL, probe and SSE reconnect do not change report/generate; real pending transport stop, new/switch/disable/dispose and old-report rejection; Host/Origin403; snapshot v4 unchanged.
- Refresh installed runtime before Workbench Agent/External/score/approval/recovery tests and typechecks. Build isolated App output so old preview processes do not serve mismatched artifacts. Packed standalone install/boundaries remain required. User-triggered DeepSeek quality remains M32-A8 and earlier pending real acceptance; local mechanism tests cannot satisfy them.

### 7. Wrong vs Correct

```ts
// Wrong: deduplicate actual calls by tool name, or let Pi alone select common evidence.
const resultKey = item.sourceId;
// Correct: one common selector protects actual identities; Pi applies the same plan to final messages.
const resultKey = isInvocationContext(item) ? item.contextItemId : sourceObjectVersionScopeKey(item);
createAgentSession({ provider, contextSelectionPolicy: "standalone-context-v1" });
// ContextSelectionPlan stays request-local; GET has its own versioned report contract.
```


## M3.2b Offline History-Ranking Evaluation

### 1. Scope / Trigger

The offline command/data live in packages/agent-runtime/evaluation and are excluded by the package's files list. It compares optional older successful conversation units only; no production entry imports it, no model/network/resource tool is called, and M3.2a runtime/contracts/permissions remain unchanged. The 20 synthetic cases are a fixed diagnostic study, not a model-accuracy benchmark or blinded product evaluation.

### 2. Signatures

```powershell
# Repository root; optional explicit local output, otherwise stdout only.
node --experimental-strip-types packages/agent-runtime/evaluation/compare-context-selection.mts [--output results.json]
# Runtime directory: explicitly typecheck the offline entry (default tsconfig only includes src).
npx tsc --ignoreConfig --noEmit --types node --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --allowImportingTsExtensions evaluation/compare-context-selection.mts
```

### 3. Contracts

- Fixed input context-selection-cases.json exact `{schemaVersion:1,description,cases}` with 20 cases, 10 development/10 holdout. Case exact id/category/split/critical/goal/optionalSlots/historyTurnBudget/turns/neededTurnIds/whyNeeded; turn exact id/user/assistant/status. Case IDs match cNN and are unique; turn IDs unique per case. User/assistant are nonblank strings, status complete|failed|cancelled|interrupted. Needed IDs unique, present and complete. optionalSlots 0–2, historyTurnBudget 16. Holdout here is a pre-reserved review group from the same author, not a blinded independent dataset.
- Normalize dataset hash as UTF-8 with CRLF→LF; freeze labels before first run. Current SHA-256 18efe9fb5d8d819e8e8971c2d4e5d9aac97a185d9a1ef89f28d1f06a71657b86. Do not modify labels/weights after seeing outcomes without explicitly creating a new study/version.
- Build successful window 16, protect latest min(2, available) pairs. Call actual ContextBuilder under standalone-context-v1; fixed 8192 token estimate and itemCountBudget 4+protectedCount+optionalSlots make optional whole-pair slots the binding resource. Check baseline IDs against newest optional pairs, protected IDs, budget and exact original user/assistant content. This is not a final Pi token-budget experiment.
- Candidate lexical ranking only scans user text: NFKC/lowercase, English/digit terms and adjacent Han bigrams (single Han character remains one term), at most 2048 code points and 256 unique terms. Score is unique query-term coverage, ties newest-first. Compare current query and current plus protected user originals; restore selected pairs to original order. Never infer trust, permission, expiry or current validity from this score.
- Output v1 exact top fields schemaVersion/evaluatorVersion/scope/datasetSha256/datasetHashEncoding/parameters/casesEvaluated/summary/gate/recommendation/results. It records labels, window/protected/selected IDs, scores, per-group source-unit recall/whole-case coverage/wins/losses/critical losses. Overall recall includes all needed source units; inWindowSourceRecall excludes unreachable labels. Empty-label control cases are excluded from recall denominators. No result is real answer quality/usage.
- Adoption gate is global in-window recall improvement plus pre-reserved-group improvement and zero critical regressions relative to recency. A passing study would require further validation, not automatic activation. This v1 fails both lexical variants: 11/20→12/20 overall, 6/9→5/9 pre-reserved, 6 critical regression cases. Retain production recency, no score field/API toggle.

### 4. Validation & Error Matrix

| Condition | Behavior |
|---|---|
| Missing/extra dataset/case/turn fields, wrong schema/count/ID/status/needed label | Assertion/nonzero exit; no success output artifact |
| Unknown args/missing --output value | Usage assertion/nonzero exit; no output write |
| Baseline drift, missing protected pair, clipped body, exceeded budget/slot or ineligible selected ID | Assertion/nonzero exit; comparison cannot hide changed production semantics |
| Output path unwritable | Filesystem error/nonzero exit; no model request |
| Average improvement but critical regression or worse pre-reserved group | Gate fails; retain-recency recommendation, runtime unchanged |
| Window-excluded target or ranking scan tail | Report limitation explicitly; do not silently treat it as retrieved evidence |

### 5. Good / Base / Bad Cases

- Good: exact topic references retrieve useful older pairs and preserve protected recent context, while correction/negation regression is inspected separately.
- Base: all lexical scores tie, select newest optional units; optionalSlots 0 selects none; window-excluded labels stay unretrieved.
- Bad: declare 60% source recall as model accuracy, report only average improvement, rank file/assistant text as instructions, or deploy scores despite known critical constraint losses.

### 6. Tests Required

Run 20 cases with actual selector assertions, lexical NFKC/bigram/uniqueness/term-cap/scan-cap assertions and strict typecheck. Re-run byte-identical JSON; independently recompute hit denominators/critical losses and check frozen canonical data hash. Check git diff for no runtime/app source or package manifest changes, dependency boundaries and npm pack --dry-run exclusion of evaluation files. Do not relabel previous 38/56/222 tests as freshly executed for an evaluation-only batch; real DeepSeek acceptance remains separate.

### 7. Wrong vs Correct

```ts
// Wrong: enable the ranker because average recall rose by one unit.
if (recallImproved) enableProductionRanking();
// Correct: inspect separate regressions; this command never activates production.
const gate = recallImproved && reviewGroupImproved && criticalLosses.length === 0;
const next = gate ? "further-validation-only" : "retain-recency";
```

## M3.3a Incomplete Reply Presentation

### 1. Scope / Trigger

Standalone chat UI only. Real paged Chinese reading produced completed tool activities followed by final input budget failure with a short opening in the assistant body. Show that body as partial output beside its failure reason. Runtime, budgets, Host v4, External v1 and chat file v1 remain unchanged.

### 2. Signatures

`ChatMessage({message: AgentChatMessage, session: AgentSessionSnapshot, activities: ToolActivitiesSnapshot})` is the actual article renderer used by AgentApp. No new endpoint, store field or model request.

### 3. Contracts

- Failed assistant messages show an incomplete notice before tools/body. Nonempty content is labeled partial; empty content has an explicit no-body notice and no invented Markdown reply/copy action.
- Show the existing host-sanitized session.message only when session.status=failed and session.runId equals message.runId. Otherwise say the original reason was not retained. Chat file v1 stores status without per-message reasons; restored, disabled and later-run snapshots cannot supply an old cause.
- Render reasons as React text, never Markdown/HTML or string-based error classification. Preserve body source for copying, with a partial-reply copy label for failed output.
- Tool cards match their own runId and actual invocation statuses. A failed reply cannot turn completed tools into failed cards; tools succeeding cannot imply a complete reply. Other chat statuses keep existing meaning. No automatic retry.

### 4. Validation & Error Matrix

| Condition | Display |
|---|---|
| Current failed assistant with content | Incomplete/partial notice plus current Run reason, then original body |
| Current failed assistant without content | Incomplete/no-body notice plus reason; no fabricated reply or copy button |
| Older, restored, disabled or different Run; empty reason | Incomplete notice; explicitly unavailable original reason |
| Complete/streaming/cancelled/interrupted or user message | Existing semantics; no failed-assistant notice |
| Different activity Run | No activity cards for this message |
| Completed tools followed by budget failure | Completed cards alongside incomplete reply; zero additional transport |

### 5. Good / Base / Bad Cases

- Good: two real local HTTP tool replies succeed; final budget fails before request three; the opening is visibly partial and the budget cause sits beside it.
- Base: restored failed text remains readable with unavailable reason, while a later connection failure belongs only to its matching Run.
- Bad: apply session.message to every historical failure, display an empty failure as model-generated prose, or add automatic retries to the rendering component.

### 6. Tests Required

App chat-message.test.ts loads the actual TSX through Vite SSR and renders it with React. Assert current reason before body, text escaping, no-body/copy behavior, historical/restore/disable/new-Run isolation, other statuses and cross-Run/completed-tool semantics. Real Host plus local HTTP fixture must reproduce partial text/two completed pages/final overflow with exactly two requests. Run App tests/typechecks and isolated production build; record desktop/narrow browser limitations explicitly. Do not relabel fixture or SSR as real-provider/visual acceptance.

### 7. Wrong vs Correct

Wrong: every failed message displays the current session.message. Correct: bind the reason to the current failed Run; when unavailable, keep the incomplete status and state that the reason was not retained. Smaller tool pages bound a single result, not accumulated protected feedback; changing that budget policy requires a separate public design.


## U1 Project-aligned Standalone Workspace

### 1. Scope / Trigger
Standalone Agent layout only. Map the current frame-visual palette into independent CSS, without importing Workbench or changing Host v4, External v1, chat file v1, budgets or tool execution.

### 2. Signatures
`WorkspaceInspector({snapshot,open,tab,onTabChange,disabled,action,onBusyChange,onClose})` consumes the existing authoritative snapshot and actions. Local layout state is separate from Session state. `ConversationSidebar` accepts a collapsed presentation.

### 3. Contracts
- Header44px, sidebar204px/rail44px, reading column max680px, inspector300px. Opening the inspector derives a collapsed sidebar; closing restores the user's local preference. No new persistent layout schema.
- One mounted ResourcePanel handles the chooser/upload lifecycle. Switching inspector tabs, closing it or crossing700px must not create a second uploader or reset a pending operation. Desktop dialog.show is nonmodal; narrow dialog.showModal uses native focus/inert/Escape behavior. Close/reopen on resize must not interpret the old close event as a user dismissal.
- The inspector shows authorized resource metadata, not unread full text. Opening it, changing tabs or resizing performs no model/tool request. Existing Controller tools alone read resource bodies. Activity and failure meanings remain distinct and current-Run-bound.
- Session selection clears drafts and restores input focus only after the mutation guard is removed and the sessions dialog closes. Input remains editable during output; send is blocked while active/uploading/changing session. Native composing Enter is not a submission; Shift+Enter inserts a newline. A successful stop returns focus to input.
- Preserve model settings/discovery, explicit enable, conversation search/rename/archive/restore, copy, storage retry notices, resource errors, failure/cancellation/interruption semantics. Historical reasons are never filled from the new Run.
- Theme values come from frame-visual tokens (#1c1d20/#242529/#202125/#2d2f35, ink#f2f0eb, muted#afb1b8, selected#2c67c5, focus#8fb7ff, danger#d98383), Segoe UI Variable Text/Chinese UI fallbacks and3/6px radii. Do not overwrite another window's theme source.

### 4. Validation & Error Matrix
| Condition | Required behavior |
| --- | --- |
| Inspector opened/closed/resized | Local layout only; same resource controller and no generation |
| Narrow inspector | Native modal; background inert; Escape returns to trigger |
| Empty/new session | Empty metadata/activity; no old error or draft reused |
| Tool completed then answer fails | Completed tool plus partial/failed reply; never imply final success |
| Upload invalid/busy | Existing UTF-8 error and guards remain visible |
| Session accepted | Focus after React commits enabled input, not while it is disabled |

### 5. Good / Base / Bad Cases
Good: open resources beside the readable chat and restore sidebar preference on close. Base: disabled startup/empty session, configuration and activation remain explicit. Bad: automatic file reads to populate a preview, fake unavailable controls, copied old Run diagnostics, or a separate execution state machine.

### 6. Tests Required
Actual TSX SSR for resource metadata, busy guards, empty state and tool/final-result semantics. Browser local HTTP fixture verifies upload/read, completion/failure/stop, refresh/session isolation, conversation management, keyboard/focus, streaming scroll, desktop1280/1024 and390/320 widths. Record native Chinese IME and provider-quality limitations separately. Vite8 SSR fixtures set both hmr:false and ws:false; hmr:false alone still binds a shared WebSocket port.

### 7. Wrong vs Correct
Wrong: focus input immediately after setChangingSession(false), or remount the uploader for each responsive layout. Correct: focus in the committed-state effect and keep a single resource controller across the inspector presentations.

## Windows Atomic JSON Replacement

### 1. Scope / Trigger
Concurrent full-suite verification reproduced EPERM at sessions.json rename on Windows. Applies to the shared LockedJsonFile used for session and connection JSON files, not model retries.

### 2. Signatures
`replaceJsonFile(source,target,{platform?,replace?,pause?}?)` is an internal filesystem helper. Defaults use process.platform, fs.rename and timers/promises. LockedJsonFile.write calls it after fsync/closing the complete temporary file.

### 3. Contracts
Retry only win32+EPERM, at most four identical rename attempts, waiting20/40/80ms (140ms total scheduled delay). Never delete the old destination, regenerate the temporary content or retry supplier requests. Other errors/platforms fail immediately. Exhaustion propagates the same final error to existing storage diagnostics; caller retains its existing temporary-file cleanup, serialization and lock ownership.

### 4. Validation & Error Matrix
| Condition | Behavior |
| --- | --- |
| Transient Windows EPERM | Same source/target retry; install complete file atomically |
| Persistent EPERM | Four attempts, same error propagated, existing save-failure notice |
| Non-Windows EPERM, ENOENT, EACCES | One attempt, no delay |

### 5. Good / Base / Bad Cases
Good: two transient locks followed by atomic rename. Base: first rename succeeds. Bad: unlink destination first or retry indefinitely.

### 6. Tests Required
Actual temporary files with two injected rename failures and final fs.rename; old contents remain before replacement and new contents are complete after. Assert bounded persistent retries/error identity and immediate unrelated errors. Run the whole App suite normally with real file session/connection tests; do not hide the Windows failure by only serializing tests.

### 7. Wrong vs Correct
Wrong: catch all save errors or delete the current sessions.json before writing. Correct: only retry the specific bounded atomic rename, keeping existing failure/rollback contracts.


## M3.2c1 Explicit Input Policy

### 1. Scope / Trigger
Per-connection/model input estimates replace the fixed standalone budget for new Runs. Runtime/Controller remain the sole policy path; no Pi fork, automatic budget increase, feedback deletion, retry or summarization. The default is still8192. This does not certify provider capacity or arbitrary-length tasks.

### 2. Signatures
```ts
interface ModelInputPolicyV1 {
  readonly schemaVersion: 1;
  readonly inputTokenBudget: number;
  readonly declaredContextWindow: number | null;
}
parseModelInputPolicy(value: unknown): ModelInputPolicyV1;
parseModelInputTokenBudget(value: unknown): number;
AgentSessionOptions.inputTokenBudget?: () => number;
// ConnectionSettings and StoredConnectionSettings schemaVersion:2
// profiles: old fields + inputPolicy; sealedCredential stays private
// StandaloneAgentSnapshot schemaVersion:5, connections:v2
POST /api/connections/profiles-v2
// exact {schemaVersion:2,profileId,name,configuration,inputPolicy,rememberCredential,apiKey?}
```

### 3. Contracts
Runtime contracts own validation, default policy and the1500 output reserve shared by Pi stream limits. Budget is a safe integer1024–65536. Declared capacity is null or a safe integer1–1048576; non-null requires budget+1500<=capacity. UI says input estimate budget and user-declared context capacity, with unknown explicit. Do not infer capacity from model ID, catalog IDs or fixed Pi assembly metadata.

Public settings strictly accept v2. Stored settings accept exact v1/v2: validate every old field before injecting defaults, normalize v1 to v2 in memory, never write merely on load/close. Future, malformed and extra/private fields fail closed and preserve original bytes. Only explicit successful mutations write v2. Save failure leaves authoritative config/key/policy unchanged.

Both save endpoints enter one private save flow. Legacy same-target+same-model saves retain policy; new target/model defaults it. New v2 saves use explicitly supplied validated policy. Changing the model resets the UI draft across manual, catalog, recent, automatic catalog fallback and preset paths. New drafts default; loading saved profiles restores their own policy. Key-only changes preserve policy. Budget is not DPAPI identity: budget/capacity-only edits preserve the key, ciphertext and remember choice. Same target model changes preserve existing credential isolation rules.

Session samples its hook synchronously once before message precheck/history projection/run reservation/checkpoint. Hook throw, invalid value or synchronous reentry creates no partial transcript or model/tool side effect. Freeze that budget across all Controller/Pi rounds; other static limits remain. No hook preserves existing Workbench behavior. In-process external plugin/adapter receives the same public context.budget; External v1 wire contains selected context.items only, so do not add/claim remote budget metadata without a new protocol contract. Probe remains a separate default8192 Session with no resources/tools and cannot replace main reports. Host Run/probe/change activity blocks mutation with409. Saving, refreshing and reconnecting never generate or resume failed Runs.

### 4. Validation & Error Matrix
| Condition | Behavior |
| --- | --- |
| Wrong policy version/fields, unsafe/fractional/out-of-range budget/capacity | 400 stable validation error; original state retained |
| Budget+1500 exceeds user declaration | 400 explain reserve; no save |
| v1 disk load | Memory v2 defaults, unchanged bytes, disabled, zero generation |
| Future/private/malformed stored fields | Preserve file; stable settings error |
| v2 write fails | Old configuration/key/policy remain authoritative |
| Mutation while Run/probe/change is active | 409, no partial policy install |
| Actual protected input exceeds selected budget | Block next transport; retain entire actual feedback and partial reply |
| Host v4/old public settings received by new client | Strict reject; refresh/version error |

### 5. Good / Base / Bad Cases
Good: explicit16384 permits the existing two-page Chinese fixture and actual provider case, with actual diagnostics16384 and complete feedback. Base: default8192 reproduces the bounded failure honestly. Bad: raise the global default silently, advertise Pi metadata as verified capacity, mutate active Run budget, truncate executed results or extend External v1 without versioning.

### 6. Tests Required
Shared strict parser/ranges/reserve; exact v2 route/public decoder; v1 memory migration and original-byte preservation; write rollback; real Windows DPAPI ciphertext identity and restart; target/model/profile isolation and legacy bridges. Session hook once, throw/invalid/reentry zero effects, sampled precheck/history, multi-turn Pi and in-process/external-v1 adapter equivalence. Actual HTTP Chinese/ASCII7465 characters at8192/16384: two complete invocations, paired call/result bodies exactly once, final diagnostic/report actual budget and zero next request on overflow. Busy Run/probe409 and cancellation/session/late-report isolation. Real settings UI, keyboard/narrow metrics and no automatic generation; Runtime/App/Agent-related Workbench types/tests, production build, boundaries and packed install. Record unrelated whole-repository failures separately, do not edit another window's files. Real provider completion/marker review is separate from local fixture proof; native IME remains separate.

### 7. Wrong vs Correct
Wrong: spread an old stored profile into a new DTO then delete unknown fields, or change only Pi context limits. Correct: exact old-schema validation before memory migration, and one Session-frozen budget consumed by Controller plus final Pi estimator. Wrong: claim External v1 wire has a budget because its in-process adapter sees context.budget. Correct: preserve wire v1 selected-context shape and document the metadata boundary.

## M3.2c2a Immutable Query Admission

### 1. Scope / Trigger
Node opts into whole-batch preview before immutable query execution. Workbench/old consumers do not opt in. Controller still owns validation, approval, state, execution and recovery. No Pi fork, retry, summary, failed-result protocol or UI layout change.

### 2. Signatures
```ts
AgentSessionOptions.readAdmission?: ReadAdmissionPolicyV1; // {schemaVersion:1,maxResultJsonBytes:1..65536}
AgentSessionOptions.inputPreview?: AgentInputPreviewPort; // preview(AgentProviderRequest): AgentInputPreviewV1
AgentSessionOptions.onToolFeedbackAdmission?: (report:ToolFeedbackAdmissionReportV1)=>void;
// Same optional dependencies on AgentRunController.
AgentCapabilityInvocationContext.resultLimit?: AgentReadResultLimitV1;
AgentCapabilityPort.previewRead?(request, contextWithResultLimit): AgentReadPreview;
RegisteredAgentTool.previewRead?(input, contextWithResultLimit): {status:"ready",data:unknown}|{status:"insufficient-limit"};
createPiInputPreview(selection, model): AgentInputPreviewPort;
ExternalAgentAdapter.inputPreview: AgentInputPreviewPort;
AgentSession.getToolFeedbackAdmission(): ToolFeedbackAdmissionReportV1|null;
GET /api/tool-feedback-admission // report|null; Host/Origin and no-store
```

### 3. Contracts
`contracts/tool-feedback-admission.ts` owns types, strict guards, freezing and UTF-8 JSON-data bytes. Node cap12288; do not reinterpret legacy toolResultSizeBudget. Controller alone supplies detached frozen resultLimit/call inputs/preview requests. Registry validates version/input and owns result identity; ActionRuntime shares workflow authorization with invoke. Byte1 preflight validates every call before full candidates. Only registered monotone immutable query previews with all sideEffects=none, no prepared execution/required approval qualify. Missing support rejects the group. Opt-in caps maxCalls at4 and supplies standalone-context-v1 if no policy was set.

Reserve IDs/times without dispatch, replay existing reducers on a copy to planning, reuse ContextBuilder/ToolsetResolver and feedback assembly. Maximum candidates fix omitted/optional context; remove optional units in policy order before shrinking pages. Search each minimum legal result, evaluate the entire minimum group, then expand in model order while reserving later minimums. Each binary interval is bounded to16 iterations. Invoke serially once using original input and chosen resultLimit. Previous feedback/recent full pairs remain protected. Candidates never populate actual diagnostics or completed activities. After real success send the admitted frozen continuation; check expiration before each dispatch and continuation. Immutable queries cannot change document identity/version. Mismatch preserves real completed records, fails and never crops/retries/continues. Cancellation retains earlier completed facts, stops remaining work and isolates late results.

Pi input-preview/stream share projectPiModelInput, transcript projection, tool-schema fallback and budgetModelInput. Preview creates no Agent and has no Host Port. External uses strict v1 projection, local structured ExternalAgentInputLimitError (wire code unchanged), negotiated caps and worst requestId256 UTF16 units*6 JSON bytes plus24-character deadline. No ID/clock callbacks, transport or state/sequence advancement. Host estimate is ceil(JSON({goal,context,tools}) UTF8 bytes/3)+32; remote hidden prompt/window remains unknown. estimatedInputTokens is number|null; structural validation failure returns null, ready/budget-exceeded require a measured number. External v1/Host v5/raw stream v1/chat v1/Run storage fields stay unchanged.

Report exact fields: schemaVersion1, policyVersion immutable-query-v1, runId/turnId/nextTurnId, status, reason, inputPreview, calls<=4. Calls contain callId/capabilityId/contractVersion/candidateInvocationId/resultJsonByteLimit/previewResultJsonBytes only. Preview identity matches runId/nextTurnId; IDs unique, safe integers, bytes<=limit; reject extra fields and inconsistent status/reason. No body/input/name/raw error/address/key. Observer receives a separate frozen copy; exceptions/reentry cannot control execution. Current Run latest settlement only: clear on newRun/switch/reset/cancel/disable/dispose, retain on refresh, not restart. Probe never affects main reports.

### 4. Validation & Error Matrix
| Condition | Outcome |
| --- | --- |
| Invalid/unauthorized/version-mismatched decision or >4 calls | Existing rejection, zero preview/execute |
| Later missing/wrong-session resource | Preflight fails before full candidates, zero execute |
| Unsupported preview or effect/approval | Whole group unsupported, zero Invocation |
| Maximum too large, minimum group fits | Smaller real pages with accurate progress and original call inputs |
| Minimum group exceeds context/input/protocol limit | Local budget-exceeded; zero Invocation/execute/continuation; stable Session reason |
| Invalid/throwing preview, expired context or changed identity | Local failure/report, no next provider request |
| Actual result differs | Preserve real completed result/activity, contract-error, zero remaining executions/continuation/retry |
| Cancel before/between/during query | Stop scheduling, retain earlier completions, clear report, isolate late result |

### 5. Good / Base / Bad Cases
Good: second Chinese page shrinks, then a third minimum page cannot fit; two actual completions remain, no third Invocation. Base: short/full page runs once, preview equals actual input estimate. Bad: trim completed data, rewrite model maxCharacters, preview through remote transport, publish candidate completion or bypass an unsupported call.

### 6. Tests Required
Runtime read-admission: whole group/minimum protection, optional history/two recent pairs, direct Controller cap, authorization preflight, strict/null report, missing/invalid/throwing preview, mismatch, cancellation/reentry, expiry, exact Pi projection and External byte/string/depth/count/no-IO. App: shared Unicode/escaped/empty EOF pagination, exact preview/HTTP estimate, private/no-store/Host/Origin/probe/switch/refresh report, failure rendering with only real cards. Regress old default behavior, Workbench Agent approval/recovery, types, isolated build, boundaries and packed install. Desktop/narrow built UI proof and real-provider limits recorded separately.

### 7. Wrong vs Correct
Wrong: execute one call then discover another cannot fit, or fake a completed rejection. Correct: reserve every minimum before dispatch and stop locally if necessary. Wrong: report0 tokens after structural failure. Correct: null for unknown, reject readiness. Wrong: rebuild a different context after execution. Correct: validate actual results then send the admitted immutable snapshot through the original final guard.

## M3.2c2b Tool Rejection Feedback

### 1. Scope / Trigger
The first c2b slice makes recoverable c2a budget rejections visible to a capable first-party Pi provider. It does not create a second execution path, alter authorization, expose preview bodies, extend External Agent Protocol v1, or retry contract errors. A single Run may issue at most one recovery decision.

### 2. Signatures
```ts
AgentProviderRequest.toolFeedbackRejections?: readonly AgentToolRejectionFeedbackV1[];
AgentDecisionProviderPort.capabilities?: { readonly rejectionFeedback: "v1" | "none" };
AgentRunEvent = { readonly type: "tool.rejection-feedback"; readonly feedback: AgentToolRejectionFeedbackV1 };
```

### 3. Contracts
`AgentToolRejectionFeedbackV1` is a strict, versioned DTO containing run/turn identity, `blocked|unsupported` status, a stable reason, recovery hint, retryability and the original call identities/JSON inputs. `input` is a detached deep-frozen snapshot; no preview body, result, address, header, credential, raw exception or stack is allowed. `input-budget` and `input-limit` are the only recoverable first-slice reasons and require `status=blocked`, `retryable=true`, `recovery=reduce-input`. Unsupported combinations are reserved for later compatibility and are not auto-recovered in this slice.

The Controller creates the DTO only after c2a rejects the whole batch and before any Invocation is dispatched. Pi projects each rejected call as its original `toolCall` plus an `isError=true` `toolResult`; it is not an `AgentToolFeedbackGroup`, Invocation, context result or completed activity. The next model decision receives a new turn identity and re-enters the same validation, authorization, preview, execution and final-budget path. A second rejection ends locally without another provider call. The rejection event is persisted so a host restart cannot reset the recovery bound.

External Agent Protocol v1 continues to project its exact old `hello`/`turn.request` fields and declares `capabilities.rejectionFeedback="none"` in-process; it receives no unknown wire field and follows the existing local failure behavior. Any future wire support requires a separately negotiated protocol version.

### 4. Validation & Error Matrix
| Condition | Outcome |
| --- | --- |
| Pi v1 + blocked input-budget/input-limit | One frozen rejection, at most one new provider decision |
| Recovery decision chooses a smaller/alternative call | Full c2a and execution checks run again; successful result alone enters normal feedback |
| Recovery decision repeats rejection | Local budget/capability failure; no third provider or tool execution |
| Provider lacks v1, External v1, unsupported tool/provider | Existing local failure; no new wire field |
| Contract-error, mismatch, cancellation, late result | No model recovery; preserve real completed facts and stop existing path |
| Invalid DTO, cross-identity, duplicate call or extra field | Reject before projection/execution |

### 5. Tests Required
Strict DTO and deep-freeze tests; Pi error-result projection; Controller one-time budget recovery with a smaller call; second rejection bound; External v1 wire identity and no rejection field; cancellation/store event/restart isolation; Runtime and Workbench type, boundary, isolated build and packed-install checks. Real provider quality remains separate.

### 6. Wrong vs Correct
Wrong: turn preview text or an unexecuted call into a successful tool result, mutate the budget, or loop until `maxTurns`. Correct: send only a bounded reason/input snapshot once, let Pi choose a new decision, and re-run all host checks before any replacement call.

## U2 Atomic Run Diagnostics

### 1. Scope / Trigger
App-only read projection and inspector page for the current Run. Runtime/Controller/Pi loop remain the execution path. Keep original three diagnostic GETs, Host v5/SSE, connection v2, External/raw-stream/chat v1 and stored Run DTO unchanged. Do not persist diagnostics, collect usage, expose bodies/credentials, or generate from a read/refresh/settings save.

### 2. Signatures
```ts
host.getRunDiagnostics(): AgentRunDiagnosticsV1;
GET /api/run-diagnostics // Host/Origin checks, cache-control:no-store
isModelInputSummaryV1(value: unknown): value is ModelInputSummaryV1;
isAgentRunDiagnosticsV1(value: unknown): value is AgentRunDiagnosticsV1;
decodeRunDiagnostics(value: unknown): AgentRunDiagnosticsV1;
projectRunDiagnostics(input): AgentRunDiagnosticsV1; // pure synchronous projection
DiagnosticsCoordinator.update(identity: DiagnosticsIdentity|null): void;
DiagnosticsCoordinator.refresh()/dispose(): void;
useRunDiagnostics(snapshot, open, connected, connectionEpoch);
// SettingsDialog initialFocus?: "input-budget"; InspectorTab adds "context".
```
No new env keys or dependencies. Strict DTO and projection are App-owned; reuse Runtime selection/admission guards and freezing, not copied rules.

### 3. Contracts
Exact13 fields: schemaVersion=1, hostInstanceId, hostSequence, sessionId, runId, selectedProfileId, configurationEpoch, availability, modelInput, contextSelection, admission, omittedHistoryTurns, actualUsage=null. Summary exact11 fields: runId/turnId/providerId/modelId/status/estimator/estimatedInputTokens/inputTokenBudget/retainedHistoryTurns/toolCount/maxOutputTokens. Whitelist the internal diagnostic; never spread it at HTTP. Reject extra fields, unsafe/non-integer counts, invalid IDs, status inconsistent with estimate>budget and cross-Run reports; detached deep-freeze. Each phase may have a different turnId. Exclude text, raw model response, tool inputs/results, resource names, baseUrl/headers/key/ciphertext/fingerprints.

Only available carries reports and a nonnegative omittedHistoryTurns from Session, and requires a Run plus at least one valid report. pending requires Run with null reports/count. disabled/no-current-run/configuration-changed/unavailable have null reports/count; no-current-run requires null Run, configuration-changed requires Run. Priority: disabled, noRun, binding mismatch(unavailable), changed profile/epoch, source validation, available/pending. Invalid source becomes unavailable without failing the real Run. ready means local input check passed, never remote request success. actualUsage stays null; UI renders 未提供, no guessed price/window/zero.

Capture binding in main Session subscription when a new sessionId+runId appears, including direct Session submission. Effective selected-profile/config/inputPolicy/raw credential changes increment an in-memory epoch after successful settings save; names/unused-profile edits do not. Compare keys only inside Host, publish no fingerprint. Disable removes binding; observing the old Run on re-enable must not recreate it. Probe does not overwrite main binding/reports; restored history has no invented diagnostics. Getter does not publish sequence, mutate state, read disk or call provider. Cancellation can preserve valid last modelInput while cleared selection/admission remain null.

Client key: connectionEpoch/sessionId/runId/selectedProfileId/public configuration+inputPolicy+credentialPresent/enabled. Latest Host snapshot sequence also gates acceptance: checking only request-start sequence misses same-target credential changes. Same key/nonrunning sequence changes clear display before refresh. Use independent generation+AbortController; stale success AND failure cannot publish. Retain at most one unresolved request even after abort, queue latest until it settles. Accept only matching identity/host-instance, no regressing sequence/configepoch within the connection epoch; reconnect establishes new host baseline. Mask old identity synchronously before effects. Host sequence is a snapshot marker, not a revision of every diagnostic report.

Only an open context page with a connected host reads. Running reads start at most once per1000ms, continuous stream events coalesce without trailing-debounce starvation; terminal/config/reconnect refresh once, close/dispose cancel timers/requests. Local diagnostic errors never use global execution error. Model input shows frozen budget separately from selection and next-read candidate estimate. Candidate invocation IDs cannot create completion cards. Preview-execution-mismatch wording preserves actual completed facts, not a false 本组未执行.

Budget entry reuses native SettingsDialog: expand existing details and focus input; inherited fieldset disable is checked with matches(":disabled"), then focus summary. Closing restores trigger; if save removes it, focus current inspector context button (especially inside narrow modal), then usable input fallback. Keep draft and explicit user resend, default8192 unchanged. Reuse project tokens and existing desktop/narrow inspector, same mounted resource controller.

### 4. Validation & Error Matrix
| Condition | Behavior |
| --- | --- |
| Extra/private fields, forged usage, invalid integer or cross-Run DTO | Decoder rejects; local stable diagnostic error only |
| Invalid internal phase source/model identity | unavailable, null reports; actual Run unaffected |
| New Run/config/key/profile or disabled host | Clear old binding/report as above; no stale metrics |
| Stop/switch/restored history | Valid final input only or honest missing; no revived selection/admission |
| Wrong Host/Origin | Existing403; GET has no model/storage side effect |
| HTTP exception/invalid JSON/DTO | Panel 暂时无法读取运行说明 + 刷新诊断; chat remains usable |
| Old success/failure or host regression | Ignore stale response or local host mismatch; never overwrite current state |
| Slow uncancellable request/continuous stream/closed page | One in flight, bounded coalescing/no starvation, no reads after closure |
| Budget settings saved | Old configuration report invalid, draft kept, no automatic submit/retry |

### 5. Good / Base / Bad Cases
Good: actual last input8192/8192 ready, two real completed reads, next candidate blocked; display these three distinct facts and open budget settings. Base: new or restored history shows 当前没有运行诊断 with no zeros. Bad: replace the frozen denominator with new16384, add candidate completions, present null usage as0, mix phases from three unbound HTTP reads, or accept pre-key-change success because the public target stayed equal.

### 6. Tests Required
App strict DTO/whitelist/privacy/freeze/missing-state cases; real HTTP no-store/Host-Origin/read-only/v5 exact keys, main/probe, rename vs policy/key change, disable/re-enable, cancel and restore. Pure coordinator deferred results/fake clock covers each identity dimension, old success AND failure, latest snapshot credential case, reconnect process baseline, invalid DTO, slow abort-resistant single flight, continuous stream1s coalescing, terminal/close/dispose. Render real TSX for frozen-input vs blocked candidate, mismatch facts, missing/error no zeros/re-generation. Actual isolated production UI at1280/1024/390/320 verifies dialogs, budget focus/draft/save fallback, new Run/current budget, stop/history/reconnect, local diagnostic failure with successful chat, GET rate/max concurrency/closed inactivity and unchanged generation count except explicit sends. Run affected App tests/types/build and dependency boundaries; record native IME/provider stability/visual signoff separately. Do not reuse synthetic prototype proof as production acceptance or claim whole-repository checks from scoped results.

### 7. Wrong vs Correct
Wrong: compare response.hostSequence only with the captured request-start snapshot, or refocus a removed budget button after settings save. Correct: gate against the latest public snapshot and ignore old failures too; return focus to the current context button inside the modal when the original trigger no longer exists. Wrong: generate to refresh diagnostics or feed candidate estimates into actual model-input display. Correct: pure metadata GET and distinct phase sections from one bound projection.
