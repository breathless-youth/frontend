import { useQuery } from "@tanstack/react-query";

import { jpegDataUrl, REPLAY_BLOCKED } from "@/lib/jpegDataUrl";
import { cn } from "@/lib/utils";

import type { TimelapseRecord, TimelapseStore } from "./timelapseStore";

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
      return bytes === null ? null : await jpegDataUrl(bytes);
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
