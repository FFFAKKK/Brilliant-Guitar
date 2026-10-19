export const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);

// These lifecycle boundaries do not await hooks. Observe an illegal async result before rejecting it.
export function assertSynchronousResult(result, message) {
  if (typeof result?.then === "function") {
    Promise.resolve(result).catch(() => {});
    throw new TypeError(message);
  }
}

// Copy declarative data, retaining executable hooks without freezing the author's objects.
// Hook closures remain responsible for their own private state.
export function captureConfig(value, path = "config", ancestors = new Set()) {
  if (value == null || ["string", "boolean", "number", "function"].includes(typeof value)) return value;
  if (typeof value !== "object" || (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value)))) {
    throw new Error(`${path}: 配置只能包含普通对象、数组、值和函数钩子`);
  }
  if (ancestors.has(value)) throw new Error(`${path}: 配置存在循环引用`);
  ancestors.add(value);
  try {
    const result = Array.isArray(value)
      ? Array.from(value, (item, index) => captureConfig(item, `${path}[${index}]`, ancestors))
      : Object.fromEntries(Object.entries(value).map(([key, item]) => [key, captureConfig(item, `${path}.${key}`, ancestors)]));
    return Object.freeze(result);
  } finally { ancestors.delete(value); }
}

// Every callback runs at most once. Cleanup continues after failures and reports all of them.
export function createDisposalScope() {
  const callbacks = [];
  let closed = false;
  return {
    add(callback) {
      if (typeof callback !== "function") throw new TypeError("资源清理回调必须是函数");
      let active = true;
      const once = () => {
        if (active) {
          active = false;
          assertSynchronousResult(callback(), "资源清理回调必须同步完成");
        }
      };
      if (closed) once();
      else callbacks.push(once);
      return once;
    },
    dispose() {
      if (closed) return;
      closed = true;
      const errors = [];
      for (const cleanup of callbacks.splice(0).reverse()) {
        try { cleanup(); } catch (error) { errors.push(error); }
      }
      if (errors.length) throw new AggregateError(errors, "部分资源清理失败");
    },
  };
}

export function rollback(scope, cause) {
  try { scope.dispose(); }
  catch (cleanupError) {
    throw new AggregateError([cause, ...cleanupError.errors], `${cause?.message ?? cause}；回滚时部分资源清理失败`, { cause });
  }
  throw cause;
}

// A view observer must not interrupt registry mutation before its disposer can be returned.
export function notifyObservers(listeners, onObserverError) {
  const failed = error => {
    try {
      const result = onObserverError?.(error);
      if (result !== undefined) Promise.resolve(result).catch(() => {});
    } catch { /* diagnostics must not break ownership */ }
  };
  for (const listener of [...listeners]) {
    try {
      const result = listener();
      if (result !== undefined) Promise.resolve(result).catch(failed);
    } catch (error) { failed(error); }
  }
}
