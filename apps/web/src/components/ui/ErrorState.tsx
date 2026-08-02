/**
 * 조회 실패 자리표시 — 메시지 + 다시 시도 (`apps/mobile/components/ui/ErrorState.tsx`에서 이식).
 * Figma에 오류 상태 정의가 없어 기존 카드 토큰만 쓰는 최소 구현이다. 문구는 호출부가 정한다.
 */
export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-muted px-5 py-8">
      <p className="text-sm text-muted-foreground">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="min-h-11 rounded-full bg-brand-subtle px-5 text-sm font-semibold text-primary"
      >
        다시 시도
      </button>
    </div>
  );
}
