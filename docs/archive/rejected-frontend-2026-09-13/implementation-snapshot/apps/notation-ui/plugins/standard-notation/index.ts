import { VexFlow, Renderer, Stave, StaveNote, Formatter, Voice } from 'vexflow';
import type { ScoreViewProvider, ScoreView } from '../../browser/score-views';
import type { PitchStep } from '../../contracts';
import { pitchLabel, shiftPitch, STEPS } from './input';

/** This plugin has no dependency on kernel code, Node, transport or another plugin. */
export const standardNotation: ScoreViewProvider = {
  id: 'builtin.standard-notation', name: '五线谱',
  supports: state => state.notation === 'standard-quarter-v1',
  async create(context): Promise<ScoreView> {
    // The package entry embeds the fonts. Await those, not loadFonts()'s remote URLs.
    await document.fonts.ready;
    VexFlow.setFonts('Bravura', 'Academico');
    const root = document.createElement('section'); root.className = 'notation-module';
    root.innerHTML = `<div class="notation-heading"><span>标准记谱 <span class="muted">/ 高音谱号</span></span><span>4/4 拍 · 四分音符</span></div>
      <div class="notation-scroll"><div class="engraving"></div></div>
      <div class="input-strip"><div class="selection-label"></div><div class="note-keys" aria-label="输入音符"></div>
      <label class="octave-label">输入八度 <select aria-label="输入八度"><option>3</option><option selected>4</option><option>5</option><option>6</option></select></label>
      <button class="rest-key" type="button">休止 <kbd>R</kbd></button></div>
      <p class="notation-help">点击拍位后，直接按 <strong>A–G</strong> 输入音名。<span>← → 移动　↑ ↓ 调整音高　Delete 删除</span></p>`;
    context.container.append(root);
    const engraving = root.querySelector<HTMLDivElement>('.engraving')!;
    const octave = root.querySelector<HTMLSelectElement>('select')!;
    const label = root.querySelector<HTMLDivElement>('.selection-label')!;
    let alive = true;
    const view: ScoreView = {
      render() {
        if (!alive) return;
        engraving.replaceChildren();
        const state = context.read();
        const width = Math.max(520, root.clientWidth - 48);
        engraving.style.width = `${width}px`;
        const renderer = new Renderer(engraving, Renderer.Backends.SVG); renderer.resize(width, 265);
        const drawing = renderer.getContext();
        const stave = new Stave(16, 85, width - 32).addClef('treble').addTimeSignature('4/4');
        stave.setContext(drawing).draw();
        const notes = state.events.map(event => {
          const note = new StaveNote({ clef: 'treble', keys: [event.pitch ? `${event.pitch.step.toLowerCase()}/${event.pitch.octave}` : 'b/4'], duration: event.pitch ? 'q' : 'qr' });
          if (event.id === context.selection()) note.setStyle({ fillStyle: '#276756', strokeStyle: '#276756' });
          return note;
        });
        const voice = new Voice({ numBeats: 4, beatValue: 4 }).addTickables(notes);
        new Formatter().joinVoices([voice]).formatToStave([voice], stave);
        voice.draw(drawing, stave);
        notes.forEach((note, index) => {
          const event = state.events[index]!;
          const button = document.createElement('button'); button.type = 'button';
          button.className = `beat-target${event.id === context.selection() ? ' selected' : ''}`;
          button.style.left = `${note.getAbsoluteX() - 36}px`;
          button.setAttribute('aria-label', `第 ${index + 1} 拍，${pitchLabel(event.pitch)}`);
          button.setAttribute('aria-pressed', String(event.id === context.selection()));
          const text = document.createElement('span'); text.textContent = `${index + 1}　${pitchLabel(event.pitch)}`;
          button.append(text);
          button.addEventListener('click', () => context.enqueue(() => context.select(event.id)));
          engraving.append(button);
        });
        const index = state.events.findIndex(event => event.id === context.selection());
        label.textContent = `第 ${index + 1} 拍 · ${pitchLabel(state.events[index]?.pitch ?? null)}`;
      },
      async key(key) {
        const state = context.read();
        const index = state.events.findIndex(event => event.id === context.selection());
        const event = state.events[index]; if (!event) return;
        if (key === 'ArrowLeft' || key === 'ArrowRight') {
          context.select(state.events[Math.max(0, Math.min(3, index + (key === 'ArrowLeft' ? -1 : 1)))]!.id); return;
        }
        if (key === 'ArrowUp' || key === 'ArrowDown') {
          if (!event.pitch) return;
          const pitch = shiftPitch(event.pitch, key === 'ArrowUp' ? 1 : -1);
          if (pitch) { await context.edit({ kind: 'pitch', eventId: event.id, pitch }); octave.value = String(pitch.octave); }
        } else if (/^[a-g]$/i.test(key)) {
          const result = await context.edit({ kind: 'pitch', eventId: event.id,
            pitch: { step: key.toUpperCase() as PitchStep, octave: Number(octave.value), alter: 0 } });
          if (!event.pitch) context.select(result.events[Math.min(3, index + 1)]!.id);
        } else if (['r', 'R', 'Delete', 'Backspace'].includes(key)) {
          const result = await context.edit({ kind: 'rest', eventId: event.id });
          if (key.toLowerCase() === 'r') context.select(result.events[Math.min(3, index + 1)]!.id);
        }
      },
      destroy() { alive = false; observer.disconnect(); root.remove(); },
    };
    for (const step of STEPS) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = step;
      button.setAttribute('aria-label', `输入 ${step}`);
      button.addEventListener('click', () => context.enqueue(() => view.key(step)));
      root.querySelector('.note-keys')!.append(button);
    }
    root.querySelector('.rest-key')!.addEventListener('click', () => context.enqueue(() => view.key('r')));
    const observer = new ResizeObserver(() => view.render()); observer.observe(root);
    view.render(); return view;
  },
};
