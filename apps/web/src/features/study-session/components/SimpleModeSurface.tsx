import { cn } from "@/lib/utils";

/**
 * 심플 모드(S3-4) 배경 + 엣지 글로우 레이어 (Figma `60:404` 프레임 배경 + `60:405` edge-glow).
 *
 * 심플 모드는 카메라 프리뷰를 **걷어내는** 표시 모드다 — `CameraPreviewSurface`를 덮는 게 아니라
 * 두 서피스가 `hidden`으로 교차한다. 배경은 프리뷰의 `#1A2029`가 아니라 더 어두운 `#0B0F14`다.
 *
 * ## 엣지 글로우는 **상태 전환 잔향**이다 (BY-336 확정, 2026-07-31)
 *
 * `design.md`(심플 모드 행)의 "전환 시 글로우 1~2초 잔향"이 맞고, Figma Spec 페이지 `14:7`의
 * "엣지 글로우는 정적" 서술이 낡은 쪽이다 — 과거에는 어느 쪽도 임의로 확정하지 않고 정적으로
 * 잠정 구현했으나(SCR-S3-3·S3-4 Review Checklist), 실기기 확인으로 잔향이 의도로 확정됐다.
 * 공부 상태가 전환될 때(심플 모드 진입 포함) 잠깐 켜졌다가 은은하게 꺼진다.
 *
 * 구현: `glowKey`(호출부가 상태 전환마다 바꿔 주는 문자열)를 글로우 레이어의 React `key`로
 * 써서 전환마다 레이어를 리마운트한다 — CSS 애니메이션(`session-edge-glow-fade`, index.css)이
 * 처음부터 다시 돌아 "점등 → 1.8초 페이드아웃"이 재생된다. JS 타이머가 없어 tick 리렌더와
 * 무관하고, `prefers-reduced-motion`에서는 애니메이션 없이 정적 점등(기존 동작)으로 남는다.
 *
 * 색은 `sessionGlowStyle(state)`가 주입한 상태 컬러를 따른다 — 집중 상태에서는 Figma 실측값
 * (`#1B64DA` 32% / `#4593FC` 16%)과 정확히 같아진다. 실측 inner-shadow 값은 Spec 페이지
 * `14:7`(`inner 0 0 110 spread 4 · 32%` + `0 0 40 · 16%`).
 */
export interface SimpleModeSurfaceProps {
  /**
   * 프리뷰 모드(S3-1~S3-3) — **보이지 않지만 마운트를 유지한다.**
   * `CameraPreviewSurface`의 `hidden`과 같은 패턴: 조건부 마운트면 모드 전환 순간 배경이
   * 0ms에 스왑되어 300ms를 끄는 타이머 이동과 시차가 벌어진다. `opacity`만 끄면 두 서피스가
   * 같은 300ms 박자로 교차한다. `data-session-surface="simple"`도 함께 뗀다 — 화면 스펙과
   * 그 테스트가 이 표식으로 "심플 모드 화면인가"를 판별한다.
   */
  hidden?: boolean;
  /**
   * 엣지 글로우 잔향의 재생 키 — 값이 바뀔 때마다 잔향이 처음부터 다시 재생된다.
   * 호출부(RoomPage)가 공부 상태(kind+trigger)와 심플 모드 진입을 묶어 만들어 준다.
   */
  glowKey?: string;
  className?: string;
}

const EDGE_GLOW_SHADOW =
  "inset 0 0 110px 4px var(--session-edge-glow-outer), inset 0 0 40px var(--session-edge-glow-inner)";

export function SimpleModeSurface({ hidden = false, glowKey, className }: SimpleModeSurfaceProps) {
  return (
    <div
      aria-hidden="true"
      {...(hidden ? {} : { "data-session-surface": "simple" })}
      className={cn(
        "absolute inset-0 bg-[var(--session-simple-base)] transition-opacity duration-300 ease-out motion-reduce:transition-none",
        hidden && "pointer-events-none opacity-0",
        className,
      )}
    >
      {/* hidden이면 잔향을 아예 재생하지 않는다(opacity-0 고정) — 서피스가 300ms로 페이드아웃하는
          동안 glowKey가 바뀌어 리마운트되면(프리뷰 복귀가 정확히 이 경우다) 잔향이 부분 가시
          상태에서 재점화되어 비네트가 번쩍인다. 애니메이션 클래스는 다시 보일 때 붙으면서
          처음부터 재생되므로 진입 잔향은 그대로다. */}
      <div
        key={glowKey}
        className={cn("absolute inset-0", hidden ? "opacity-0" : "session-edge-glow-fade")}
        style={{ boxShadow: EDGE_GLOW_SHADOW }}
      />
    </div>
  );
}
