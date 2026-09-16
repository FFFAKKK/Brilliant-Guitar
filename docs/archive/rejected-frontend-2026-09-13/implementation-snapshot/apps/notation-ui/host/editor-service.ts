import { randomUUID } from 'node:crypto';
import {
  CommandBus, createScoreDocument, encodeScoreDocumentJson, parseScoreDocumentJson,
  type IntegratedCommandBus, type ScoreDocument, type RhythmicEvent,
} from '../../../src/core-kernel/index';
import { compileOfficialModuleCatalogV1 } from '../../../src/core-kernel/module-sdk/index';
import type { EditorState, Pitch, ScoreEvent } from '../contracts';
import { FileStore, digest } from './file-store';
import { nativeBackend } from './native-backend';

export class RequestError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
const envelope = (commandId: string, target: unknown, payload: unknown) => ({ commandVersion: 1, commandId, target, payload });
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const pitchValid = (value: unknown): value is Pitch => isRecord(value) && Object.keys(value).length === 3
  && typeof value.step === 'string' && /^[CDEFGAB]$/.test(value.step)
  && Number.isInteger(value.octave) && (value.octave as number) >= 3 && (value.octave as number) <= 6 && value.alter === 0;

function initialDocument(): ScoreDocument {
  const result = createScoreDocument({ factoryVersion: 1, documentId: randomUUID(),
    metadata: { title: '未命名乐谱', authors: [], tempo: { bpm: 100 } },
    initialMeasure: { id: 'measure-1', meter: { numerator: 4, denominator: 4 } },
    initialParts: [{ id: 'part-1', name: '标准记谱', instrument: {
      name: 'Standard notation', writtenToSounding: { diatonicSteps: 0, chromaticSemitones: 0 },
    }, staves: [{ id: 'staff-1', lineCount: 5, defaultClef: { sign: 'G', line: 2 } }],
    voices: [{ id: 'voice-1', defaultStaffId: 'staff-1', sequence: { start: { numerator: 0, denominator: 1 },
      events: [1, 2, 3, 4].map(index => ({ id: `event-${index}`, duration: { base: 4, dots: 0 }, content: { kind: 'rest' } })),
    } }], }], extensions: [],
  });
  if (result.status !== 'created') throw new Error('无法建立初始乐谱。');
  return result.document;
}

/** Support is checked before replacing the current session: no partial import or silent data loss. */
export function assertSupported(doc: ScoreDocument): void {
  const part = doc.parts[0], measure = doc.measureDefinitions[0], content = part?.measureContents[0];
  const staff = part?.staves[0], voice = content?.voices[0];
  if (doc.extensions.length || doc.parts.length !== 1 || doc.measureDefinitions.length !== 1 || !part || !measure
    || measure.pickupDuration !== undefined || measure.meter.numerator !== 4 || measure.meter.denominator !== 4
    || part.staves.length !== 1 || part.measureContents.length !== 1 || content?.voices.length !== 1
    || staff?.lineCount !== 5 || staff.defaultClef.sign !== 'G' || staff.defaultClef.line !== 2
    || part.instrument.writtenToSounding.chromaticSemitones !== 0 || part.instrument.writtenToSounding.diatonicSteps !== 0
    || !voice || voice.sequence.start.numerator !== 0 || voice.sequence.events.length !== 4
    || voice.sequence.events.some(event => event.duration.base !== 4 || event.duration.dots !== 0
      || (event.content.kind === 'notes' && (event.content.notes.length !== 1 || !pitchValid(event.content.notes[0]?.writtenPitch))))) {
    throw new RequestError('初版支持单小节 4/4、单声部、高音谱号及 C3–B6 自然音。含乐器扩展或其他内容的文件不会被修改。');
  }
}

export class EditorService {
  private readonly native;
  private bus: IntegratedCommandBus;
  private sessionId = randomUUID();
  private filename: string | null = null;
  private savedHash: string | null = null;
  constructor(readonly files: FileStore, addonPath: string) {
    this.native = nativeBackend(addonPath);
    this.bus = this.openSession(initialDocument());
  }
  private openSession(document: ScoreDocument): IntegratedCommandBus {
    assertSupported(document);
    const compiled = compileOfficialModuleCatalogV1({ startupManifestVersion: 1, modules: [
      { moduleId: 'core.commands', origin: 'official', runtime: 'builtin', trustLevel: 'system-trusted', apiVersion: 1,
        capabilities: ['command:register'], registrationEntryIds: ['core.commands.v1'] },
      { moduleId: 'core.selectors', origin: 'official', runtime: 'builtin', trustLevel: 'system-trusted', apiVersion: 1,
        capabilities: ['selector:register'], registrationEntryIds: ['core.selectors.v1'] },
    ] }, []);
    if (!compiled.ok) throw new Error(`无法装配基础内核：${JSON.stringify(compiled)}`);
    const created = this.native.withBackend(() => CommandBus.createIntegrated(document, compiled.catalog));
    if (!created.ok) throw new RequestError(`文件未通过内核校验：${created.failure.code}`);
    return created.value;
  }
  private current() {
    const result = this.bus.read();
    if (!result.ok) throw new Error('读取内核失败。');
    return result.value;
  }
  read(): EditorState {
    const state = this.current();
    return { sessionId: this.sessionId, version: state.snapshot.documentVersion, title: state.snapshot.document.metadata.title,
      events: this.events(state.snapshot.document).map((event): ScoreEvent => ({ id: event.id,
        pitch: event.content.kind === 'rest' ? null : { ...event.content.notes[0]!.writtenPitch, alter: 0 },
      })), needsSave: this.filename === null || state.dirty, filename: this.filename,
      canUndo: state.history.undoDepth > 0, canRedo: state.history.redoDepth > 0, notation: 'standard-quarter-v1' };
  }
  evidence() { return this.native.evidence(); }
  private events(doc: ScoreDocument): readonly RhythmicEvent[] { return doc.parts[0]!.measureContents[0]!.voices[0]!.sequence.events; }
  execute(request: unknown): EditorState {
    if (!isRecord(request) || request.sessionId !== this.sessionId || request.version !== this.current().snapshot.documentVersion)
      throw new RequestError('乐谱已在其他窗口或操作中改变，已刷新，请重新操作。', 409);
    const action = request.action;
    if (!isRecord(action) || typeof action.kind !== 'string') throw new RequestError('无效操作。');
    if (action.kind === 'new') {
      const bus = this.openSession(initialDocument());
      this.bus = bus; this.sessionId = randomUUID(); this.filename = null; this.savedHash = null;
    } else if (action.kind === 'open') {
      if (typeof action.name !== 'string') throw new RequestError('请选择文件。');
      const text = this.files.read(action.name), parsed = parseScoreDocumentJson(text);
      if (!parsed.ok) throw new RequestError('文件损坏或格式不受支持，当前乐谱已保留。');
      const bus = this.openSession(parsed.value);
      this.bus = bus; this.sessionId = randomUUID(); this.filename = action.name; this.savedHash = digest(text);
    } else if (action.kind === 'save') {
      const name = action.name === undefined ? this.filename : action.name;
      if (typeof name !== 'string') throw new RequestError('请先为乐谱命名。');
      const snapshot = this.current().snapshot, encoded = encodeScoreDocumentJson(snapshot.document);
      if (!encoded.ok) throw new Error('编码失败，未写入文件。');
      const hash = this.files.write(name, encoded.value, name === this.filename ? this.savedHash : null);
      const marked = this.bus.markPersisted({ documentId: snapshot.documentId, documentVersion: snapshot.documentVersion });
      if (marked.status === 'rejected') throw new Error('文件已写入，但保存状态未更新，请重新打开核对。');
      this.filename = name; this.savedHash = hash;
    } else if (action.kind === 'undo' || action.kind === 'redo') {
      this.checkResult(action.kind === 'undo' ? this.bus.undo() : this.bus.redo());
    } else if (action.kind === 'pitch' || action.kind === 'rest') {
      if (action.kind === 'pitch' && !pitchValid(action.pitch)) throw new RequestError('请输入 C3–B6 范围内的自然音。');
      const doc = this.current().snapshot.document, events = this.events(doc);
      const index = events.findIndex(event => event.id === action.eventId), event = events[index];
      if (!event) throw new RequestError('编辑目标不存在。');
      if (action.kind === 'pitch' && event.content.kind === 'notes') {
        this.checkResult(this.bus.submit(envelope('core.note.set-written-pitch', { kind: 'note', noteId: event.content.notes[0]!.id }, { writtenPitch: action.pitch })));
      } else if (!(action.kind === 'rest' && event.content.kind === 'rest')) {
        const anchor = index === 0 ? { kind: 'start' } : { kind: 'after-event', eventId: events[index - 1]!.id };
        const content = action.kind === 'rest' ? { kind: 'rest' } : { kind: 'notes', notes: [{ id: randomUUID(), writtenPitch: action.pitch }] };
        this.checkResult(this.bus.submit(envelope('core.transaction.batch', { kind: 'document', documentId: doc.id }, { commands: [
          envelope('core.event.remove', { kind: 'event', eventId: event.id }, {}),
          envelope(action.kind === 'rest' ? 'core.voice.insert-rest-event' : 'core.voice.insert-notes-event',
            { kind: 'voice', voiceId: doc.parts[0]!.measureContents[0]!.voices[0]!.id },
            { anchor, event: { id: event.id, duration: event.duration, content } }),
        ] })));
      }
    } else throw new RequestError('此操作尚未支持。');
    return this.read();
  }
  private checkResult(result: { readonly status: string; readonly failure?: { readonly code: string } }) {
    if (result.status === 'rejected') throw new RequestError(`修改未通过内核校验：${result.failure?.code ?? 'unknown'}`);
  }
}
