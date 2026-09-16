// Only the host bootstrap may load the existing private Native adapter.
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { installNativeIntegratedBackendV2, type IntegratedNativeAddonV2 } from '../../../src/core-kernel/native/integrated-command-bus';

export function nativeBackend(path: string) {
  const absolutePath = resolve(path);
  const addon = require(absolutePath) as IntegratedNativeAddonV2;
  if (typeof addon.createIntegratedKernelSessionV2 !== 'function') throw new Error('需要 Native V2 内核，请检查 addon 路径。');
  const operations: Record<string, number> = {};
  let sessions = 0;
  const traced: IntegratedNativeAddonV2 = {
    createIntegratedKernelSessionV2(bytes, executor) {
      const operate = addon.createIntegratedKernelSessionV2(bytes, executor);
      sessions++;
      return request => {
        const operation = (JSON.parse(request.toString('utf8')) as { operation: string }).operation;
        operations[operation] = (operations[operation] ?? 0) + 1;
        return operate(request);
      };
    },
  };
  const hash = createHash('sha256').update(readFileSync(absolutePath)).digest('hex');
  return {
    withBackend<T>(create: () => T): T {
      const restore = installNativeIntegratedBackendV2(traced);
      try { return create(); } finally { restore(); }
    },
    evidence: () => ({ backend: 'native-v2', addonSha256: hash, sessions, operations: { ...operations } }),
  };
}
