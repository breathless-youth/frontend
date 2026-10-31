import { cva } from "class-variance-authority";
import { Check, Frown, Meh, Smile, type LucideIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Card } from "@/components/ui/card";
import type { MeasurementFeedbackRating, MeasurementFeedbackReason } from "@/lib/amplitude";
import { cn } from "@/lib/utils";

import {
  MEASUREMENT_FEEDBACK_COPY as COPY,
  RATING_OPTIONS,
  REASON_OPTIONS,
  REASON_TITLE,
} from "./measurementFeedbackCopy";

const RATING_ICON: Record<MeasurementFeedbackRating, LucideIcon> = {
  good: Smile,
  meh: Meh,
  bad: Frown,
};

const ratingButtonVariants = cva(
  "flex min-h-11 flex-1 flex-col items-center justify-center gap-1.5 rounded-md border-[1.5px] px-1 py-3 text-[13px] leading-4 font-semibold transition-colors duration-150 motion-reduce:transition-none",
  {
    variants: {
      selected: {
        true: "border-primary bg-brand-subtle text-primary",
        false: "border-transparent bg-bg-layer-2 text-foreground [&_svg]:text-muted-foreground",
      },
    },
    defaultVariants: { selected: false },
  },
);

const FADE_IN = "animate-[result-fade-up_0.4s_ease-out_both] motion-reduce:animate-none";

/**
 * 결과 화면의 AI 측정 만족도 카드
 *
 * 만족해요는 바로 마무리하고, 보통이에요·아쉬워요는 이유를 한 번 더 묻는다.
 * 고른 값은 콜백으로만 알리고 노출 기록과 계측은 호스트가 맡는다.
 * 글자색 토큰이 Soft Blue 테마 값이라 결과 화면처럼 `theme-soft-blue` 안에서만 쓴다.
 * 마무리 문구는 처음부터 있던 상태 영역에 넣어야 화면 읽기 프로그램이 읽어 준다.
 * 마무리되면 누른 버튼이 사라지므로 포커스를 상태 영역으로 옮긴다.
 */
export function MeasurementFeedbackCard({
  onRate,
  onReason,
}: {
  onRate: (rating: MeasurementFeedbackRating) => void;
  onReason: (rating: MeasurementFeedbackRating, reason: MeasurementFeedbackReason) => void;
}) {
  const titleId = useId();
  const reasonTitleId = useId();
  const statusRef = useRef<HTMLDivElement>(null);
  const [rating, setRating] = useState<MeasurementFeedbackRating | null>(null);
  const [reasonPicked, setReasonPicked] = useState(false);
  const finished = rating === "good" || reasonPicked;

  useEffect(() => {
    if (finished) {
      statusRef.current?.focus({ preventScroll: true });
    }
  }, [finished]);

  return (
    <Card className="shadow-sb-card">
      <div className="p-4">
        {!finished && (
          <div className="flex flex-col gap-3">
            <h2 id={titleId} className="text-[15px] leading-5 font-bold text-foreground">
              {COPY.title}
            </h2>
            <div role="group" aria-labelledby={titleId} className="flex gap-2">
              {RATING_OPTIONS.map(({ value, label }) => {
                const Icon = RATING_ICON[value];
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={rating === value}
                    onClick={() => {
                      // 같은 답을 다시 누른 것은 새 응답이 아니라서 이벤트를 또 보내지 않는다.
                      if (rating === value) {
                        return;
                      }
                      setRating(value);
                      onRate(value);
                    }}
                    className={ratingButtonVariants({ selected: rating === value })}
                  >
                    <Icon className="size-6.5" strokeWidth={1.8} aria-hidden="true" />
                    {label}
                  </button>
                );
              })}
            </div>
            {(rating === "meh" || rating === "bad") && (
              <div className={cn("flex flex-col gap-2.5 border-t border-border pt-3", FADE_IN)}>
                <div className="flex flex-col gap-0.5">
                  <p
                    id={reasonTitleId}
                    className="text-[14px] leading-4.75 font-bold text-foreground"
                  >
                    {REASON_TITLE[rating]}
                  </p>
                  <p className="text-[12px] leading-4.25 text-muted-foreground">
                    {COPY.reasonDescription}
                  </p>
                </div>
                <div role="group" aria-labelledby={reasonTitleId} className="flex flex-wrap gap-2">
                  {REASON_OPTIONS.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        setReasonPicked(true);
                        onReason(rating, value);
                      }}
                      className="min-h-11 rounded-full bg-bg-layer-2 px-3.5 text-[13px] leading-4.5 font-medium text-foreground transition-opacity duration-150 active:opacity-70 motion-reduce:transition-none"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        <div ref={statusRef} role="status" tabIndex={-1} className="outline-none">
          {finished && (
            <div className={cn("flex items-center gap-3", FADE_IN)}>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-primary">
                <Check className="size-4" strokeWidth={3} aria-hidden="true" />
              </span>
              <p className="text-[15px] leading-5.25 font-bold text-foreground">{COPY.thanks}</p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
