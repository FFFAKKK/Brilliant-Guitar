import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { PlaybackSourceProjection } from "../contracts/playback.ts";
import { createPlaybackOutputRegistry } from "./playback-output.ts";
import { PlaybackSession } from "./playback-session.ts";
import type { PluginPlaybackOutputContribution } from "../plugins/plugin-sdk.ts";

export function usePlaybackSession(source: PlaybackSourceProjection | null,
  outputContributions: readonly PluginPlaybackOutputContribution[] = []) {
  const [outputs] = useState(() => createPlaybackOutputRegistry(outputContributions));
  const [session] = useState(() => new PlaybackSession(outputs.createEngine()));
  const outputSnapshot = useSyncExternalStore(outputs.subscribe, outputs.getSnapshot, outputs.getSnapshot);
  const activeOutputId = useRef(outputSnapshot.activeId);
  useEffect(() => { outputs.replacePluginOutputs(outputContributions); }, [outputContributions, outputs]);
  useEffect(() => {
    if (activeOutputId.current === outputSnapshot.activeId) return;
    activeOutputId.current = outputSnapshot.activeId;
    session.replaceEngine(outputs.createEngine());
  }, [outputSnapshot.activeId, outputs, session]);
  useEffect(() => { session.setSource(source); }, [session, source]);
  useEffect(() => () => session.dispose(), [session]);
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  return { session, snapshot, outputs, outputSnapshot } as const;
}
