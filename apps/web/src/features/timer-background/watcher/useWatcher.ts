import { useEffect, useMemo, useRef, useState } from "react";

import type { DistractionTrigger } from "@/features/study-session/sessionState";
import { trackSessionSpaceMuted, trackSessionSpaceVolumeChanged } from "@/lib/amplitude";

import type { WatcherClip } from "./watcherClips";
import { useWatcherPresence } from "./useWatcherPresence";
import { createWatcherSound, readWatcherVolume, writeWatcherVolume } from "./watcherSound";
import { DEFAULT_WATCHER_TRIGGER_MS } from "./watcherTrigger";

/**
 * 감시 공간의 등장과 소리
 *
 * 세션 화면과 PC 홈이 같은 규칙으로 감독관을 들이고 소리를 낸다.
 * `trigger`는 지금 비집중 원인이고, 공부 중이 아니거나 비집중이 아니면 null이다.
 * 소리는 공부 중에만 깨우고, 음량은 기기에 저장해 다음 공부에도 이어진다.
 */
export function useWatcher(
  watchKey: string | null,
  trigger: DistractionTrigger | null,
  studying: boolean,
) {
  // 제출 중이나 제출 실패 안내처럼 공부가 끝난 뒤에는 감독관을 들이지 않고 소리도 내지 않는다.
  const watcher = useWatcherPresence(studying ? trigger : null, DEFAULT_WATCHER_TRIGGER_MS);
  // 감시 공간마다 소리가 달라 공간이 바뀌면 새로 만든다.
  // 소리 컨텍스트는 처음 깨울 때 생긴다.
  const watcherSound = useMemo(
    () => (watchKey === null ? null : createWatcherSound(watchKey)),
    [watchKey],
  );
  useEffect(() => {
    // 제출 실패나 종료 안내에서는 화면이 닫히지 않으므로 공부가 끝나는 순간 소리와 누름 구독을 푼다.
    if (!watcherSound || !studying) {
      watcherSound?.stopAll();
      return;
    }
    watcherSound.prime();
    // iOS는 사용자 누름 안에서 깨워야 이후 재생을 허락해서 누를 때마다 다시 깨운다.
    const unlock = () => watcherSound.prime();
    const silenceHidden = () => {
      if (document.hidden) watcherSound.stopAll();
    };
    window.addEventListener("pointerdown", unlock);
    document.addEventListener("visibilitychange", silenceHidden);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      document.removeEventListener("visibilitychange", silenceHidden);
    };
  }, [watcherSound, studying]);
  useEffect(() => () => watcherSound?.dispose(), [watcherSound]);
  useEffect(() => {
    if (!watcherSound) {
      return;
    }
    if (watcher.approaching && studying) {
      watcherSound.play("approach");
    } else if (!watcher.present) {
      watcherSound.fadeApproach();
    }
  }, [watcherSound, watcher.approaching, watcher.present, studying]);
  const [storedVolume] = useState(readWatcherVolume);
  const [level, setLevel] = useState(storedVolume.level);
  // 음소거를 풀 때 돌아갈 음량
  const lastLevelRef = useRef(storedVolume.last);
  useEffect(() => {
    watcherSound?.setVolume(level / 100);
  }, [level, watcherSound]);
  function commitLevel(next: number) {
    if (next > 0) {
      lastLevelRef.current = next;
    }
    writeWatcherVolume(next);
    trackSessionSpaceVolumeChanged({ volume: next });
  }
  function toggleMute() {
    const next = level > 0 ? 0 : lastLevelRef.current;
    setLevel(next);
    writeWatcherVolume(next);
    trackSessionSpaceMuted({ muted: next === 0 });
  }
  function onClipPlaying(clip: WatcherClip, at: number) {
    if (studying && (clip === "enter" || clip === "exit")) watcherSound?.play(clip, at);
  }
  return { present: watcher.present, onClipPlaying, level, setLevel, commitLevel, toggleMute };
}

export type WatcherControls = ReturnType<typeof useWatcher>;
