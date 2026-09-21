import type { SessionRecoveryResponse } from "@focusmakers/types";

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

function IconRecovery() {
  return (
    <svg width={32} height={32} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M5.86667 12.2667C6.89245 9.795 8.78911 7.78538 11.1974 6.61848C13.6056 5.45157 16.3582 5.20841 18.9337 5.93508C21.5092 6.66174 23.7288 8.30775 25.172 10.5613C26.6152 12.8149 27.1818 15.5195 26.7644 18.1628C26.347 20.8061 24.9747 23.2046 22.9074 24.9039C20.8401 26.6031 18.2213 27.4852 15.5472 27.383C12.8731 27.2807 10.3293 26.2013 8.39777 24.3492C6.46622 22.497 5.28101 20.0008 5.06667 17.3333"
        stroke="currentColor"
        strokeWidth="2.53333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4.53333 6.13333V12.2667H10.6667"
        stroke="currentColor"
        strokeWidth="2.53333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16 12.1333V16.9333L19.7333 19.2"
        stroke="currentColor"
        strokeWidth="2.53333"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function InfoRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex w-full items-center justify-between border-b border-border py-[13px] last:border-b-0">
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
          <IconRecovery />
        </div>
        <DialogTitle className="text-center text-[19px] leading-[23px] font-extrabold text-foreground">
          저장되지 않은 기록을 복구했어요
        </DialogTitle>
        <DialogDescription className="text-center text-[14px] leading-[1.45] font-medium text-muted-foreground">
          앱이 예기치 않게 종료되었어요.
          <br />
          공부 기록은 저장해 두었어요.
        </DialogDescription>
        <div className="w-full rounded-2xl bg-muted px-4 py-0.5">
          <InfoRow label="날짜" value={recoveryDateLabel(recovered.statDate)} />
          <InfoRow
            label="시작 · 종료"
            value={`${formatKstClock(recovered.startedAt)} ~ ${formatKstClock(recovered.endedAt)}`}
          />
          <InfoRow label="총 공부시간" value={formatDuration(recovered.studySec)} />
          <InfoRow label="순공시간" value={formatDuration(recovered.focusSec)} accent />
        </div>
        <button
          type="button"
          autoFocus
          onClick={onConfirm}
          className="h-[52px] w-full shrink-0 rounded-[14px] bg-primary text-[16px] font-semibold text-primary-foreground transition-opacity duration-200 active:opacity-90 motion-reduce:transition-none"
        >
          확인
        </button>
      </DialogContent>
    </Dialog>
  );
}
