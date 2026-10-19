// Review-only execution scope. Identity and DOM grants come from the trusted
// composition root; this is not a second plugin platform or a published SDK.
import { API_VERSION, MOTION_LIMITS as LIMITS, fields as keys, validVariantName, snapshotAnimationDefinitions } from "./definition-contract.js";
const MODES = new Set(["full", "slow", "reduced", "none"]);

function fail(message) { throw new TypeError(message); }
function values(input, intent) {
  const shape = intent === "shape-transition";
  keys(input, shape ? ["x", "y", "width", "height", "opacity"] : ["x", "y", "opacity"], "animation values");
  if (!Object.keys(input).length) fail("Empty animation values");
  if (shape && ["x", "y", "width", "height"].some(key => !Object.hasOwn(input, key))) fail("Incomplete animation rectangle");
  const result = {};
  for (const [key, value] of Object.entries(input)) {
    if (!Number.isFinite(value)) fail(`Invalid ${key}`);
    if (key === "opacity" ? value < 0 || value > 1 : Math.abs(value) > LIMITS[intent]) fail(`Out of range ${key}`);
    if (!["content-transition", "shape-transition"].includes(intent) && key === "opacity") fail("Only content can change opacity");
    if (shape && key !== "opacity" && value < 0) fail(`Out of range ${key}`);
    result[key] = value;
  }
  if (shape && (result.x + result.width > LIMITS[intent] || result.y + result.height > LIMITS[intent])) fail("Animation rectangle exceeds canvas");
  return result;
}

export function createMotionCoordinator({ adapter, mode = "full", profile = "continuous", reducedMotion = false, onIssue = () => {} }) {
  if (!adapter || ["read", "write", "start", "capture", "restore"].some(key => typeof adapter[key] !== "function")) fail("Invalid animation adapter");
  if (!MODES.has(mode) || !validVariantName(profile) || typeof reducedMotion !== "boolean") fail("Invalid motion policy");
  const bindings = new Set(), owners = new Map();
  let disposed = false;
  const effectiveMode = () => reducedMotion && mode !== "none" ? "reduced" : mode;
  const issue = error => { try { onIssue(error); } catch { /* Diagnostics cannot own the operation. */ } };
  const finish = (binding, target, record, result, settle = true) => {
    if (binding.active.get(target) !== record) return;
    binding.active.delete(target);
    try { record.control?.stop(); } catch (error) { issue(error); }
    if (settle) adapter.write(record.node, record.to, record.intent);
    record.resolve(Object.freeze({ status: result }));
  };
  const settleAll = () => { for (const binding of bindings) for (const [target, record] of [...binding.active]) finish(binding, target, record, "cancelled"); };

  return Object.freeze({
    bind({ plugin, root, targets, animations = null }) {
      if (disposed) fail("Disposed motion coordinator");
      if (!plugin || ["id", "label", "version", "hostApiVersion"].some(key => typeof plugin[key] !== "string" || !plugin[key].trim() || plugin[key] !== plugin[key].trim())) fail("Invalid required plugin metadata");
      if (!/^\d+\.\d+\.\d+$/.test(plugin.version) || plugin.hostApiVersion !== API_VERSION) fail("Incompatible motion review metadata");
      if (!root || typeof root.contains !== "function") fail("Invalid local root");
      const definitions = snapshotAnimationDefinitions(animations);
      // DOM/intent permission is granted by the host, independently of optional
      // artwork. Missing artwork still reaches the accepted static result.
      keys(targets ?? {}, Object.keys(targets ?? {}), "animation targets");
      const grants = new Map();
      for (const [name, grant] of Object.entries(targets ?? {})) {
        keys(grant, ["node", "intents"], "target grant");
        if (!name.trim() || !grant?.node || grant.node === root || !root.contains(grant.node) || owners.has(grant.node) || [...grants.values()].some(value => value.node === grant.node)) fail("Animation target is not exclusively local");
        if (!Array.isArray(grant.intents) || !grant.intents.length || Array.from(grant.intents).some(intent => !Object.hasOwn(LIMITS, intent)) || new Set(grant.intents).size !== grant.intents.length) fail("Invalid target grant");
        grants.set(name, { node: grant.node, intents: new Set(grant.intents) });
      }
      for (const grant of grants.values()) grant.original = adapter.capture(grant.node);
      const binding = { active: new Map(), released: false, release: null };
      bindings.add(binding);
      for (const grant of grants.values()) owners.set(grant.node, binding);
      const granted = (target, intent) => {
        if (disposed || binding.released) fail("Released animation scope");
        const grant = grants.get(target);
        if (!grant || !grant.intents.has(intent) || !root.contains(grant.node)) fail("Animation target or intent denied");
        return grant;
      };
      const stop = (target, settle) => {
        const record = binding.active.get(target);
        if (record) finish(binding, target, record, "interrupted", settle);
      };
      const release = () => {
        if (binding.released) return;
        for (const [target, record] of [...binding.active]) finish(binding, target, record, "cancelled");
        binding.released = true; bindings.delete(binding);
        for (const grant of grants.values()) { owners.delete(grant.node); adapter.restore(grant.node, grant.original); }
      };
      binding.release = release;
      return Object.freeze({
        hold({ intent, target }) {
          const grant = granted(target, intent);
          const position = adapter.read(grant.node, intent);
          stop(target, false);
          adapter.write(grant.node, position, intent);
          return Object.freeze({ ...position });
        },
        place({ intent, target, to }) {
          const grant = granted(target, intent), safe = values(to, intent);
          stop(target, false);
          adapter.write(grant.node, safe, intent);
        },
        play(request) {
          keys(request, ["intent", "target", "to", "from", "velocity", "immediate"], "animation request");
          const { intent, target } = request, grant = granted(target, intent);
          const destination = values(request.to, intent);
          const source = request.from == null ? null : values(request.from, intent);
          const velocity = request.velocity == null ? { x: 0, y: 0 } : request.velocity;
          keys(velocity, ["x", "y"], "velocity");
          if (Object.values(velocity).some(value => !Number.isFinite(value) || Math.abs(value) > 1600)) fail("Invalid release velocity");
          if (intent === "shape-transition" && request.velocity != null) fail("Rectangle does not accept release velocity");
          if (request.immediate != null && typeof request.immediate !== "boolean") fail("Invalid immediate flag");
          // Validate everything, including disabled-motion requests, before touching DOM.
          const current = adapter.read(grant.node, intent);
          stop(target, false);
          const to = { ...current, ...destination };
          const from = source ? { ...current, ...source } : current;
          const selected = effectiveMode();
          const definition = definitions[intent];
          const settings = definition ? definition.variants[Object.hasOwn(definition.variants, profile) ? profile : definition.defaultVariant] : null;
          // Reduction also applies to an author's instant/static fallback.
          if (selected === "reduced" && intent === "content-transition") { from.x = to.x = 0; from.y = to.y = 0; }
          if (request.immediate || selected === "none" || !settings || settings.type === "instant" || (selected === "reduced" && intent !== "content-transition")) {
            adapter.write(grant.node, to, intent);
            return Object.freeze({ finished: Promise.resolve(Object.freeze({ status: "completed" })) });
          }
          // Content offsets are decorative, never business/layout coordinates.
          // Reduction strips both ends, including the hidden outgoing pane;
          // matching them at the exit offset would still cause an instant jump.
          adapter.write(grant.node, from, intent);
          let resolve;
          const finished = new Promise(done => { resolve = done; });
          const record = { node: grant.node, intent, to, resolve, control: null };
          binding.active.set(target, record);
          try {
            record.control = adapter.start({ node: grant.node, from, to, intent, velocity: { x: velocity.x ?? 0, y: velocity.y ?? 0 },
              settings: { ...settings, duration: selected === "reduced" ? .1 : settings.duration,
                fadeDuration: selected === "reduced" ? .1 : intent === "shape-transition" ? settings.duration : to.opacity < from.opacity ? settings.exitDuration : settings.fadeDuration,
                multiplier: selected === "slow" ? 2.5 : 1 },
              complete: () => finish(binding, target, record, "completed"),
              failed: error => {
                if (binding.active.get(target) !== record) return;
                issue(error); finish(binding, target, record, "engine-failed");
              },
            });
            // An adapter may finish synchronously. Its returned control must
            // still be stopped after that completion, without reviving work.
            if (binding.active.get(target) !== record) record.control?.stop();
          } catch (error) {
            issue(error);
            finish(binding, target, record, "engine-failed");
          }
          return Object.freeze({ finished });
        },
        dispose: release,
      });
    },
    setPolicy(next) {
      keys(next, ["mode", "profile", "reducedMotion"], "motion policy");
      if (disposed || (next.mode != null && !MODES.has(next.mode)) || (next.profile != null && !validVariantName(next.profile)) || (next.reducedMotion != null && typeof next.reducedMotion !== "boolean")) fail("Invalid motion policy");
      settleAll();
      mode = next.mode ?? mode; profile = next.profile ?? profile; reducedMotion = next.reducedMotion ?? reducedMotion;
    },
    snapshot() { return Object.freeze({ engine: adapter.name, mode: effectiveMode(), profile, active: [...bindings].reduce((count, binding) => count + binding.active.size, 0) }); },
    dispose() {
      if (disposed) return;
      for (const binding of [...bindings]) binding.release();
      disposed = true;
    },
  });
}
