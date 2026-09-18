import assert from "node:assert/strict";
import test from "node:test";
import type { PlaybackSourceProjection } from "../src/contracts/playback.ts";
import type { PlaybackEngine } from "../src/playback/playback-engine.ts";
import { PlaybackSession } from "../src/playback/playback-session.ts";
import type { PlaybackScheduler } from "../src/playback/playback-session.ts";

class FakeEngine implements PlaybackEngine {
  time = 10;
  activations = 0;
  starts: number[] = [];
  stops = 0;
  fail: Error | null = null;
  async activate() { this.activations += 1; if (this.fail) throw this.fail; }
  now() { return this.time; }
  start(_items: readonly unknown[], offset: number) { this.starts.push(offset); }
  stop() { this.stops += 1; }
}

class FakeScheduler implements PlaybackScheduler {
  callback: (() => void) | null = null;
  lastCancelledCallback: (() => void) | null = null;
  repeat(callback: () => void) {
    this.callback = callback;
    return () => {
      this.lastCancelledCallback = callback;
      if (this.callback === callback) this.callback = null;
    };
  }
  flush() { this.callback?.(); }
}

type ReadyPlaybackSource = Extract<PlaybackSourceProjection, { readonly kind: "ready" }>;

const source = (version = 1): ReadyPlaybackSource => ({
  kind: "ready", projectionVersion: 1, documentId: "score", documentVersion: version, bpm: 120,
  writtenToSounding: { diatonicSteps: 0, chromaticSemitones: 0 },
  measures: [{ id: "m1", meter: { numerator: 4, denominator: 4 }, voiceStart: { numerator: 0, denominator: 1 },
    events: [{ id: "n1", duration: { numerator: 1, denominator: 4 }, content: { kind: "note",
      writtenPitch: { step: "A", alter: 0, octave: 4 } } }] }],
});

const twoNoteSource = (): ReadyPlaybackSource => ({
  ...source(), measures: [{ id: "m1", meter: { numerator: 4, denominator: 4 }, voiceStart: { numerator: 0, denominator: 1 },
    events: [
      { id: "n1", duration: { numerator: 1, denominator: 4 }, content: { kind: "note", writtenPitch: { step: "A", alter: 0, octave: 4 } } },
      { id: "n2", duration: { numerator: 1, denominator: 4 }, content: { kind: "note", writtenPitch: { step: "B", alter: 0, octave: 4 } } },
    ] }],
});

test("play, pause, resume and stop share one deterministic playback session", async () => {
  const engine = new FakeEngine(), scheduler = new FakeScheduler(), session = new PlaybackSession(engine, scheduler);
  session.setSource(source());
  assert.equal(session.getSnapshot().state, "stopped");
  session.prepareStart({ measureId: "m1", eventId: "n1" });
  assert.equal(session.getSnapshot().positionSeconds, 0);
  await session.toggle();
  assert.equal(session.getSnapshot().state, "playing");
  engine.time += 0.4; scheduler.flush();
  assert.equal(session.getSnapshot().positionSeconds, 0.40000000000000036);
  session.pause();
  assert.equal(session.getSnapshot().state, "paused");
  await session.toggle();
  assert.equal(engine.starts.at(-1), session.getSnapshot().positionSeconds);
  session.stop();
  assert.equal(session.getSnapshot().state, "stopped");
  assert.equal(session.getSnapshot().positionSeconds, 0);
});

test("document replacement cancels old playback and activation failures stay explicit", async () => {
  const engine = new FakeEngine(), scheduler = new FakeScheduler(), session = new PlaybackSession(engine, scheduler);
  session.setSource(source()); await session.play();
  session.setSource(source(2));
  assert.equal(session.getSnapshot().state, "stopped");
  assert.equal(scheduler.callback, null);
  engine.fail = new Error("device blocked");
  await session.play();
  assert.equal(session.getSnapshot().state, "stopped");
  assert.deepEqual(session.getSnapshot().diagnostic, { code: "audio.activation-failed", message: "device blocked" });
});

test("replacing the output engine stops active playback and retires its clock", async () => {
  const oldEngine = new FakeEngine(), newEngine = new FakeEngine(), scheduler = new FakeScheduler();
  const session = new PlaybackSession(oldEngine, scheduler);
  session.setSource(source());
  await session.play();

  assert.equal(session.getSnapshot().state, "playing");
  assert.notEqual(scheduler.callback, null);
  const stopsBeforeReplacement = oldEngine.stops;

  session.replaceEngine(newEngine);

  assert.equal(oldEngine.stops, stopsBeforeReplacement + 1);
  assert.equal(newEngine.stops, 0);
  assert.equal(scheduler.callback, null);
  assert.equal(session.getSnapshot().state, "stopped");
  assert.equal(session.getSnapshot().positionSeconds, 0);
  assert.equal(session.getSnapshot().location?.eventId, "n1");

  oldEngine.time += 2;
  scheduler.lastCancelledCallback?.();
  assert.equal(session.getSnapshot().state, "stopped");
  assert.equal(session.getSnapshot().positionSeconds, 0);
});

test("audio activation and device failures use distinct local diagnostics", async () => {
  const engine = new FakeEngine(), session = new PlaybackSession(engine, new FakeScheduler());
  session.setSource(source());

  engine.fail = Object.assign(new Error("请先允许音频播放"), { name: "NotAllowedError" });
  await session.play();
  assert.equal(session.getSnapshot().diagnostic?.code, "audio.activation-required");

  engine.fail = Object.assign(new Error("当前设备不支持音频播放"), { name: "NotSupportedError" });
  await session.play();
  assert.equal(session.getSnapshot().diagnostic?.code, "audio.unavailable");
});

test("transport navigation seeks only to real event boundaries", () => {
  const engine = new FakeEngine(), session = new PlaybackSession(engine, new FakeScheduler());
  session.setSource(twoNoteSource());
  assert.equal(session.canSeekEvent(-1), false);
  assert.equal(session.canSeekEvent(1), true);
  session.seekEvent(1);
  assert.equal(session.getSnapshot().positionSeconds, 0.5);
  assert.equal(session.getSnapshot().location?.eventId, "n2");
  assert.equal(session.canSeekEvent(-1), true);
  assert.equal(session.canSeekEvent(1), false);
  session.seekEvent(-1);
  assert.equal(session.getSnapshot().positionSeconds, 0);
});

test("unsupported notation is unavailable without pretending the failure is a network problem", () => {
  const session = new PlaybackSession(new FakeEngine(), new FakeScheduler());
  session.setSource({ kind: "unsupported", projectionVersion: 1, documentId: "score", documentVersion: 1,
    code: "playback.voice-unsupported", message: "暂不支持多个声部" });
  assert.equal(session.getSnapshot().state, "unavailable");
  assert.equal(session.getSnapshot().diagnostic?.code, "playback.voice-unsupported");
});
