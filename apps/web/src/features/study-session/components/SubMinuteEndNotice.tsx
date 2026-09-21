import { useId } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { SUB_MINUTE_END_COPY } from "../sessionCopy";
import { CheckCircle } from "./CheckCircle";

/**
 * 순공 1분 미만으로 끝난 세션의 종료 안내 — 공부 결과 대신 이 화면을 보여주고 홈으로 보낸다.
 *
 * ⚠️ **저장은 이미 끝난 상태로 이 화면에 온다.** 서버는 순공시간과 무관하게 모든 세션을
 * 저장하는 것이 계약이고(mvp-scope), 걸러내는 것은 표시·합산 단계다. 그래서 문구도 "저장되지
 * 않았다"가 아니라 "기록에 표시되지 않는다"다.
 */
export interface SubMinuteEndNoticeProps {
  /** CTA — 홈으로 보낸다. 이 화면의 이탈 경로는 이것 하나뿐이다. */
  onGoHome: () => void;
  className?: string;
}

export function SubMinuteEndNotice({ onGoHome, className }: SubMinuteEndNoticeProps) {
  const titleId = useId();

  return (
    <section
      aria-live="polite"
      aria-labelledby={titleId}
      data-session-surface="sub-minute-end"
      className={cn(
        "pointer-events-auto absolute inset-0 flex flex-col overflow-y-auto bg-background px-5 text-foreground",
        "pt-[env(safe-area-inset-top)] pb-[calc(env(safe-area-inset-bottom)+24px)]",
        className,
      )}
    >
      <div className="flex flex-1 flex-col items-center justify-center py-8">
        <CheckCircle />
        <h1
          id={titleId}
          className="mt-6 text-center text-[20px] leading-[24px] font-bold text-foreground"
        >
          {SUB_MINUTE_END_COPY.title}
        </h1>
        <p className="mt-[10px] text-center text-[14px] leading-[21px] text-muted-foreground">
          {SUB_MINUTE_END_COPY.body}
        </p>
      </div>

      <Button
        type="button"
        onClick={onGoHome}
        className="mt-auto h-[52px] w-full shrink-0 rounded-2xl text-[16px] font-semibold motion-reduce:transition-none"
      >
        {SUB_MINUTE_END_COPY.cta}
      </Button>
    </section>
  );
}
