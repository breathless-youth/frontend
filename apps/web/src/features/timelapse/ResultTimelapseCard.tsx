import { useQuery } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useRef } from "react";

import { Card } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { daysUntil, formatDday } from "@/features/home/ddayFormat";
import { ddayQuery } from "@/lib/ddayQueries";
import { streakQuery } from "@/lib/statsQueries";

import { flowSegmentsFor, overlayTextFor } from "./timelapseFrame";
import { TimelapsePlayer } from "./TimelapsePlayer";
import { getTimelapseStore, type TimelapseAnnotation, type TimelapseStore } from "./timelapseStore";

type ResultTimelapseCardProps = {
  startedAtMs: number;
  userId: number | null;
  store?: TimelapseStore;
  /** 카드가 처음 화면에 그려졌을 때 부른다. 결과 화면이 여기까지 스크롤한다. */
  onShown?: (element: HTMLElement) => void;
};

/**
 * 결과 화면 맨 아래 타임랩스 카드
 *
 * 켬·끔과 비율은 지금 설정이 아니라 이 타임랩스를 찍을 때 저장한 설정을 따른다.
 * D-Day와 연속 공부는 이 화면에서 받아 레코드에 남겨, 나중에 다시 볼 때도 그날 값으로 그린다.
 * 촬영 정리가 아직 끝나지 않았거나 사진이 없으면 카드를 그리지 않는다.
 */
export function ResultTimelapseCard({
  startedAtMs,
  userId,
  store = getTimelapseStore(),
  onShown,
}: ResultTimelapseCardProps) {
  const record = useQuery({
    queryKey: ["timelapse", startedAtMs],
    queryFn: () => store.get(startedAtMs),
    staleTime: Infinity,
    // 촬영 정리는 제출과 함께 시작해 결과 화면이 먼저 열릴 수 있다. 정리가 끝날 때까지만 다시 읽는다.
    refetchInterval: (query) => (query.state.data?.status === "recording" ? 500 : false),
  });
  const ready = record.data?.status === "ready" ? record.data : null;
  const photos = useQuery({
    queryKey: ["timelapse", startedAtMs, "photos"],
    queryFn: async () => (await store.listPhotos(startedAtMs)).map((photo) => photo.bytes),
    enabled: ready !== null,
    staleTime: Infinity,
    // 사진 바이트가 15MB쯤이라 화면을 떠나면 캐시에 남기지 않는다.
    gcTime: 0,
  });
  const dday = useQuery({ ...ddayQuery(userId ?? 0), enabled: ready !== null && userId !== null });
  const streak = useQuery({
    ...streakQuery(userId ?? 0),
    enabled: ready !== null && userId !== null,
  });

  // 신원이 없는 화면은 누구의 값인지 알 수 없어 레코드에 남은 값도 쓰지 않는다.
  // 조회가 실패했거나 아직이면 이 타임랩스에 남겨 둔 그날 값을 쓴다.
  const ddayLabel =
    userId === null
      ? null
      : dday.isSuccess
        ? dday.data === null
          ? null
          : `${formatDday(daysUntil(dday.data.targetDate))} · ${dday.data.title}`
        : (ready?.ddayLabel ?? null);
  const streakDays =
    userId === null ? null : streak.isSuccess ? streak.data.streak : (ready?.streakDays ?? null);
  const ddayFetched = dday.isSuccess;
  const streakFetched = streak.isSuccess;

  useEffect(() => {
    if (ready === null || (!ddayFetched && !streakFetched)) {
      return;
    }
    const patch: TimelapseAnnotation = {
      ...(ddayFetched ? { ddayLabel } : {}),
      ...(streakFetched ? { streakDays } : {}),
    };
    // 기록하지 못해도 이번 재생에는 지장이 없다. 다음에 다시 볼 때 그 값이 빠질 뿐이다.
    store.annotate(startedAtMs, patch).catch(() => {});
  }, [ready, ddayFetched, streakFetched, ddayLabel, streakDays, store, startedAtMs]);

  const cardRef = useRef<HTMLDivElement>(null);
  const visible = ready !== null && photos.isSuccess && photos.data.length > 0;
  const notifyShown = useEffectEvent((element: HTMLElement) => onShown?.(element));
  useEffect(() => {
    if (visible && cardRef.current !== null) {
      notifyShown(cardRef.current);
    }
  }, [visible]);

  if (!visible) {
    return null;
  }

  return (
    <Card
      ref={cardRef}
      className="shadow-sb-card flex flex-col items-center gap-5 px-[18px] pt-4 pb-[18px]"
    >
      <div className="flex w-full items-center gap-1">
        <InfoTooltip label="타임랩스 안내">타임랩스는 언제든 설정에서 끌 수 있어요</InfoTooltip>
        <p className="text-muted-foreground text-xs break-keep">
          이미지를 터치하여 타임랩스를 공유하거나 저장해보세요
        </p>
      </div>
      <TimelapsePlayer
        aspect={ready.settings.aspect}
        photos={photos.data}
        overlay={{
          info: ready.settings.info,
          text: overlayTextFor(ready, { ddayLabel, streakDays }),
          flow: flowSegmentsFor(ready),
        }}
      />
    </Card>
  );
}
