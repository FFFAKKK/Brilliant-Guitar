import { ANIMATION_BUDGET as BUDGET, animationRecord, captureAnimationContribution, captureAnimationPermissions,
  captureAnimationValues, validAnimationVariant } from "../contracts/animation.js";
import { createDomAnimationDriver } from "./dom-animation-driver.js";

const MODES = ["full", "slow", "reduced", "none"];
const completed = status => Object.freeze({ finished: Promise.resolve(Object.freeze({ status })) });
const validProvider = provider => provider == null || typeof provider.start === "function";

// Ordinary host service, not a plugin registry. forComponent is only called by
// the component host with its accepted registration and actual persistent cell.
export function createAnimationService({ driver = createDomAnimationDriver(), provider = null,
  mode = "full", profile = "continuous", reducedMotion = false, onIssue = () => {},
  schedule = (callback, milliseconds) => setTimeout(callback, milliseconds), unschedule = handle => clearTimeout(handle) } = {}) {
  if (["read", "write", "capture", "restore"].some(key => typeof driver?.[key] !== "function")
    || !validProvider(provider) || !MODES.includes(mode) || !validAnimationVariant(profile) || typeof reducedMotion !== "boolean"
    || typeof schedule !== "function" || typeof unschedule !== "function") throw new TypeError("Invalid animation service options");
  const components = new Set(), roots = new Map(), owners = new Map();
  let disposed = false, visible = true, activeCount = 0;
  const issue = (component, error) => {
    try { onIssue(Object.freeze({ source: component.definition.id, owner: component.definition.owner, code: "animation.provider-failed", error })); }
    catch { /* diagnostics cannot interrupt cleanup */ }
  };
  const effectiveMode = () => reducedMotion && mode !== "none" ? "reduced" : mode;
  const local = (component, node) => {
    if (!component.element.contains(node) || node === component.element) return false;
    for (let parent = node; parent && parent !== component.element; parent = parent.parentNode) {
      if (roots.has(parent) && roots.get(parent) !== component) return false;
    }
    return true;
  };
  function finish(component, binding, target, record, status, settle = true) {
    if (binding.active.get(target) !== record) return;
    binding.active.delete(target); activeCount--;
    if (record.timer != null) unschedule(record.timer);
    try { record.control?.stop(); } catch (error) { issue(component, error); }
    if (settle && local(component, record.node)) {
      try { driver.write(record.node, record.to, record.intent); }
      catch (error) { issue(component, error); status = "engine-failed"; }
    }
    record.resolve(Object.freeze({ status }));
  }
  function settle(component, status = "cancelled") {
    for (const binding of component.bindings) for (const [target, record] of [...binding.active]) finish(component, binding, target, record, status);
  }
  function settleAll() { for (const component of components) settle(component); }

  return Object.freeze({
    forComponent(definition, element) {
      if (disposed || !definition || typeof definition.owner !== "string" || !definition.owner.trim()
        || typeof definition.id !== "string" || !definition.id.startsWith(`${definition.owner}.`)
        || !element || typeof element.contains !== "function" || roots.has(element)) throw new TypeError("Invalid registered animation component");
      const contribution = captureAnimationContribution(definition.animations);
      const permissions = captureAnimationPermissions(definition.permissions?.animations);
      if (Object.keys(contribution.definitions).some(intent => !permissions.includes(intent))) throw new TypeError("Animation definition exceeds component permissions");
      const component = { definition: Object.freeze({ id: definition.id, owner: definition.owner }), element,
        bindings: new Set(), visible: true, released: false, targets: 0, profile: null };
      components.add(component); roots.set(element, component);
      const releaseBinding = binding => {
        if (binding.released) return;
        binding.released = true;
        for (const [target, record] of [...binding.active]) finish(component, binding, target, record, "cancelled");
        component.bindings.delete(binding); component.targets -= binding.grants.size;
        for (const grant of binding.grants.values()) {
          owners.delete(grant.node);
          // A node moved into a foreign cell is no longer ours to write.
          if (local(component, grant.node)) {
            try { driver.restore(grant.node, grant.original); } catch (error) { issue(component, error); }
          }
        }
      };
      const release = () => {
        if (component.released) return;
        component.released = true;
        for (const binding of [...component.bindings]) releaseBinding(binding);
        roots.delete(element); components.delete(component);
      };
      component.release = release;
      return Object.freeze({
        bind(targets) {
          if (disposed || component.released) throw new TypeError("Released animation component");
          animationRecord(targets, Object.keys(targets ?? {}), "animation targets");
          const names = Object.keys(targets);
          if (!names.length || component.targets + names.length > BUDGET.targets) throw new TypeError("Animation target budget exceeded");
          const grants = new Map(), nodes = new Set();
          for (const [name, grant] of Object.entries(targets)) {
            if (!/^[a-z][a-z0-9:-]{0,63}$/.test(name)) throw new TypeError("Invalid animation target name");
            animationRecord(grant, ["node", "intents"], "animation target grant");
            const intents = captureAnimationPermissions(grant.intents);
            if (!intents.length || intents.some(intent => !permissions.includes(intent)) || !local(component, grant.node)
              || owners.has(grant.node) || nodes.has(grant.node)) throw new TypeError("Animation target or intent denied");
            nodes.add(grant.node); grants.set(name, { node: grant.node, intents });
          }
          // Validate the entire batch before acquiring nodes. Capture failure
          // leaves no claims, so the next valid bind can still succeed.
          for (const grant of grants.values()) grant.original = driver.capture(grant.node, grant.intents);
          const binding = { active: new Map(), grants, released: false };
          for (const grant of grants.values()) owners.set(grant.node, binding);
          component.targets += grants.size; component.bindings.add(binding);
          const granted = (target, intent) => {
            if (disposed || component.released || binding.released) throw new TypeError("Released animation scope");
            const grant = grants.get(target);
            if (!grant || !grant.intents.includes(intent) || !local(component, grant.node)) throw new TypeError("Animation target or intent denied");
            return grant;
          };
          const stop = (target, settle) => {
            const record = binding.active.get(target);
            if (record) finish(component, binding, target, record, "interrupted", settle);
          };
          return Object.freeze({
            hold(request) {
              animationRecord(request, ["intent", "target"], "animation hold");
              const grant = granted(request.target, request.intent);
              const sampled = driver.read(grant.node, request.intent);
              const position = request.intent === "shape-transition" ? captureAnimationValues(sampled, request.intent) : Object.freeze({ ...sampled });
              stop(request.target, false); driver.write(grant.node, position, request.intent);
              return position;
            },
            place(request) {
              animationRecord(request, ["intent", "target", "to"], "animation place");
              const grant = granted(request.target, request.intent), to = captureAnimationValues(request.to, request.intent);
              stop(request.target, false); driver.write(grant.node, to, request.intent);
            },
            play(request) {
              animationRecord(request, ["intent", "target", "from", "to", "velocity", "immediate"], "animation request");
              const { intent, target } = request, grant = granted(target, intent);
              if (intent === "shape-transition") animationRecord(request, ["intent", "target", "from", "to", "immediate"], "shape animation request");
              const destination = captureAnimationValues(request.to, intent);
              const source = request.from == null ? null : captureAnimationValues(request.from, intent);
              const velocity = request.velocity ?? {};
              animationRecord(velocity, ["x", "y"], "animation velocity");
              if (Object.values(velocity).some(value => typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > BUDGET.velocity)
                || request.immediate != null && typeof request.immediate !== "boolean") throw new TypeError("Invalid animation playback options");
              const sampled = driver.read(grant.node, intent);
              const current = intent === "shape-transition" ? captureAnimationValues(sampled, intent) : sampled;
              const to = { ...current, ...destination }, from = { ...current, ...source };
              const selected = effectiveMode(), definition = contribution.definitions[intent];
              const selectedProfile = component.profile ?? profile;
              const settings = definition ? definition.variants[Object.hasOwn(definition.variants, selectedProfile) ? selectedProfile : definition.defaultVariant] : null;
              if (selected === "reduced" && intent === "content-transition") { from.x = to.x = 0; from.y = to.y = 0; }
              const animate = visible && component.visible && provider && settings && settings.type !== "instant" && !request.immediate && selected !== "none"
                && (selected !== "reduced" || intent === "content-transition");
              if (animate && activeCount - Number(binding.active.has(target)) >= BUDGET.active) throw new TypeError("Animation concurrency budget exceeded");
              // All supplied input is validated before interrupting earlier work.
              stop(target, false);
              if (!animate) { driver.write(grant.node, to, intent); return completed("completed"); }
              let resolve;
              const finished = new Promise(done => { resolve = done; });
              const record = { node: grant.node, intent, to: Object.freeze(to), resolve, control: null, timer: null };
              binding.active.set(target, record); activeCount++;
              const isCurrent = () => binding.active.get(target) === record && local(component, grant.node);
              const failed = error => {
                if (binding.active.get(target) !== record) return;
                if (!local(component, grant.node)) { finish(component, binding, target, record, "cancelled", false); return; }
                issue(component, error); finish(component, binding, target, record, "engine-failed");
              };
              const multiplier = selected === "slow" ? 2.5 : 1;
              const playback = Object.freeze({ ...settings, duration: selected === "reduced" ? .1 : settings.duration,
                ...(intent === "shape-transition" ? {} : {
                  fadeDuration: selected === "reduced" ? .1 : to.opacity < from.opacity ? settings.exitDuration : settings.fadeDuration,
                }), multiplier });
              try {
                driver.write(grant.node, from, intent);
                const seconds = settings.type === "spring" ? BUDGET.springSeconds : Math.max(playback.duration, playback.fadeDuration ?? 0);
                record.timer = schedule(() => failed(new Error("Animation time budget exceeded")), seconds * multiplier * 1000 + 50);
                record.control = provider.start({ node: grant.node, intent, from: Object.freeze(from), to: record.to,
                  velocity: Object.freeze({ x: velocity.x ?? 0, y: velocity.y ?? 0 }), settings: playback, isCurrent,
                  write: value => {
                    if (!isCurrent()) return;
                    try { driver.write(grant.node, value, intent); } catch (error) { failed(error); }
                  },
                  complete: () => finish(component, binding, target, record, "completed"), failed });
                if (!record.control || typeof record.control.stop !== "function") throw new TypeError("Invalid animation provider control");
                if (binding.active.get(target) !== record) record.control.stop();
              } catch (error) { failed(error); }
              return Object.freeze({ finished });
            },
            cancel() { for (const [target, record] of [...binding.active]) finish(component, binding, target, record, "cancelled"); },
            dispose: () => releaseBinding(binding),
          });
        },
        // Host-only author variant selection. ctx.motion still exposes bind only.
        // Existing jobs retain their captured settings; global mode/reduction wins.
        setProfile(next = null) {
          if (component.released || next !== null && !validAnimationVariant(next)) throw new TypeError("Invalid component animation profile");
          component.profile = next;
        },
        setVisible(visible) {
          if (typeof visible !== "boolean") throw new TypeError("Invalid animation visibility");
          if (component.released || component.visible === visible) return;
          component.visible = visible;
          if (!visible) settle(component);
        },
        dispose: release,
      });
    },
    setPolicy(next) {
      animationRecord(next, ["mode", "profile", "reducedMotion"], "animation policy");
      if (disposed || next.mode != null && !MODES.includes(next.mode) || next.profile != null && !validAnimationVariant(next.profile)
        || next.reducedMotion != null && typeof next.reducedMotion !== "boolean") throw new TypeError("Invalid animation policy");
      settleAll(); mode = next.mode ?? mode; profile = next.profile ?? profile; reducedMotion = next.reducedMotion ?? reducedMotion;
    },
    replaceProvider(next) {
      if (disposed || !validProvider(next)) throw new TypeError("Invalid animation provider");
      settleAll(); provider = next;
    },
    setVisible(next) {
      if (typeof next !== "boolean") throw new TypeError("Invalid animation service visibility");
      if (disposed || next === visible) return;
      visible = next; if (!visible) settleAll();
    },
    snapshot: () => Object.freeze({ provider: provider?.name ?? null, mode: effectiveMode(), profile, visible, active: activeCount, components: components.size, targets: owners.size }),
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const component of [...components]) {
        // Public component port owns full cleanup; stored internally to keep
        // the service's release path identical to the component host's.
        component.release();
      }
    },
  });
}
