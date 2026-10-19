import { createWorkspaceRuntime } from "./workspace-runtime.js";
import { createCoreScorePlugin } from "../fixtures/core-score-plugin.js";
import { STAFF_FIXTURE } from "../fixtures/staff-snapshot.js";
import { createStaffProjectionPort } from "../score/staff-read-port.js";
import { createDocumentStaffProjection } from "../score/document-staff-projection.js";
import { readStartupPlan, validateStartupPlan } from "../startup/plugin-startup-plan.js";
import { assembleBackupUiPlugins, prepareBackupStartupEntries } from "./backup-plugin-assembly.js";
import { assertBackupPluginInput, BACKUP_PLUGIN_IDENTITIES, prepareBackupPlugin,
  createBackupFormalPlatform, configureBackupFormalPlatform } from "./formal-plugin-assembly.js";

function createScoreProjection({ documentSession, fixture }) {
  if (documentSession !== undefined && documentSession !== null) {
    if (typeof documentSession.read !== "function") {
      throw new TypeError("真实文档会话需要 read() 方法");
    }
    return createDocumentStaffProjection({
      readSession: documentSession.read,
      subscribe: documentSession.subscribe,
      retrySession: documentSession.reload,
    });
  }
  return createStaffProjectionPort({ snapshot: fixture });
}

/**
 * Application-owned entry for the backup UI.
 *
 * The entry owns the projection lifetime and registers the central score view
 * in the same fixed platform session as the frame and layout plugins. A real
 * application supplies a narrow document session ({ read, subscribe }); the
 * standalone preview deliberately supplies the explicit STAFF_FIXTURE.
 */
export function createBackupUiRuntime({
  root,
  documentSession = null,
  documentActions = null,
  fixture = STAFF_FIXTURE,
  plugins = [],
  enablePluginDiagnostics = undefined,
  startupStore = null,
  startupPlan = undefined,
  startupEntries = [],
  legacyPluginMetadata = {},
  animationProvider = undefined,
  animationPolicy = {},
} = {}) {
  if (!Array.isArray(plugins)) throw new TypeError("plugins 必须是固定启动声明数组");
  const startup = prepareBackupStartupEntries(startupEntries);
  const identities = Object.freeze({ ...legacyPluginMetadata, ...BACKUP_PLUGIN_IDENTITIES });
  // Validate/capture all external input before document reads, subscriptions or mounts.
  const acceptedPlugins = plugins.map(plugin => { assertBackupPluginInput(plugin, identities); return prepareBackupPlugin(plugin, identities); });
  if (startupStore !== null && startupPlan !== undefined) throw new TypeError("只能提供 startupStore 或 startupPlan 其中之一");
  const plan = startupStore !== null ? readStartupPlan(startup.directory, startupStore)
    : startupPlan === undefined ? null : validateStartupPlan(startup.directory, startupPlan);
  if (startup.entries.length && !plan) throw new TypeError("固定装配 startupEntries 需要启动计划或存储");
  if (plan && acceptedPlugins.length) throw new TypeError("计划模式的额外插件必须通过 startupEntries 声明目录与包，不能使用无目录 plugins 装配");
  if (plan && enablePluginDiagnostics !== undefined) throw new TypeError("启动计划不能与 enablePluginDiagnostics 重复指定");
  const projection = createScoreProjection({ documentSession, fixture });
  try {
    projection.start?.();
    const assembly = plan ? assembleBackupUiPlugins({ plan, score: projection.read, documentActions, directory: startup.directory }) : null;
    const runtime = createWorkspaceRuntime({
      root,
      plugins: [...(assembly?.plugins ?? [createCoreScorePlugin({ score: projection.read, documentActions })]), ...startup.plugins, ...acceptedPlugins],
      requiredViewSlots: ["stage"],
      enablePluginDiagnostics: assembly?.enablePluginDiagnostics ?? enablePluginDiagnostics ?? false,
      animationProvider, animationPolicy,
      commandStateSources: documentActions ? [{ subscribe: documentActions.subscribeState }] : [],
      documentRead: documentActions ? Object.freeze({ snapshot: documentActions.snapshot, subscribe: documentActions.subscribeState }) : null,
      pluginWiring: { create: createBackupFormalPlatform, prepare: plugin => prepareBackupPlugin(plugin, identities),
        configure: (platform, prepared) => configureBackupFormalPlatform(platform, { plugins: prepared, plan }) },
    });
    let disposed = false;
    const document = typeof projection.snapshot === "function"
      ? Object.freeze({ snapshot: projection.snapshot, subscribe: projection.subscribe })
      : Object.freeze({
        snapshot: () => Object.freeze({ status: projection.read.snapshot() ? "ready" : "empty" }),
        subscribe: listener => projection.read.subscribe(() => listener()),
      });
    return Object.freeze({
      ...runtime,
      startupPlan: assembly?.plan ?? null,
      score: projection.read,
      document,
      dispose() {
        if (disposed) return;
        disposed = true;
        try {
          runtime.dispose();
        } finally {
          projection.dispose();
        }
      },
    });
  } catch (error) {
    projection.dispose();
    throw error;
  }
}
