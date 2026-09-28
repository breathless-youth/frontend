import { useCallback, useEffect, useRef, useState } from "react";

import { trackAmbientSoundChanged, trackAmbientSoundDuckToggled } from "@/lib/amplitude";

import type { SessionState } from "@/features/study-session/sessionState";
import type { StudyRoomPhase } from "@/features/study-session/useStudyRoomSession";

import type { AmbientPlayer } from "./ambientPlayer";
import { createWebAudioPlayer } from "./ambientPlayer";
import type { AmbientSoundSettings } from "./ambientSoundStore";
import { loadAmbientSoundSettings, saveAmbientSoundSettings } from "./ambientSoundStore";
import type { AmbientUsage } from "./ambientUsage";
import type { AmbientSound, SoundId } from "./catalog";
import { DEFAULT_LEVEL, loadCatalog } from "./catalog";
import type { Mix } from "./mix";
import { activeIds, setLevel } from "./mix";

export type AmbientChangeSource = "dialog" | "auto_start";

export type UseAmbientSoundOptions = {
  readonly sessionState: SessionState;
  readonly phase: StudyRoomPhase;
  /** 재생 누적 시간 - 호출부가 만들어 세션 훅의 `ambientUsage`에도 같은 것을 넘긴다. */
  readonly usage: AmbientUsage;
  /** [테스트 주입용] 없으면 카탈로그 로드 뒤 Web Audio 플레이어를 만든다. */
  readonly player?: AmbientPlayer;
  /** [테스트 주입용] 없으면 `/sounds/catalog.json`을 받는다. */
  readonly catalog?: readonly AmbientSound[];
};

const EMPTY_CATALOG: readonly AmbientSound[] = [];

function pick(mix: Mix, ids: readonly SoundId[]): Mix {
  const picked: Record<SoundId, number> = {};
  for (const id of ids) picked[id] = mix[id] as number;
  return picked;
}

/**
 * 세션 상태를 플레이어 명령으로 옮기고, 시트 조작을 믹스 변경·저장·계측으로 잇는다.
 * 계산은 `mix.ts`·`ambientUsage.ts`가 하고 여기는 배선만 한다.
 */
export function useAmbientSound(options: UseAmbientSoundOptions) {
  const { sessionState, phase, usage } = options;
  const studying = phase.name === "studying";
  const paused = sessionState.kind === "PAUSE";
  const distracted = sessionState.kind === "DISTRACTION";

  const [catalog, setCatalog] = useState<readonly AmbientSound[]>(options.catalog ?? EMPTY_CATALOG);
  const [settings, setSettings] = useState<AmbientSoundSettings | null>(null);
  const [blocked, setBlocked] = useState(false);

  const playerRef = useRef<AmbientPlayer | null>(options.player ?? null);
  // 콜백이 저장 상태를 동기적으로 읽어야 해서 state 를 거울처럼 따라간다.
  const settingsRef = useRef<AmbientSoundSettings | null>(null);
  // 아이콘으로 껐다 켤 때 돌려줄 음량. 세션 안에서만 기억하면 되므로 저장하지 않는다.
  const lastLevelRef = useRef<Record<SoundId, number>>({});
  const studyingRef = useRef(studying);
  studyingRef.current = studying;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const syncAfterCommand = useCallback(
    (player: AmbientPlayer) => {
      if (player.getState() === "playing") usage.start();
      else usage.stop();
      setBlocked(player.getState() === "blocked");
    },
    [usage],
  );

  // 카탈로그 로드 효과가 이 함수를 의존성으로 들면 usage 가 바뀔 때마다 다시 불러오고
  // 자동 시작이 한 번 더 난다. 거울 ref 로 최신 것만 읽는다.
  const syncRef = useRef(syncAfterCommand);
  syncRef.current = syncAfterCommand;

  const commit = useCallback((next: AmbientSoundSettings) => {
    settingsRef.current = next;
    setSettings(next);
    void saveAmbientSoundSettings(next);
  }, []);

  const applyMix = useCallback(
    async (mix: Mix) => {
      const player = playerRef.current;
      if (!player || !studyingRef.current) return;
      const { failed } = await player.applyMix(mix);
      if (!studyingRef.current) return;
      // 일시정지 중 컨텍스트가 새로 생기면 running 으로 뜬다 — 멈춘 세션에서 소리가 나면 안 된다.
      if (pausedRef.current && player.getState() !== "suspended") await player.suspend();
      syncAfterCommand(player);
      const current = settingsRef.current;
      if (failed.length > 0 && current) {
        const pruned = pick(
          current.mix,
          Object.keys(current.mix).filter((id) => !failed.includes(id)),
        );
        if (Object.keys(pruned).length !== Object.keys(current.mix).length) {
          commit({ ...current, mix: pruned });
        }
      }
    },
    [commit, syncAfterCommand],
  );

  /** 믹스 변경의 단일 통로 — 켜고 끄는 변화만 이벤트로 남기고 레벨만 바뀌면 보내지 않는다. */
  const changeMix = useCallback(
    (next: Mix, source: AmbientChangeSource) => {
      const current = settingsRef.current;
      if (!current || next === current.mix) return;
      commit({ ...current, mix: next });
      void applyMix(next);
      const before = activeIds(current.mix, catalog);
      const after = activeIds(next, catalog);
      if (before.join(",") !== after.join(",")) {
        trackAmbientSoundChanged({ sounds: after, source });
      }
    },
    [applyMix, catalog, commit],
  );

  // 주입 카탈로그는 안정된 참조여야 한다 — 바뀌면 다시 불러와 자동 시작이 한 번 더 난다.
  const injectedCatalog = options.catalog;
  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      injectedCatalog ? Promise.resolve(injectedCatalog) : loadCatalog(),
      loadAmbientSoundSettings(),
    ]).then(([loadedCatalog, loaded]) => {
      if (cancelled) return;
      playerRef.current ??= createWebAudioPlayer({
        catalog: loadedCatalog,
        // 들리는 상태가 바뀌는 순간마다 계측을 맞춘다. applyMix 가 끝나기를 기다리면 느린
        // 파일 하나 때문에 이미 나는 소리의 시간이 빠지고, 통화로 멈춘 구간은 반대로 더해진다.
        onPlaybackChanged: () => {
          const player = playerRef.current;
          if (player) syncRef.current(player);
        },
      });
      // 카탈로그 밖 id 는 지우고, 지운 게 있으면 그 결과를 저장한다.
      // 카탈로그가 비어 있으면 로드 실패일 수 있으니 판단을 보류하고 저장값을 건드리지 않는다.
      const ids = activeIds(loaded.mix, loadedCatalog);
      const pruned = loadedCatalog.length > 0 && ids.length !== Object.keys(loaded.mix).length;
      const initial = pruned ? { ...loaded, mix: pick(loaded.mix, ids) } : loaded;
      setCatalog(loadedCatalog);
      settingsRef.current = initial;
      setSettings(initial);
      if (pruned) void saveAmbientSoundSettings(initial);
      if (ids.length === 0 || !studyingRef.current) return;
      // 자동 시작은 상태 반영 전에 명령을 내야 아래 일시정지 효과가 그 뒤에 온다.
      void applyMix(initial.mix);
      trackAmbientSoundChanged({ sounds: ids, source: "auto_start" });
    });
    return () => {
      cancelled = true;
    };
  }, [applyMix, injectedCatalog]);

  const ready = settings !== null;

  // 일시정지 ↔ 해제. 트리거만 바뀐 정지는 같은 정지라 다시 보내지 않는다.
  const lastPausedRef = useRef(false);
  useEffect(() => {
    const player = playerRef.current;
    if (!ready || !studying || !player || lastPausedRef.current === paused) return;
    lastPausedRef.current = paused;
    // 자동 시작이 이미 멈춰 둔 플레이어에 suspend 를 겹쳐 보내지 않는다.
    const settled = paused
      ? player.getState() === "suspended"
        ? Promise.resolve()
        : player.suspend()
      : player.resume();
    // 컨텍스트 상태는 명령이 settle 된 뒤에야 바뀌므로 그 전에 읽으면 직전 상태를 센다.
    void settled.then(() => syncAfterCommand(player));
  }, [paused, ready, studying, syncAfterCommand]);

  // 비집중 음량 낮춤. 마스터 게인 하나만 오가므로 값이 바뀔 때만 보낸다.
  const duckEnabled = settings?.duckEnabled ?? true;
  const ducked = distracted && duckEnabled;
  const lastDuckedRef = useRef(false);
  useEffect(() => {
    const player = playerRef.current;
    if (!ready || !studying || !player || lastDuckedRef.current === ducked) return;
    lastDuckedRef.current = ducked;
    player.setDucked(ducked);
  }, [ducked, ready, studying]);

  // 세션 종료·화면 이탈에 정지. 플레이어는 세션당 하나라 되살리지 않는다.
  useEffect(() => {
    if (!studying) return;
    return () => {
      playerRef.current?.dispose();
      usage.stop();
    };
  }, [studying, usage]);

  const changeLevel = useCallback(
    (id: SoundId, level: number) => {
      const current = settingsRef.current;
      if (!current) return;
      // 0 으로 내리는 것도 끄는 것이라, 사라지기 직전의 음량을 저장해 둬야 아이콘으로 다시
      // 켤 때 그 값으로 돌아온다. 저장하지 않으면 기본값 60 으로 튄다.
      const remembered = level > 0 ? level : current.mix[id];
      if (remembered !== undefined && remembered > 0) lastLevelRef.current[id] = remembered;
      changeMix(setLevel(current.mix, id, level), "dialog");
    },
    [changeMix],
  );

  /** 아이콘 탭 - 켜진 소리는 0으로 내리고, 꺼진 소리는 마지막으로 듣던 음량으로 되돌린다. */
  const toggleSound = useCallback(
    (id: SoundId) => {
      const current = settingsRef.current;
      if (!current) return;
      const level = current.mix[id];
      if (level !== undefined) {
        lastLevelRef.current[id] = level;
        changeMix(setLevel(current.mix, id, 0), "dialog");
        return;
      }
      changeMix(setLevel(current.mix, id, lastLevelRef.current[id] ?? DEFAULT_LEVEL), "dialog");
    },
    [changeMix],
  );

  const setDuckEnabled = useCallback(
    (enabled: boolean) => {
      const current = settingsRef.current;
      if (!current || current.duckEnabled === enabled) return;
      commit({ ...current, duckEnabled: enabled });
      trackAmbientSoundDuckToggled(enabled);
    },
    [commit],
  );

  const mix = settings?.mix ?? {};
  return {
    mix,
    catalog,
    duckEnabled,
    isOn: Object.keys(mix).length > 0,
    /** 자동재생 정책에 막혀 컨텍스트가 못 살아난 상태 — 다음 조작에서 다시 시도된다. */
    blocked,
    changeLevel,
    toggleSound,
    setDuckEnabled,
  };
}
