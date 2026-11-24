import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { queryClient } from "@/lib/queryClient";

import { createLoopSound, type LoopSound } from "./loopSound";
import { loopSoundUrl } from "./spaceFiles";
import { SILENT_SCENES, type SpaceScenes, spaceScenesQuery } from "./spaceManifest";

interface Options {
  loadScenes?: (assetKey: string) => Promise<SpaceScenes>;
  createSound?: (url: string) => LoopSound;
}

const defaultOptions: Required<Options> = {
  loadScenes: (assetKey) => queryClient.fetchQuery(spaceScenesQuery(assetKey)),
  createSound: (url) => createLoopSound(url),
};

function subscribeVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

/**
 * 반복 공간의 소리
 *
 * 매니페스트에 소리가 있는 공간만 소리 파일을 받고, 공부 중이면서 화면이 보이는 동안만 튼다.
 * 소리가 있는지 돌려줘서 공간 페이지가 볼륨 막대를 켤지 정한다.
 *
 * @param assetKey 적용한 반복 공간. 반복 공간이 아니면 null이다.
 * @param active 공부 중이고 일시정지가 아닌가
 * @param volume 공간 음량(0~100)
 */
export function useSpaceLoopSound(
  assetKey: string | null,
  active: boolean,
  volume: number,
  options: Options = {},
): boolean {
  // 받아 오는 함수는 시험에서만 바꿔 끼워서 처음 값으로 고정한다.
  const [{ loadScenes, createSound }] = useState(() => ({ ...defaultOptions, ...options }));
  const [loaded, setLoaded] = useState<{ assetKey: string; scenes: SpaceScenes } | null>(null);

  useEffect(() => {
    if (assetKey === null) return;
    let cancelled = false;
    // 받지 못하면 이번에는 소리 없는 공간으로 두고, 다음에 공간을 적용할 때 다시 받는다.
    void loadScenes(assetKey).then(
      (scenes) => {
        if (!cancelled) setLoaded({ assetKey, scenes });
      },
      () => {
        if (!cancelled) setLoaded({ assetKey, scenes: SILENT_SCENES });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [assetKey, loadScenes]);

  const hasSound =
    assetKey !== null && loaded?.assetKey === assetKey && loaded.scenes.focus.loopSound;
  const sound = useMemo(
    () => (hasSound && assetKey !== null ? createSound(loopSoundUrl(assetKey)) : null),
    [hasSound, assetKey, createSound],
  );
  useEffect(() => () => sound?.dispose(), [sound]);

  const visible = useSyncExternalStore(subscribeVisibility, () => !document.hidden);
  // 새 재생기가 기본 음량으로 잠깐 소리를 내지 않게 음량을 먼저 넘긴 뒤 켠다.
  useEffect(() => {
    sound?.setVolume(volume / 100);
  }, [sound, volume]);
  useEffect(() => {
    sound?.setActive(active && visible);
  }, [sound, active, visible]);

  useEffect(() => {
    if (!sound) return;
    if (active) sound.prime();
    // iOS는 사용자 누름 안에서 깨워야 이후 재생을 허락한다.
    // 멈춘 동안에도 구독해야 재개를 누르는 그 동작 안에서 깨울 수 있다.
    const unlock = () => sound.prime();
    window.addEventListener("pointerdown", unlock);
    return () => window.removeEventListener("pointerdown", unlock);
  }, [sound, active]);

  return hasSound;
}
