import type { SessionRecoveryResponse } from "@focusmakers/types";
import { History } from "lucide-react";
import { Fragment } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { formatDuration, formatKstClock } from "@/features/records/recordsFormat";
import i18n from "@/lib/i18n";

/**
 * `2026-08-27` → `8월 27일 (목)` / `Thu, Aug 27`. statDate는 한국 기준 달력 날짜라 UTC 자정으로 만들고 UTC로 읽는다.
 */
function recoveryDateLabel(dateKey: string): string {
  return new Intl.DateTimeFormat(i18n.language, {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    weekday: "short",
  }).format(new Date(`${dateKey}T00:00:00Z`));
}

function InfoRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex w-full items-center justify-between py-3.25">
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
  const { t } = useTranslation("study-session");
  return (
    <Dialog open>
      <DialogContent
        role="dialog"
        showCloseButton={false}
        // 확인 버튼으로만 닫는 강제 안내 모달이라 Escape·딤 탭·바깥 상호작용을 모두 막는다.
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        className="flex w-[calc(100%-2.5rem)] max-w-[320px] flex-col items-center gap-4 rounded-3xl border-0 bg-background px-5.5 pt-7 pb-5.5"
      >
        <div className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          <History className="size-7.5" strokeWidth={2.53} aria-hidden="true" />
        </div>
        <DialogTitle className="text-center text-[19px] leading-5.75 font-extrabold text-foreground">
          {t("recovery.title")}
        </DialogTitle>
        <DialogDescription className="text-center text-[14px] leading-[1.45] font-medium text-muted-foreground">
          {t("recovery.body")
            .split("\n")
            .map((line, index) => (
              <Fragment key={line}>
                {index > 0 && <br />}
                {line}
              </Fragment>
            ))}
        </DialogDescription>
        <Card className="w-full px-4 py-0.5">
          <InfoRow label={t("recovery.date")} value={recoveryDateLabel(recovered.statDate)} />
          <InfoRow
            label={t("recovery.time")}
            value={t("recovery.timeRange", {
              start: formatKstClock(recovered.startedAt),
              end: formatKstClock(recovered.endedAt),
            })}
          />
          <InfoRow label={t("recovery.studyTime")} value={formatDuration(recovered.studySec)} />
          <InfoRow
            label={t("recovery.focusTime")}
            value={formatDuration(recovered.focusSec)}
            accent
          />
        </Card>
        <Button
          type="button"
          autoFocus
          onClick={onConfirm}
          className="h-13 w-full shrink-0 rounded-[14px] text-[16px] font-semibold motion-reduce:transition-none"
        >
          {t("recovery.confirm")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
