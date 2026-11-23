import { queryOptions } from "@tanstack/react-query";

import { manifestUrl } from "./spaceFiles";

/** 매니페스트 v2의 distract 필드인 비집중 장면 */
export interface DistractScene {
  /** null이면 화면은 집중 장면 그대로 둔다. */
  readonly visual: "video" | "image" | null;
  /** own은 비집중 반복 소리로 바꾸고, keep은 집중 소리를 그대로 두고, none은 끈다. */
  readonly loop: "own" | "keep" | "none";
  readonly cue: boolean;
  readonly approach: boolean;
}

/**
 * 공간의 장면
 *
 * 공간은 집중 장면과 비집중 장면으로 이뤄진다.
 * 비집중 장면이 없는 공간은 distract가 null이다.
 */
export interface SpaceScenes {
  readonly timing: { readonly distractAfterMs: number; readonly returnAfterMs: number };
  readonly focus: { readonly loopSound: boolean };
  readonly distract: DistractScene | null;
}

// 비집중 장면이 없는 공간도 같은 모양으로 읽으려고 감독관과 같은 시간을 기본으로 둔다.
const DEFAULT_TIMING = { distractAfterMs: 9_000, returnAfterMs: 3_000 };

export const SILENT_SCENES: SpaceScenes = {
  timing: DEFAULT_TIMING,
  focus: { loopSound: false },
  distract: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** 업로드 스크립트와 같은 범위의 정수 초만 받는다. */
function secondsToMs(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max
    ? value * 1000
    : null;
}

function parseV2(manifest: Record<string, unknown>): SpaceScenes {
  const { timing, focus, distract } = manifest;
  if (!isRecord(timing) || !isRecord(focus) || !isRecord(distract)) return SILENT_SCENES;
  const distractAfterMs = secondsToMs(timing.distractAfterSec, 3, 60);
  const returnAfterMs = secondsToMs(timing.returnAfterSec, 1, 30);
  const loopSound = focus.loop;
  const { visual, loop, cue, approach } = distract;
  if (
    distractAfterMs === null ||
    returnAfterMs === null ||
    // 업로드 스크립트는 반복 영상 공간에만 v2를 쓰므로 집중 화면은 영상뿐이다.
    focus.visual !== "video" ||
    typeof loopSound !== "boolean" ||
    !(visual === "video" || visual === "image" || visual === null) ||
    !(loop === "own" || loop === "keep" || loop === "none") ||
    typeof cue !== "boolean" ||
    typeof approach !== "boolean"
  ) {
    return SILENT_SCENES;
  }
  return {
    timing: { distractAfterMs, returnAfterMs },
    focus: { loopSound },
    distract: { visual, loop, cue, approach },
  };
}

/**
 * 매니페스트를 장면으로 바꾸기
 *
 * 모르는 version이나 형식은 예전 규칙인 소리 없는 공간으로 읽는다.
 * 공간을 웹 배포보다 먼저 올려도 깨지지 않게 하려는 것이다.
 * 모르는 필드는 무시해서 다음 단계에서 필드가 늘어도 v2를 읽을 수 있다.
 */
export function parseSpaceManifest(value: unknown): SpaceScenes {
  if (!isRecord(value)) return SILENT_SCENES;
  if (value.version === 2) return parseV2(value);
  if (value.version !== 1 || typeof value.sound !== "boolean") return SILENT_SCENES;
  return { ...SILENT_SCENES, focus: { loopSound: value.sound } };
}

/**
 * 매니페스트 받기
 *
 * 없는 파일(4xx)과 읽을 수 없는 내용은 소리 없는 공간으로 돌려준다.
 * 네트워크 오류와 서버 오류(5xx)는 잠깐의 실패라 throw해서, 쿼리 캐시에 소리 없음으로 남지 않게 한다.
 */
export async function loadSpaceScenes(
  assetKey: string,
  fetcher: (url: string) => Promise<Response> = (url) => fetch(url),
): Promise<SpaceScenes> {
  const response = await fetcher(manifestUrl(assetKey));
  if (response.status >= 500) throw new Error(`space manifest ${response.status}`);
  if (!response.ok) return SILENT_SCENES;
  try {
    return parseSpaceManifest(await response.json());
  } catch {
    return SILENT_SCENES;
  }
}

/** 폴더 이름에 내용 해시가 있어 같은 공간의 매니페스트는 바뀌지 않는다. */
export function spaceScenesQuery(assetKey: string) {
  return queryOptions({
    queryKey: ["timer-background", "scenes", assetKey] as const,
    queryFn: () => loadSpaceScenes(assetKey),
    staleTime: Infinity,
  });
}
