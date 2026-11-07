import { useTranslation } from "react-i18next";
import { CircleAlert } from "lucide-react";

import { trackErrorRetryPressed } from "@/lib/amplitude";
import { cn } from "@/lib/utils";

/**
 * 조회 실패 자리표시 — 메시지 + 다시 시도 (`apps/mobile/components/ui/ErrorState.tsx`에서 이식).
 * Figma에 오류 상태 정의가 없어 기존 카드 토큰만 쓰는 최소 구현이다. 문구는 호출부가 정한다.
 */
export function ErrorState({
  message,
  onRetry,
  screen,
  variant,
}: {
  message: string;
  onRetry: () => void;
  variant?: "planner";
  /** 계측용 화면 식별자(BY-616 확장) — `error_retry_pressed.screen`. */
  screen: "home" | "records" | "planner" | "profile" | "live_room_entry" | "ranking" | "group_tab";
}) {
  const { t } = useTranslation();
  return (
    <div
      role={variant === "planner" ? "alert" : undefined}
      className={cn(
        "flex flex-col items-center",
        variant === "planner"
          ? "mt-37.5 gap-2.5 text-center"
          : "gap-3 rounded-xl border border-border bg-muted px-5 py-8",
      )}
    >
      {variant === "planner" && (
        <CircleAlert aria-hidden size={40} strokeWidth={1.8} className="text-text-tertiary" />
      )}
      <p
        className={
          variant === "planner" ? "text-base leading-6 font-bold" : "text-sm text-muted-foreground"
        }
      >
        {message}
      </p>
      <button
        type="button"
        onClick={() => {
          trackErrorRetryPressed(screen);
          onRetry();
        }}
        className={
          variant === "planner"
            ? "relative mt-1.5 h-10 rounded-[14px] bg-bg-layer-2 px-4.5 text-sm font-bold before:absolute before:inset-x-0 before:-inset-y-0.5"
            : "min-h-11 rounded-full bg-brand-subtle px-5 text-sm font-semibold text-primary"
        }
      >
        {t("actions.retry")}
      </button>
    </div>
  );
}
