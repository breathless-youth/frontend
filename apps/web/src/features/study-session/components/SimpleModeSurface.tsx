import { cn } from "@/lib/utils";

/**
 * 심플 모드(S3-4) 배경 + 엣지 글로우 레이어 (Figma `60:404` 프레임 배경 + `60:405` edge-glow).
 *
 * 심플 모드는 카메라 프리뷰를 **걷어내는** 표시 모드다 — `CameraPreviewSurface`를 덮는 게 아니라
 * 호출부가 둘 중 하나만 렌더한다. 배경은 프리뷰의 `#1A2029`가 아니라 더 어두운 `#0B0F14`다.
 *
 * ⚠️ 엣지 글로우는 **정적**으로 구현했다. `edge-glow` 노드는 정적 프레임에 값이 비어 있어
 * `get_design_context`로 값을 얻을 수 없고, 실측 inner-shadow 값은 Figma Spec 페이지 `14:7`에만
 * 있다(`inner 0 0 110 spread 4 · 32%` + `0 0 40 · 16%`). 그 페이지는 "엣지 글로우는 정적"이라고
 * 적고 있는 반면 `design.md`(심플 모드 행)는 "전환 시 글로우 1~2초 잔향"이라고 적어 서로 엇갈린다
 * — **어느 쪽도 임의로 확정하지 않고** 모션이 없는 쪽(정적)으로 잠정 구현한다.
 * 결정되면 이 컴포넌트 하나만 고치면 된다(SCR-S3-3·S3-4 Review Checklist).
 *
 * 색은 `sessionGlowStyle(state)`가 주입한 상태 컬러를 따른다 — 집중 상태에서는 Figma 실측값
 * (`#1B64DA` 32% / `#4593FC` 16%)과 정확히 같아진다.
 */
export interface SimpleModeSurfaceProps {
  className?: string;
}

const EDGE_GLOW_SHADOW =
  "inset 0 0 110px 4px var(--session-edge-glow-outer), inset 0 0 40px var(--session-edge-glow-inner)";

export function SimpleModeSurface({ className }: SimpleModeSurfaceProps) {
  return (
    <div
      aria-hidden="true"
      data-session-surface="simple"
      className={cn("absolute inset-0 bg-[var(--session-simple-base)]", className)}
    >
      <div className="absolute inset-0" style={{ boxShadow: EDGE_GLOW_SHADOW }} />
    </div>
  );
}
