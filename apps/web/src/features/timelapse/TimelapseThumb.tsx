import { useQuery } from "@tanstack/react-query";

import { cn } from "@/lib/utils";

import type { TimelapseRecord, TimelapseStore } from "./timelapseStore";

/** 썸네일 한 장은 수십 KB라 data URL로 들고 있어도 작고, Blob URL처럼 해제할 것이 없다. */
function toDataUrl(bytes: ArrayBuffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("썸네일을 읽지 못했어요"));
    reader.readAsDataURL(new Blob([bytes], { type: "image/jpeg" }));
  });
}

// 타임랩스 사진은 분석 도구로 보내지 않는다(ADR 0013). 카메라 화면과 같은 세션 리플레이 차단 표식이다.
const REPLAY_BLOCKED = "amp-block sentry-block";

/**
 * 타임랩스 썸네일
 *
 * 촬영 사진 중 가운데 한 장을 보여준다. 가로(16:9) 타임랩스는 같은 장면을 흐리게 키워 세로 틀의
 * 위아래를 채운다. 홈 목록 카드와 전체 목록 줄이 함께 쓴다.
 */
export function TimelapseThumb({
  record,
  store,
  className,
}: {
  record: TimelapseRecord;
  store: TimelapseStore;
  className?: string;
}) {
  const thumb = useQuery({
    queryKey: ["timelapse", record.startedAtMs, "thumb"],
    queryFn: async () => {
      const bytes = await store.middlePhoto(record.startedAtMs);
      return bytes === null ? null : await toDataUrl(bytes);
    },
    // 목록에 올라간 타임랩스의 사진은 바뀌지 않는다.
    staleTime: Infinity,
  });
  const src = thumb.data ?? null;

  return (
    <div className={cn("relative overflow-hidden bg-black", className)}>
      {src !== null &&
        (record.settings.aspect === "16:9" ? (
          <>
            <img
              src={src}
              alt=""
              className={cn(
                REPLAY_BLOCKED,
                "absolute inset-0 size-full scale-125 object-cover blur-[18px]",
              )}
            />
            <div className="absolute inset-0 bg-black/25" />
            <img
              src={src}
              alt=""
              className={cn(REPLAY_BLOCKED, "absolute inset-0 size-full object-contain")}
            />
          </>
        ) : (
          <img
            src={src}
            alt=""
            className={cn(REPLAY_BLOCKED, "absolute inset-0 size-full object-cover")}
          />
        ))}
    </div>
  );
}
