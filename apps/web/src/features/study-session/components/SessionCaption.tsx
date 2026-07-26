import { cn } from "@/lib/utils";

/**
 * 세션 하단 캡션 1줄 (Figma S3-1 `58:360` · S3-3 `59:361` — **같은 자리**).
 *
 * 프라이버시 캡션과 일시정지 캡션은 서로를 **대체**한다 — 두 줄을 동시에 띄우지 않는다.
 * 어떤 문구가 오는지는 `sessionCopy.captionFor(state)`가 결정하고 이 컴포넌트는 그리기만 한다.
 *
 * ⚠️ **심플 모드(S3-4)에는 이 행 자체가 없다**(프레임 실측 — 카메라 프리뷰와 함께 사라진다).
 * 그래서 캡션을 타이머 안이 아니라 별도 컴포넌트로 분리했다: 심플 모드에서는 호출부가
 * 아예 렌더하지 않는다.
 */
export interface SessionCaptionProps {
  text: string;
  className?: string;
}

export function SessionCaption({ text, className }: SessionCaptionProps) {
  return (
    <p className={cn("text-center text-[12px] leading-[14px] text-white/55", className)}>{text}</p>
  );
}
