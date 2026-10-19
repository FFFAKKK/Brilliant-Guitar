import { createAnimationService } from "../runtime/animation-service.js";
import { createMotionAnimationProvider } from "../runtime/motion-animation-provider.js";
import { animationRecord } from "../contracts/animation.js";
import { createDisposalScope, rollback } from "../runtime/runtime-support.js";

// Application composition helper. No registration or layout/command state.
export function createWorkspaceAnimations({ root, notices, provider = undefined, policy = {}, driver = undefined } = {}) {
  animationRecord(policy, ["mode", "profile"], "workspace animation policy");
  const scope = createDisposalScope(), media = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
  const service = createAnimationService({ ...(driver ? { driver } : {}),
    provider: provider === undefined ? createMotionAnimationProvider() : provider,
    ...policy, reducedMotion: media?.matches ?? false,
    onIssue: issue => notices.push({ level: "error", source: issue.source,
      text: `动画执行失败，已采用静态结果：${issue.error?.message ?? String(issue.error)}` }),
  });
  scope.add(() => service.dispose());
  try {
    const changed = () => service.setPolicy({ reducedMotion: media.matches });
    if (media?.addEventListener) { media.addEventListener("change", changed); scope.add(() => media.removeEventListener("change", changed)); }
    const visibility = () => service.setVisible(!root.hidden && root.style.display !== "none" && root.ownerDocument.visibilityState !== "hidden");
    visibility();
    const document = root.ownerDocument;
    document.addEventListener("visibilitychange", visibility);
    scope.add(() => document.removeEventListener("visibilitychange", visibility));
    if (typeof globalThis.MutationObserver === "function") {
      const observer = new MutationObserver(visibility);
      observer.observe(root, { attributes: true, attributeFilter: ["hidden", "style"] });
      scope.add(() => observer.disconnect());
    }
    return Object.freeze({ service, controls: Object.freeze({ snapshot: service.snapshot,
      setPolicy(next) { animationRecord(next, ["mode", "profile"], "workspace animation policy"); service.setPolicy(next); },
      replaceProvider: service.replaceProvider }), dispose: () => scope.dispose() });
  } catch (error) { rollback(scope, error); }
}
