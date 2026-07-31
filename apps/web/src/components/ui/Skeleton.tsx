import { cn } from "@/lib/utils";

/**
 * 로딩 자리표시 사각형 (`apps/mobile/components/ui/Skeleton.tsx`에서 이식).
 * RN판의 reanimated 투명도 펄스 대신 Tailwind 내장 `animate-pulse`를 쓴다 — 같은 시각 효과를
 * 추가 코드 없이 얻는다. 크기·모서리는 호출부가 className으로 정한다.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="불러오는 중"
      className={cn("animate-pulse bg-bg-layer-2", className)}
    />
  );
}
