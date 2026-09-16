/** Versioned application boundary. No kernel implementation or renderer types cross it. */
export type PitchStep = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';
export interface Pitch { readonly step: PitchStep; readonly octave: number; readonly alter: 0 }
export interface ScoreEvent { readonly id: string; readonly pitch: Pitch | null }
export interface EditorState {
  readonly sessionId: string;
  readonly version: number;
  readonly title: string;
  readonly events: readonly ScoreEvent[];
  readonly needsSave: boolean;
  readonly filename: string | null;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly notation: 'standard-quarter-v1';
}
export type EditIntent = { readonly kind: 'pitch'; readonly eventId: string; readonly pitch: Pitch }
  | { readonly kind: 'rest'; readonly eventId: string };
export type EditorAction = EditIntent | { readonly kind: 'undo' | 'redo' | 'new' }
  | { readonly kind: 'save'; readonly name?: string }
  | { readonly kind: 'open'; readonly name: string };
export interface ActionRequest { readonly sessionId: string; readonly version: number; readonly action: EditorAction }
export interface SavedFile { readonly name: string; readonly modified: string }
export interface KernelClient {
  read(): Promise<EditorState>;
  execute(request: ActionRequest): Promise<EditorState>;
  files(): Promise<readonly SavedFile[]>;
}
