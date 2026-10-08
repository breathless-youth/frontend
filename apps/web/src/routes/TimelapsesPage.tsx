import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { ScreenBackHeader } from "@/components/ScreenBackHeader";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toKoreanDurationLength } from "@/features/study-session/formatDuration";
import { TimelapsesEmpty } from "@/features/timelapse/TimelapsesEmpty";
import { timelapseRangeLabel, timelapseStartLabel } from "@/features/timelapse/recentDayLabel";
import { focusRatePercent } from "@/features/timelapse/timelapseFrame";
import { recentTimelapsesKey, recentTimelapsesQuery } from "@/features/timelapse/timelapseQueries";
import type { TimelapseRecord, TimelapseStore } from "@/features/timelapse/timelapseStore";
import { getTimelapseStore } from "@/features/timelapse/timelapseStore";
import { TimelapseThumb } from "@/features/timelapse/TimelapseThumb";
import { slideNavigate } from "@/lib/pageTransition";
import { showToast } from "@/lib/toast";
import { useDialogFocusRestore } from "@/lib/useDialogFocusRestore";

function TimelapseRow({
  record,
  store,
  onDelete,
}: {
  record: TimelapseRecord;
  store: TimelapseStore;
  onDelete: () => void;
}) {
  const studySec = record.summary?.studySec ?? 0;
  const focusSec = record.summary?.focusSec ?? 0;
  const endedAtMs = record.summary?.endedAtMs ?? record.startedAtMs;

  return (
    <li className="bg-muted shadow-sb-card flex gap-3.5 rounded-[20px] p-3">
      <TimelapseThumb
        record={record}
        store={store}
        className="h-[100px] w-14 shrink-0 rounded-[10px]"
      />
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="flex flex-col gap-1.5 py-1 pr-8">
          <p className="text-foreground text-lg leading-[21px] font-bold">
            순공 {toKoreanDurationLength(focusSec)}
          </p>
          <p className="text-muted-foreground text-sm leading-[17px]">
            총 공부 {toKoreanDurationLength(studySec)} · 집중률{" "}
            {focusRatePercent(studySec, focusSec)}%
          </p>
        </div>
        <p className="text-muted-foreground mt-auto self-end px-1 text-xs leading-[14px]">
          {timelapseRangeLabel(record.startedAtMs, endedAtMs)}
        </p>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`${timelapseStartLabel(record.startedAtMs)} 타임랩스 삭제`}
          data-delete-for={record.startedAtMs}
          className="text-feedback-danger absolute -top-2.5 -right-2.5 flex size-11 items-center justify-center"
        >
          <Trash2 size={18} aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}

/**
 * 타임랩스 전체 목록
 *
 * 홈 `더보기`로 홈 탭 웹뷰 안에서 열린다. 홈 목록과 같은 쿼리·캐시를 써서 여기서 지우면
 * 홈으로 돌아갔을 때도 이미 빠져 있다. 줄을 눌러 여는 공유 다이얼로그는 BY-889에서 붙인다.
 */
export function TimelapsesPage({ store = getTimelapseStore() }: { store?: TimelapseStore }) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const list = useQuery(recentTimelapsesQuery(store));
  const [pending, setPending] = useState<TimelapseRecord | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  // `open`으로만 여는 창이라 닫힌 뒤 누른 휴지통으로 포커스를 직접 돌려줘야 한다.
  const focusRestore = useDialogFocusRestore();
  const mainRef = useRef<HTMLElement>(null);
  // 지운 줄의 휴지통은 사라지므로 다음 줄의 휴지통(없으면 뒤로 가기)으로 포커스를 옮긴다.
  const focusAfterDeleteRef = useRef<number | "back" | null>(null);
  const remove = useMutation({
    mutationFn: (startedAtMs: number) => store.remove(startedAtMs),
    onSuccess: (_result, startedAtMs) => {
      const records = queryClient.getQueryData<TimelapseRecord[]>(recentTimelapsesKey) ?? [];
      const index = records.findIndex((record) => record.startedAtMs === startedAtMs);
      const neighbor = records[index + 1] ?? records[index - 1];
      focusAfterDeleteRef.current = neighbor?.startedAtMs ?? "back";
      queryClient.setQueryData<TimelapseRecord[]>(recentTimelapsesKey, (records) =>
        records?.filter((record) => record.startedAtMs !== startedAtMs),
      );
      // 그 타임랩스의 레코드·사진·썸네일 캐시도 함께 버린다.
      queryClient.removeQueries({ queryKey: ["timelapse", startedAtMs] });
    },
    onError: () => showToast("삭제하지 못했어요"),
    onSettled: () => setPending(null),
  });

  const goBack = () => {
    slideNavigate("back", () => {
      const historyState = window.history.state as { idx?: number } | null;
      if (historyState?.idx) {
        navigate(-1);
        return;
      }
      // 딥링크로 곧장 열렸다 — 이 화면을 여는 홈으로 돌려보낸다.
      navigate({ pathname: "/home", search: location.search }, { replace: true });
    });
  };

  return (
    <main ref={mainRef} className="theme-soft-blue bg-soft-blue text-foreground min-h-dvh pb-10">
      <ScreenBackHeader title="최근 타임랩스" onBack={goBack} />
      <div className="flex flex-col gap-4 px-5 pt-2">
        <p className="text-muted-foreground text-[13px] leading-4">
          최근 7일 동안 최대 7개까지 기기 내에 보관돼요
        </p>
        {list.isSuccess &&
          (list.data.length === 0 ? (
            <TimelapsesEmpty />
          ) : (
            <ul className="flex flex-col gap-3">
              {list.data.map((record) => (
                <TimelapseRow
                  key={record.startedAtMs}
                  record={record}
                  store={store}
                  onDelete={() => setPending(record)}
                />
              ))}
            </ul>
          ))}
      </div>

      <Dialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open && !remove.isPending) setPending(null);
        }}
      >
        <DialogContent
          role="alertdialog"
          showCloseButton={false}
          // 실수로 지우지 않게 되돌릴 수 있는 쪽에 먼저 포커스를 둔다.
          onOpenAutoFocus={(event) => {
            focusRestore.onOpenAutoFocus();
            event.preventDefault();
            cancelRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            const target = focusAfterDeleteRef.current;
            focusAfterDeleteRef.current = null;
            if (target === null) {
              focusRestore.onCloseAutoFocus(event);
              return;
            }
            event.preventDefault();
            const selector =
              target === "back"
                ? 'button[aria-label="뒤로 가기"]'
                : `[data-delete-for="${target}"]`;
            mainRef.current?.querySelector<HTMLElement>(selector)?.focus();
          }}
          // 앱의 다른 확인 창(카메라 켜기·세션 복구)과 같은 모양이다.
          className="theme-soft-blue bg-muted text-foreground w-[calc(100%-2.5rem)] max-w-[320px] gap-0 rounded-3xl border-0 px-[22px] pt-[26px] pb-[22px] sm:rounded-3xl"
        >
          <DialogHeader className="gap-1.5 space-y-0 text-left sm:text-left">
            <DialogTitle className="text-foreground text-[18px] leading-[23px] font-bold tracking-normal">
              타임랩스 삭제
            </DialogTitle>
            <DialogDescription className="text-foreground text-[16px] leading-[23px] font-medium">
              정말 삭제하시겠어요?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-5 flex-row gap-2 sm:space-x-0">
            <Button
              ref={cancelRef}
              variant="ghost"
              disabled={remove.isPending}
              onClick={() => setPending(null)}
              className="bg-bg-layer-2 text-foreground h-[52px] flex-1 rounded-lg text-[15px] font-semibold"
            >
              취소
            </Button>
            <Button
              disabled={remove.isPending}
              onClick={() => {
                if (pending !== null) remove.mutate(pending.startedAtMs);
              }}
              // 되돌릴 수 없는 동작이라 확인 버튼만 위험 색이다.
              className="bg-feedback-danger hover:bg-feedback-danger/90 h-[52px] flex-1 rounded-lg text-[15px] font-semibold text-white"
            >
              삭제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
