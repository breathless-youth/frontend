import { queryOptions } from "@tanstack/react-query";

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

export function timelapseVideoKey(startedAtMs: number) {
  return ["timelapse", startedAtMs, "video"] as const;
}

/** 만드는 중 진행률(0~1). 공유 다이얼로그가 읽는다. */
export function timelapseVideoProgressKey(startedAtMs: number) {
  return ["timelapse", startedAtMs, "video-progress"] as const;
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
    // 녹화 방식은 30초쯤 걸려 실패를 자동으로 되풀이하지 않는다. 공유를 누를 때 다시 시도한다.
    retry: false,
  });
}
