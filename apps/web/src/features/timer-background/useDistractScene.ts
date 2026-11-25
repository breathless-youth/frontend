import { useEffect, useEffectEvent, useMemo, useState } from "react";

import type { DistractionTrigger } from "@/features/study-session/sessionState";
import { trackSpaceDistractSceneEntered, trackSpaceDistractSceneLeft } from "@/lib/amplitude";

import { createLoopSound, type LoopSound } from "./loopSound";
import { distractSoundUrl } from "./spaceFiles";
import type { DistractScene, SpaceScenes } from "./spaceManifest";
import { loadCachedScenes, useLoopSound, useSpaceScenes } from "./useSpaceLoopSound";
import { useWatcherPresence } from "./watcher/useWatcherPresence";
import { type CueSound, createCueSound, type SpaceCue } from "./watcher/watcherSound";
import type { WatcherTriggerMs } from "./watcher/watcherTrigger";

interface Options {
  loadScenes?: (assetKey: string) => Promise<SpaceScenes>;
  createSound?: (url: string) => LoopSound;
  createCues?: (urls: Partial<Record<SpaceCue, string>>) => CueSound;
}

const defaultOptions: Required<Options> = {
  loadScenes: loadCachedScenes,
  createSound: (url) => createLoopSound(url),
  createCues: (urls) => createCueSound(urls),
};

export interface DistractSceneState {
  /**
   * 지금 공간의 비집중 장면
   * 없거나 매니페스트를 받는 중이면 null이다.
   */
  readonly scene: DistractScene | null;
  /**
   * 이 공간에서 딴짓이 한 번이라도 시작됐는가
   * 참이 된 뒤로 비집중 화면과 반복 소리를 받아 둔다.
   */
  readonly armed: boolean;
  /** 비집중 장면을 보이는 중인가 */
  readonly present: boolean;
  /**
   * 예고하는 동안 장면이 바뀔 때까지 남은 시간(ms)
   * 화면을 이 시간에 걸쳐 서서히 드러낸다. 예고하지 않는 동안은 null이다.
   */
  readonly approachMs: number | null;
  /** 집중 반복 소리에 곱할 크기(0~1) */
  readonly focusLevel: number;
  /** 비집중 장면이 낼 소리가 있는가 */
  readonly hasSound: boolean;
}

/**
 * 반복 영상 공간의 비집중 장면
 *
 * 매니페스트에 비집중 장면이 있는 공간에서만 돈다.
 * 언제 바뀌는지는 감독관과 같은 시간 계산을 매니페스트의 시간으로 돌려 정한다.
 * 신호·예고 소리는 공부를 시작할 때 받아 두어야 첫 예고 전에 길이를 알 수 있다.
 * 비집중 반복 소리는 돌아온 뒤에도 0 크기로 돌려 두어 다음에 1초 동안 키울 수 있게 한다.
 */
export function useDistractScene(
  input: {
    /** 공부 중인 반복 영상 공간이고, 아니면 null이다. */
    readonly assetKey: string | null;
    /** 계측에 싣는 상품 코드 */
    readonly itemCode: string | null;
    /** 지금 비집중 원인이고, 비집중이 아니면 null이다. */
    readonly trigger: DistractionTrigger | null;
    /** 일시정지가 아닌가 */
    readonly active: boolean;
    /** 공간 음량(0~100) */
    readonly volume: number;
  },
  options: Options = {},
): DistractSceneState {
  const { assetKey, itemCode, trigger, active, volume } = input;
  // 받아 오는 함수는 시험에서만 바꿔 끼워서 처음 값으로 고정한다.
  const [{ loadScenes, createSound, createCues }] = useState(() => ({
    ...defaultOptions,
    ...options,
  }));
  const scenes = useSpaceScenes(assetKey, loadScenes);
  const scene = scenes?.distract ?? null;
  const sceneKey = scene === null ? null : assetKey;

  const afterMs = scenes?.timing.distractAfterMs ?? 0;
  const thresholds = useMemo<WatcherTriggerMs>(
    () => ({
      AWAY: afterMs,
      PHONE: afterMs,
      DEVICE: afterMs,
      SLEEP: afterMs,
      SCREEN: afterMs,
      POSTURE: afterMs,
    }),
    [afterMs],
  );

  // 재생기는 만든 effect가 구독과 정리까지 맡아서, StrictMode가 effect를 다시 돌려도 정리한 재생기를 다시 쓰지 않는다.
  // 구독을 먼저 풀고 정리해서, 다음 렌더 전에 온 누름이 정리한 재생기를 깨우지 않는다.
  const [cueSound, setCueSound] = useState<CueSound | null>(null);
  useEffect(() => {
    if (sceneKey === null || scene === null || (!scene.cue && !scene.approach)) return;
    const sound = createCues({
      ...(scene.approach ? { approach: distractSoundUrl(sceneKey, "approach") } : {}),
      ...(scene.cue ? { cue: distractSoundUrl(sceneKey, "cue") } : {}),
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 재생기는 외부 자원이라 effect에서 만들고 정리한다
    setCueSound(sound);
    sound.prime();
    // iOS는 사용자 누름 안에서 깨워야 이후 재생을 허락해서 누를 때마다 다시 깨운다.
    const unlock = () => sound.prime();
    const silenceHidden = () => {
      if (document.hidden) sound.stopAll();
    };
    window.addEventListener("pointerdown", unlock);
    document.addEventListener("visibilitychange", silenceHidden);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      document.removeEventListener("visibilitychange", silenceHidden);
      sound.dispose();
      setCueSound((current) => (current === sound ? null : current));
    };
  }, [sceneKey, scene, createCues]);
  useEffect(() => {
    cueSound?.setVolume(volume / 100);
  }, [cueSound, volume]);

  // 예고 소리는 장면이 바뀌는 순간에 끝나야 해서 받은 소리의 길이만큼 앞서 튼다.
  const [lead, setLead] = useState<{ sound: CueSound; ms: number } | null>(null);
  useEffect(() => {
    if (!cueSound) return;
    let cancelled = false;
    void cueSound.durationSec("approach").then((sec) => {
      if (!cancelled && sec !== null) setLead({ sound: cueSound, ms: Math.round(sec * 1000) });
    });
    return () => {
      cancelled = true;
    };
  }, [cueSound]);
  const approachLeadMs = lead !== null && lead.sound === cueSound ? lead.ms : 0;

  const { present, approaching, approachLateMs } = useWatcherPresence(
    scene === null ? null : trigger,
    thresholds,
    // 장면이 없으면 0으로 넘겨 남은 등장 상태를 바로 지운다.
    // 같은 공간이 곧 돌아와도 기준 시간을 다시 잰다.
    { leaveMs: scene === null ? 0 : scenes?.timing.returnAfterMs, approachLeadMs },
  );
  useEffect(() => {
    if (!cueSound) return;
    // 예고 길이를 늦게 알아 늦게 시작하면 늦은 만큼 앞부분을 건너뛰어, 장면이 바뀌는 순간에 맞춰 끝나게 한다.
    if (approaching) cueSound.play("approach", (approachLateMs ?? 0) / 1000);
    else if (!present) cueSound.fadeApproach();
  }, [cueSound, approaching, approachLateMs, present]);

  // 공간이 빠지면 풀어서, 다시 돌아와도 새로 딴짓하기 전에는 비집중 파일을 받지 않는다.
  const [armedKey, setArmedKey] = useState<string | null>(null);
  if (sceneKey === null && armedKey !== null) setArmedKey(null);
  if (sceneKey !== null && trigger !== null && armedKey !== sceneKey) setArmedKey(sceneKey);
  const armed = sceneKey !== null && armedKey === sceneKey;
  const inScene = scene !== null && present;

  useLoopSound(
    armed && sceneKey !== null && scene?.loop === "own" ? distractSoundUrl(sceneKey, "loop") : null,
    active,
    volume,
    inScene ? 1 : 0,
    createSound,
  );

  const playCue = useEffectEvent(() => cueSound?.play("cue"));
  useEffect(() => {
    if (inScene) playCue();
  }, [inScene]);

  const enterScene = useEffectEvent((code: string): boolean => {
    if (trigger === null) return false;
    trackSpaceDistractSceneEntered({ itemCode: code, trigger });
    return true;
  });
  // 장면이 실제로 바뀔 때만 알리고, 비집중 장면인 채로 공부가 끝나도 떠난 것으로 알린다.
  useEffect(() => {
    if (!inScene || itemCode === null || !enterScene(itemCode)) return;
    const enteredAt = Date.now();
    return () =>
      trackSpaceDistractSceneLeft({
        itemCode,
        durationSec: Math.round((Date.now() - enteredAt) / 1000),
      });
  }, [inScene, itemCode]);

  return {
    scene,
    armed,
    present: inScene,
    approachMs: approaching ? Math.max(0, approachLeadMs - (approachLateMs ?? 0)) : null,
    focusLevel: inScene && scene.loop !== "keep" ? 0 : 1,
    hasSound: scene !== null && (scene.loop === "own" || scene.cue || scene.approach),
  };
}
