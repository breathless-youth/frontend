import { queryOptions, skipToken } from "@tanstack/react-query";

import { trackTimelapseVideoCreated, trackTimelapseVideoFailed } from "@/lib/amplitude";

import type { TimelapseStore } from "./timelapseStore";
import { buildTimelapseVideo, TimelapseVideoError } from "./timelapseVideo";

/** 홈 목록과 전체 목록이 함께 쓰는 키. 둘 다 홈 탭 웹뷰 안이라 캐시도 같다. */
export const recentTimelapsesKey = ["timelapse", "recent"] as const;

/** 보관 중인 타임랩스를 최신부터 읽는다. */
export function recentTimelapsesQuery(store: TimelapseStore) {
  return queryOptions({
    queryKey: recentTimelapsesKey,
    queryFn: async () => {
      // 세션을 오래 안 하면 지울 기회가 없어 목록을 열 때도 보관 기한을 적용한다.
      // 정리는 부가 동작이라 실패해도 목록은 읽는다.
      await store.sweep(Date.now()).catch(() => {});
      return await store.listReady();
    },
  });
}

/**
 * 재생할 사진 바이트
 *
 * 결과 카드와 공유 다이얼로그가 같은 키를 써 결과 화면에서는 다시 읽지 않는다.
 * 기기 안 저장소만 읽으므로 오프라인에서도 읽는다.
 */
export function timelapsePhotosQuery(startedAtMs: number, store: TimelapseStore) {
  return queryOptions({
    queryKey: ["timelapse", startedAtMs, "photos"] as const,
    queryFn: async () => (await store.listPhotos(startedAtMs)).map((photo) => photo.bytes),
    staleTime: Infinity,
    // 사진 바이트가 15MB쯤이라 화면을 떠나면 캐시에 남기지 않는다.
    gcTime: 0,
    networkMode: "always",
  });
}

/**
 * 영상과 진행률 캐시를 남겨 두는 시간
 *
 * 영상은 저장소에 사본이 있어 금방 다시 읽으므로 닫았다 바로 다시 열 때 만드는 중 덮개가 깜빡이지 않을 만큼만 둔다.
 * 진행률도 같이 비워야 다시 열 때 덮개 막대가 앞 만들기의 값으로 보이지 않는다.
 */
const VIDEO_GC_MS = 30_000;

export function timelapseVideoKey(startedAtMs: number) {
  return ["timelapse", startedAtMs, "video"] as const;
}

/** 만드는 중 진행률(0~1). 공유 다이얼로그가 읽는다. */
export function timelapseVideoProgressKey(startedAtMs: number) {
  return ["timelapse", startedAtMs, "video-progress"] as const;
}

/**
 * 영상 만드는 진행률 구독
 *
 * 값은 영상 쿼리가 만드는 동안 넣으므로 이 쿼리는 직접 읽지 않는다.
 */
export function timelapseVideoProgressQuery(startedAtMs: number) {
  return queryOptions<number>({
    queryKey: timelapseVideoProgressKey(startedAtMs),
    queryFn: skipToken,
    staleTime: Infinity,
    gcTime: VIDEO_GC_MS,
  });
}

/**
 * 공유·저장용 영상 파일
 *
 * 보관된 영상이 있으면 그대로 주고, 없으면 한 번 만들어 보관한다.
 * 결과 화면이 미리 받아 두고 공유 다이얼로그가 같은 키로 꺼내므로 동시에 불러도 한 번만 만든다.
 */
export function timelapseVideoQuery(
  startedAtMs: number,
  store: TimelapseStore,
  build = buildTimelapseVideo,
) {
  return queryOptions({
    queryKey: timelapseVideoKey(startedAtMs),
    queryFn: async ({ client }) => {
      const saved = await store.getVideo(startedAtMs);
      if (saved !== null) {
        return new Blob([saved.bytes], { type: saved.mimeType });
      }
      // 앞 시도의 진행률이 남아 막대가 중간에서 시작하지 않게 비운다.
      client.setQueryData(timelapseVideoProgressKey(startedAtMs), 0);
      const startedAt = performance.now();
      const video = await build(startedAtMs, store, (progress) => {
        client.setQueryData(timelapseVideoProgressKey(startedAtMs), progress);
      }).catch((error: unknown) => {
        if (error instanceof TimelapseVideoError) {
          trackTimelapseVideoFailed({ method: error.method, stage: error.stage });
        }
        throw error;
      });
      trackTimelapseVideoCreated({
        method: video.method,
        durationMs: Math.round(performance.now() - startedAt),
        bytes: video.bytes.byteLength,
        frames: video.frames,
        aspect: video.aspect,
      });
      // 보관에 실패해도 이번 공유에는 쓸 수 있다. 다음에 다시 만들 뿐이다.
      await store
        .putVideo({ startedAtMs, bytes: video.bytes, mimeType: video.mimeType })
        .catch(() => trackTimelapseVideoFailed({ method: video.method, stage: "store" }));
      return new Blob([video.bytes], { type: video.mimeType });
    },
    staleTime: Infinity,
    gcTime: VIDEO_GC_MS,
    // 녹화 방식은 30초쯤 걸려 실패를 자동으로 되풀이하지 않는다. 공유를 누를 때 다시 시도한다.
    retry: false,
    // 기기 안에서만 만들므로 비행기 모드에서도 만든다.
    networkMode: "always",
  });
}
