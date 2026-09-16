import type { EditIntent, EditorState } from '../contracts';

export interface ScoreViewContext {
  readonly container: HTMLElement;
  read(): EditorState;
  selection(): string;
  select(eventId: string): void;
  edit(intent: EditIntent): Promise<EditorState>;
  enqueue(operation: () => Promise<void> | void): void;
}
export interface ScoreView {
  render(): void;
  key(key: string): Promise<void>;
  destroy(): void;
}
export interface ScoreViewProvider {
  readonly id: string;
  readonly name: string;
  supports(state: EditorState): boolean;
  create(context: ScoreViewContext): Promise<ScoreView>;
}
export class ScoreViewRegistry {
  private readonly providers = new Map<string, ScoreViewProvider>();
  register(provider: ScoreViewProvider): void {
    if (!/^[a-z][a-z0-9.-]+$/.test(provider.id) || this.providers.has(provider.id)) throw new Error(`谱面身份无效或重复：${provider.id}`);
    this.providers.set(provider.id, provider);
  }
  available(state: EditorState): readonly ScoreViewProvider[] { return [...this.providers.values()].filter(provider => provider.supports(state)); }
  get(id: string, state: EditorState): ScoreViewProvider {
    const provider = this.providers.get(id);
    if (!provider || !provider.supports(state)) throw new Error('当前文档没有兼容的谱面视图。');
    return provider;
  }
}
