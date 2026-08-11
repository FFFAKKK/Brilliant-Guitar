import type {
  KernelIssue,
  KernelReport,
  KernelReportKind,
} from "./contracts";

const structuredCloneValue = structuredClone;
const reflectApply = Reflect.apply;
const reflectOwnKeys = Reflect.ownKeys;
const reflectGetOwnPropertyDescriptor = Reflect.getOwnPropertyDescriptor;
const objectFreeze = Object.freeze;
const weakSetConstructor = WeakSet;
const weakSetHas = WeakSet.prototype.has;
const weakSetAdd = WeakSet.prototype.add;

function freezeReportData<T>(value: T): T {
  const seen = new weakSetConstructor<object>();
  const pending: unknown[] = [value];
  const objects: object[] = [];
  while (pending.length > 0) {
    const current = pending[pending.length - 1];
    pending.length -= 1;
    if (
      current === null ||
      typeof current !== "object" ||
      reflectApply(weakSetHas, seen, [current]) === true
    ) {
      continue;
    }
    reflectApply(weakSetAdd, seen, [current]);
    objects[objects.length] = current;
    const keys = reflectOwnKeys(current);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (key === undefined) continue;
      const descriptor = reflectGetOwnPropertyDescriptor(current, key);
      if (descriptor !== undefined && "value" in descriptor) {
        pending[pending.length] = descriptor.value;
      }
    }
  }
  for (let index = objects.length - 1; index >= 0; index -= 1) {
    const current = objects[index];
    if (current !== undefined) {
      reflectApply(objectFreeze, Object, [current]);
    }
  }
  return value;
}

export function buildKernelReport<Kind extends KernelReportKind>(
  kind: Kind,
  issues: readonly KernelIssue[],
): KernelReport<Kind> {
  const detachedIssues = freezeReportData(structuredCloneValue(issues));
  let issueCount = 0;
  let warningCount = 0;
  let errorCount = 0;
  let fatalCount = 0;

  function increment(value: number): number {
    if (value >= Number.MAX_SAFE_INTEGER) {
      throw new RangeError("kernel report count overflow");
    }
    return value + 1;
  }

  for (const issue of detachedIssues) {
    issueCount = increment(issueCount);
    switch (issue.severity) {
      case "warning":
        warningCount = increment(warningCount);
        break;
      case "error":
        errorCount = increment(errorCount);
        break;
      case "fatal":
        fatalCount = increment(fatalCount);
        break;
    }
  }

  const status =
    fatalCount > 0 || errorCount > 0
      ? "rejected"
      : warningCount > 0
        ? "completed-with-warnings"
        : "completed";

  return freezeReportData({
    reportVersion: 1,
    kind,
    status,
    summary: {
      issueCount,
      warningCount,
      errorCount,
      fatalCount,
    },
    issues: detachedIssues,
  });
}
