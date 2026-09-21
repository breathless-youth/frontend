import type { SessionRecoveryResponse } from "@focusmakers/types";
import { History } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  WEEKDAY_LABELS,
  dayOfDateKey,
  formatDuration,
  formatKstClock,
  monthOfDateKey,
  weekdayIndexOfDateKey,
} from "@/features/records/recordsFormat";

/** `2026-08-27` → `8월 27일 (목)`. statDate가 한국 기준 날짜라 시간대 변환이 필요 없다. */
function recoveryDateLabel(dateKey: string): string {
  const { month } = monthOfDateKey(dateKey);
  return `${month}월 ${dayOfDateKey(dateKey)}일 (${WEEKDAY_LABELS[weekdayIndexOfDateKey(dateKey)]})`;
}

function InfoRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex w-full items-center justify-between py-[13px]">
      <span className="text-[13px] font-medium text-text-tertiary">{label}</span>
      <span
        className={
          accent
            ? "text-[14px] font-bold text-primary"
            : "text-[14px] font-semibold text-foreground"
        }
      >
        {value}
      </span>
    </div>
  );
}

/**
 * 앱을 새로 켰을 때 저장되지 않은 직전 공부 세션을 알려주는 모달
 */
export function SessionRecoveryDialog({
  recovered,
  onConfirm,
}: {
  recovered: SessionRecoveryResponse;
  onConfirm: () => void;
}) {
  return (
    <Dialog open>
      <DialogContent
        role="dialog"
        showCloseButton={false}
        // 확인 버튼으로만 닫는 강제 안내 모달이라 Escape·딤 탭·바깥 상호작용을 모두 막는다.
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        className="flex w-[calc(100%-2.5rem)] max-w-[320px] flex-col items-center gap-4 rounded-3xl border-0 bg-background px-[22px] pt-7 pb-[22px]"
      >
        <div className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          <History className="size-[30px]" strokeWidth={2.53} aria-hidden="true" />
        </div>
        <DialogTitle className="text-center text-[19px] leading-[23px] font-extrabold text-foreground">
          저장되지 않은 기록을 복구했어요
        </DialogTitle>
        <DialogDescription className="text-center text-[14px] leading-[1.45] font-medium text-muted-foreground">
          앱이 예기치 않게 종료되었어요.
          <br />
          공부 기록은 저장해 두었어요.
        </DialogDescription>
        <Card className="w-full px-4 py-0.5">
          <InfoRow label="날짜" value={recoveryDateLabel(recovered.statDate)} />
          <InfoRow
            label="시작 · 종료"
            value={`${formatKstClock(recovered.startedAt)} ~ ${formatKstClock(recovered.endedAt)}`}
          />
          <InfoRow label="총 공부시간" value={formatDuration(recovered.studySec)} />
          <InfoRow label="순공시간" value={formatDuration(recovered.focusSec)} accent />
        </Card>
        <Button
          type="button"
          autoFocus
          onClick={onConfirm}
          className="h-[52px] w-full shrink-0 rounded-[14px] text-[16px] font-semibold motion-reduce:transition-none"
        >
          확인
        </Button>
      </DialogContent>
    </Dialog>
  );
}
