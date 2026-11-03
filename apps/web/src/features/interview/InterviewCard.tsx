import { ChevronRight, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * 결과 화면의 인터뷰 모집 카드
 *
 * 글자색 토큰은 Soft Blue 테마에만 있어 결과 화면처럼 `theme-soft-blue` 안에서만 쓴다.
 * 링크와 X는 시안 크기를 지키면서 누르는 영역만 44px로 넓힌다.
 */
export function InterviewCard({
  onApply,
  onDismiss,
}: {
  onApply: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation("interview");
  return (
    <Card className="flex items-start gap-2 rounded-xl border-0 bg-brand-subtle py-4 pr-3.5 pl-5 text-brand-subtle-text">
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <h2 className="text-[16px] leading-5 font-bold">{t("card.title")}</h2>
        <p className="text-[13px] leading-4.25">{t("card.body")}</p>
        <div className="pt-1">
          <Button
            type="button"
            variant="unstyled"
            onClick={onApply}
            className="relative h-auto gap-1 p-0 text-[13px] leading-4 font-bold before:absolute before:-inset-x-2 before:-inset-y-3.5 before:content-['']"
          >
            {t("card.apply")}
            <ChevronRight size={12} strokeWidth={2.6} aria-hidden="true" />
          </Button>
        </div>
      </div>
      <Button
        type="button"
        variant="unstyled"
        aria-label={t("card.aria.dismiss")}
        onClick={onDismiss}
        className="relative size-6 shrink-0 p-0 before:absolute before:-inset-2.5 before:content-['']"
      >
        <X size={14} strokeWidth={2.4} aria-hidden="true" />
      </Button>
    </Card>
  );
}
