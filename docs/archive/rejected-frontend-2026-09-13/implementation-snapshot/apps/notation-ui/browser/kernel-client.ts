import type { ActionRequest, EditorState, KernelClient, SavedFile } from '../contracts';

export class ApiError extends Error {
  constructor(message: string, readonly state?: EditorState) { super(message); }
}
export function createKernelClient(): KernelClient {
  async function request<T>(path: string, payload?: ActionRequest): Promise<T> {
    const response = await fetch(path, payload ? { method: 'POST', headers: {
      'Content-Type': 'application/json', 'X-Brilliant-Client': 'notation-ui-v1',
    }, body: JSON.stringify(payload) } : { cache: 'no-store' });
    const value = await response.json() as T & { error?: string; state?: EditorState };
    if (!response.ok) throw new ApiError(value.error ?? '连接失败，请检查本地宿主。', value.state);
    return value;
  }
  return { read: () => request<EditorState>('/api/state'), execute: data => request<EditorState>('/api/action', data),
    files: () => request<readonly SavedFile[]>('/api/files') };
}
