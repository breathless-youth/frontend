import { queryOptions } from "@tanstack/react-query";

import { manifestUrl } from "./spaceFiles";

/**
 * 공간의 장면
 *
 * 공간은 집중 장면과 비집중 장면으로 이뤄진다.
 * 지금은 집중 장면의 반복 소리만 읽고, 비집중 장면은 다음 단계에서 채운다.
 */
export interface SpaceScenes {
  readonly focus: { readonly loopSound: boolean };
  readonly distract: null;
}

export const SILENT_SCENES: SpaceScenes = { focus: { loopSound: false }, distract: null };

/**
 * 매니페스트를 장면으로 바꾸기
 *
 * 모르는 version이나 형식은 예전 규칙인 소리 없는 공간으로 읽는다.
 * 공간을 웹 배포보다 먼저 올려도 깨지지 않게 하려는 것이다.
 */
export function parseSpaceManifest(value: unknown): SpaceScenes {
  if (typeof value !== "object" || value === null) return SILENT_SCENES;
  const { version, sound } = value as { version?: unknown; sound?: unknown };
  if (version !== 1 || typeof sound !== "boolean") return SILENT_SCENES;
  return { focus: { loopSound: sound }, distract: null };
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
