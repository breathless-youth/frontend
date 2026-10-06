import { ChevronRight, X } from "lucide-react";

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
  return (
    <Card className="flex items-start gap-2 rounded-xl border-0 bg-brand-subtle py-4 pr-3.5 pl-5 text-brand-subtle-text">
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <h2 className="text-[16px] leading-[20px] font-bold">꾸준히 쓰는 이유를 들려주세요</h2>
        <p className="text-[13px] leading-[17px]">15분 통화하면 스타벅스 기프티콘 100% 증정</p>
        <div className="pt-1">
          <Button
            type="button"
            variant="unstyled"
            onClick={onApply}
            className="relative h-auto gap-1 p-0 text-[13px] leading-[16px] font-bold before:absolute before:-inset-x-2 before:-inset-y-3.5 before:content-['']"
          >
            인터뷰 신청하기
            <ChevronRight size={12} strokeWidth={2.6} aria-hidden="true" />
          </Button>
        </div>
      </div>
      <Button
        type="button"
        variant="unstyled"
        aria-label="인터뷰 안내 닫기"
        onClick={onDismiss}
        className="relative size-6 shrink-0 p-0 before:absolute before:-inset-2.5 before:content-['']"
      >
        <X size={14} strokeWidth={2.4} aria-hidden="true" />
      </Button>
    </Card>
  );
}
