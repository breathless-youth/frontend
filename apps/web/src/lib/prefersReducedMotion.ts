/** 모션 축소 설정(`prefers-reduced-motion`). `matchMedia`가 없는 환경(테스트)은 축소 아님으로 본다. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
