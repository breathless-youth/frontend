import { useId } from "react";

import { cn } from "@/lib/utils";

import { SUB_MINUTE_END_COPY } from "../sessionCopy";

/**
 * 순공 1분 미만으로 끝난 세션의 종료 안내 — **S4(공부 결과) 대신** 이 화면을 보여주고 홈으로 보낸다.
 *
 * 2026-07-27 확정(ai-wiki `product/mvp-scope.md` "기록 저장·표시 기준"):
 * "순공 1분 미만으로 종료 시 결과 화면(S4) 대신 **간단 안내 후 홈**으로 이동한다."
 *
 * S4를 띄우면 안 되는 이유는 그 화면이 기록으로 남은 세션을 전제로 하기 때문이다 — 순공·집중률·
 * 타임라인·유형별 통계를 모두 보여주는데, 정작 기록 목록에는 나타나지 않는 세션이라 사용자가
 * 다시 찾을 수 없다. S3-8(자동 종료) 안내도 못 쓴다: 타이틀이 `여기까지 기록을 저장했어요`로
 * **기록에 남았다고 단언**한다.
 *
 * ⚠️ **저장은 이미 끝난 상태로 이 화면에 온다.** 서버는 순공시간과 무관하게 모든 세션을
 * 저장하는 것이 계약이고(mvp-scope), 걸러내는 것은 표시·합산 단계다. 그래서 문구도 "저장되지
 * 않았다"가 아니라 "기록에 표시되지 않는다"다.
 *
 * ## 디자인 미확정
 *
 * 이 화면의 Figma 시안이 없다(2026-07-27 결정이 UX만 규정하고 시안은 없다). 새 시각 언어를
 * 만들지 않고 S3-8 `AutoEndNotice`의 레이아웃 관계(중앙 정렬 본문 + 하단 CTA)를 그대로 따르되,
 * 요약 카드·아이콘처럼 "기록이 남았다"를 암시하는 요소는 넣지 않는다.
 */
export interface SubMinuteEndNoticeProps {
  /** CTA — 홈으로 보낸다. 이 화면의 이탈 경로는 이것 하나뿐이다. */
  onGoHome: () => void;
  className?: string;
}

export function SubMinuteEndNotice({ onGoHome, className }: SubMinuteEndNoticeProps) {
  const titleId = useId();

  return (
    // 사용자가 종료를 눌러서 온 화면이지만 **결과 화면을 기대한 상태**이므로 전환을 알린다.
    // `pointer-events-auto`: 세션 레이어와 같은 오버레이 층이라 직접 부여한다(AutoEndNotice와 동일).
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
        <h1
          id={titleId}
          className="text-center text-[20px] leading-[24px] font-bold text-foreground"
        >
          {SUB_MINUTE_END_COPY.title}
        </h1>
        <p className="mt-[10px] text-center text-[14px] leading-[21px] text-muted-foreground">
          {SUB_MINUTE_END_COPY.body}
        </p>
      </div>

      <button
        type="button"
        onClick={onGoHome}
        className="h-[52px] w-full shrink-0 rounded-2xl bg-primary text-[16px] font-semibold text-primary-foreground"
      >
        {SUB_MINUTE_END_COPY.cta}
      </button>
    </section>
  );
}
