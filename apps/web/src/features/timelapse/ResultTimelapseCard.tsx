import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownToLine, Share } from "lucide-react";
import { type ReactNode, useEffect, useEffectEvent, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { daysUntil, formatDday } from "@/features/home/ddayFormat";
import { ddayQuery } from "@/lib/ddayQueries";
import { streakQuery } from "@/lib/statsQueries";
import { showCtaToast } from "@/lib/toast";

import { flowSegmentsFor, overlayTextFor } from "./timelapseFrame";
import { TimelapsePlayer } from "./TimelapsePlayer";
import {
  timelapsePhotosQuery,
  timelapseVideoProgressQuery,
  timelapseVideoQuery,
} from "./timelapseQueries";
import {
  openTimelapseSettings,
  sendTimelapse,
  type ShareNotice,
  shareResultNotice,
  shareRoutes,
} from "./timelapseShare";
import { StatusText, TextButton, TimelapseShareDialog } from "./TimelapseShareDialog";
import { getTimelapseStore, type TimelapseAnnotation, type TimelapseStore } from "./timelapseStore";

const RECORDING_POLL_MS = 500;
const RECORDING_POLL_LIMIT = 60;

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
    // 정리가 실패해 끝나지 않을 수도 있어 30초가 지나면 그만 읽는다.
    refetchInterval: (query) =>
      query.state.data?.status === "recording" && query.state.dataUpdateCount < RECORDING_POLL_LIMIT
        ? RECORDING_POLL_MS
        : false,
  });
  const ready = record.data?.status === "ready" ? record.data : null;
  const photos = useQuery({
    ...timelapsePhotosQuery(startedAtMs, store),
    enabled: ready !== null,
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

  const queryClient = useQueryClient();
  // 앱과 브라우저 기능은 이 화면에 있는 동안 바뀌지 않는다.
  const [routes] = useState(shareRoutes);
  const shareAvailable = routes.save !== null || routes.share !== null;
  // 두 값을 남긴 뒤에만 공유 창을 연다.
  // 저장이나 공유를 할 수 있는 환경이면 영상 미리 받기도 이때 시작한다.
  const [shareable, setShareable] = useState(false);
  const [sharing, setSharing] = useState(false);
  // 영상에는 그날 D-Day와 연속 공부가 들어가고 다시 만들지 않으므로 두 값을 남긴 뒤에 만든다.
  // 오프라인으로 멈춘 조회는 기다리지 않고 레코드에 남은 값으로 만든다.
  const overlaySettled =
    userId === null ||
    (!(dday.isPending && dday.fetchStatus !== "paused") &&
      !(streak.isPending && streak.fetchStatus !== "paused"));
  useEffect(() => {
    if (ready === null || (!ddayFetched && !streakFetched && !overlaySettled)) {
      return;
    }
    const patch: TimelapseAnnotation = {
      ...(ddayFetched ? { ddayLabel } : {}),
      ...(streakFetched ? { streakDays } : {}),
    };
    // 화면을 떠났거나 값이 바뀌어 다시 남기는 중이면 이번 기록 뒤에는 만들지 않는다.
    let current = true;
    // 기록하지 못해도 이번 재생에는 지장이 없다. 다음에 다시 볼 때 그 값이 빠질 뿐이다.
    void store
      .annotate(startedAtMs, patch)
      .catch(() => {})
      .then(() => {
        if (current && overlaySettled) {
          if (shareAvailable) {
            void queryClient.prefetchQuery(timelapseVideoQuery(startedAtMs, store));
          }
          setShareable(true);
        }
      });
    return () => {
      current = false;
    };
  }, [
    ready,
    overlaySettled,
    ddayFetched,
    streakFetched,
    ddayLabel,
    streakDays,
    store,
    startedAtMs,
    queryClient,
    shareAvailable,
  ]);

  // 위에서 미리 받기 시작한 영상을 같은 키로 구독해 다운로드 버튼에 진행률을 보인다.
  const video = useQuery({
    ...timelapseVideoQuery(startedAtMs, store),
    enabled: shareable && routes.save !== null,
  });
  const progress = useQuery(timelapseVideoProgressQuery(startedAtMs));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<ShareNotice | null>(null);
  const building = video.isFetching;
  const downloadLocked = !shareable || building || saving;

  const download = async () => {
    if (routes.save === null || downloadLocked) return;
    // 만들다 실패한 영상은 다시 누를 때 다시 만든다.
    if (!video.isSuccess) {
      setNotice(null);
      void video.refetch();
      return;
    }
    setSaving(true);
    setNotice(null);
    const result = await sendTimelapse({
      button: "save",
      route: routes.save,
      video: video.data,
      startedAtMs,
      entry: "result",
    });
    // 보내기는 오류도 결과로 돌려주므로 여기서 잠금을 풀면 성공과 실패 모두 풀린다.
    setSaving(false);
    const resultNotice = shareResultNotice("save", routes.save, result);
    // 앱 저장이 끝났다는 알림은 공유 창의 저장과 같이 토스트로 띄운다.
    if (routes.save === "native" && result === "saved" && resultNotice !== null) {
      showCtaToast(resultNotice.text);
      return;
    }
    setNotice(resultNotice);
  };

  const message: ReactNode =
    routes.save !== null && video.isError && !building ? (
      <StatusText>영상을 만들지 못했어요</StatusText>
    ) : notice !== null ? (
      <>
        <StatusText>{notice.text}</StatusText>
        {notice.openSettings === true && (
          <TextButton onClick={openTimelapseSettings}>설정 열기</TextButton>
        )}
      </>
    ) : null;

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

  const overlay = {
    info: ready.settings.info,
    text: overlayTextFor(ready, { ddayLabel, streakDays }),
    flow: flowSegmentsFor(ready),
  };

  return (
    <Card ref={cardRef} className="shadow-sb-card pt-4 pb-[18px]">
      <CardHeader className="justify-start gap-1.5">
        <CardTitle>타임랩스</CardTitle>
        <InfoTooltip label="타임랩스 안내">
          타임랩스 촬영은 설정에서 언제든 끌 수 있어요
        </InfoTooltip>
      </CardHeader>
      <div className="mt-4 flex justify-center px-4">
        <TimelapsePlayer aspect={ready.settings.aspect} photos={photos.data} overlay={overlay} />
      </div>
      {/* 공유하기는 초대코드 공유 화면의 공유하기 버튼과 같은 모양이다.
          다운로드는 흰 카드 위에서 경계가 보이도록 가는 외곽선으로 둔다. */}
      <div className="mt-4 flex justify-center gap-2.5 px-4">
        {routes.save !== null && (
          <Button
            variant="ghost"
            // disabled 속성을 쓰면 누른 버튼이 잠기는 순간 포커스가 문서 밖으로 빠진다.
            aria-disabled={downloadLocked}
            onClick={() => void download()}
            className="bg-transparent text-primary border border-primary/40 h-11 gap-1.5 rounded-full px-5 tabular-nums aria-disabled:opacity-50"
          >
            <ArrowDownToLine size={18} aria-hidden="true" />
            {building ? `만드는 중 ${Math.round((progress.data ?? 0) * 100)}%` : "다운로드"}
          </Button>
        )}
        <Button
          variant="subtle"
          aria-haspopup="dialog"
          aria-label="타임랩스 공유하기"
          disabled={!shareable}
          onClick={() => setSharing(true)}
          className="h-11 gap-1.5 rounded-full px-5"
        >
          <Share size={18} aria-hidden="true" />
          공유하기
        </Button>
      </div>
      <div role="status" className="flex items-center justify-center gap-1 px-4 not-empty:mt-2">
        {message}
      </div>
      <TimelapseShareDialog
        open={sharing}
        onOpenChange={setSharing}
        record={ready}
        overlay={overlay}
        entry="result"
        store={store}
      />
    </Card>
  );
}
