import { Check, Frown, type LucideIcon, Smile } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { FocusFeedbackImpact } from "@/lib/amplitude";

export const IMPACT_VALUES = [
  "helped",
  "hindered",
] as const satisfies readonly FocusFeedbackImpact[];

const IMPACT_ICONS: Record<FocusFeedbackImpact, LucideIcon> = {
  helped: Smile,
  hindered: Frown,
};

const MAX_COMMENT_LENGTH = 250;

export function FocusFeedbackCard({
  allowComment,
  onAnswer,
  onComment,
}: {
  allowComment: boolean;
  onAnswer: (impact: FocusFeedbackImpact) => void;
  onComment: (impact: FocusFeedbackImpact, comment: string) => void;
}) {
  const { t } = useTranslation(["focus-feedback", "common"]);
  const titleId = useId();
  const commentId = useId();
  const commentNoticeId = useId();
  const commentLabelRef = useRef<HTMLLabelElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const [impact, setImpact] = useState<FocusFeedbackImpact | null>(null);
  const [comment, setComment] = useState("");
  const [finished, setFinished] = useState(false);
  const trimmedComment = comment.trim();

  useEffect(() => {
    if (finished) {
      statusRef.current?.focus({ preventScroll: true });
    } else if (impact !== null) {
      // 질문을 읽어 주되 입력창에 바로 포커스를 주어 키보드를 열지 않는다.
      commentLabelRef.current?.focus({ preventScroll: true });
    }
  }, [finished, impact]);

  return (
    <Card className="shadow-sb-card">
      <div className="p-4">
        {impact === null && (
          <div className="flex flex-col gap-3">
            <h2 id={titleId} className="text-[15px] leading-5 font-bold text-foreground">
              {t("title")}
            </h2>
            <div role="group" aria-labelledby={titleId} className="flex gap-2">
              {IMPACT_VALUES.map((value) => {
                const Icon = IMPACT_ICONS[value];
                return (
                  <Button
                    key={value}
                    variant="secondary"
                    onClick={() => {
                      setImpact(value);
                      setFinished(!allowComment || value !== "helped");
                      onAnswer(value);
                    }}
                    className="h-auto min-h-11 min-w-0 flex-1 flex-col gap-1.5 px-1 py-3 text-center text-[13px] leading-4 font-semibold [&_svg]:text-muted-foreground"
                  >
                    <Icon className="size-6.5 shrink-0" aria-hidden="true" />
                    {t(`impact.${value}`)}
                  </Button>
                );
              })}
            </div>
          </div>
        )}
        {impact !== null && !finished && (
          <form
            className="flex flex-col gap-2.5"
            onSubmit={(event) => {
              event.preventDefault();
              if (trimmedComment.length === 0) return;
              setFinished(true);
              onComment(impact, trimmedComment);
            }}
          >
            <label
              ref={commentLabelRef}
              htmlFor={commentId}
              tabIndex={-1}
              className="text-[15px] leading-5 font-bold text-foreground"
            >
              {t("comment.question")}
            </label>
            <p id={commentNoticeId} className="text-xs leading-4.25 text-muted-foreground">
              {t("comment.notice")}
            </p>
            <textarea
              id={commentId}
              aria-describedby={commentNoticeId}
              rows={3}
              maxLength={MAX_COMMENT_LENGTH}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              className="amp-block sentry-block w-full resize-y rounded-md border border-border bg-bg-layer-2 px-3 py-2 text-base"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" className="min-h-11" onClick={() => setFinished(true)}>
                {t("comment.skip")}
              </Button>
              <Button type="submit" className="min-h-11" disabled={trimmedComment.length === 0}>
                {t("comment.send")}
              </Button>
            </div>
          </form>
        )}
        <div ref={statusRef} role="status" tabIndex={-1} className="outline-none">
          {finished && (
            <div className="flex items-center gap-3 animate-[result-fade-up_0.4s_ease-out_both] motion-reduce:animate-none">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-primary">
                <Check className="size-4 shrink-0" aria-hidden="true" />
              </span>
              <p className="text-[15px] leading-5.25 font-bold text-foreground">
                {t("common:feedback.thanks")}
              </p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
