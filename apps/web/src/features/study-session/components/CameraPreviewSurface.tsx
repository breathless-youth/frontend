import { cn } from "@/lib/utils";

/**
 * 카메라 피드가 들어올 자리 (Figma `Session / Camera Preview BG` 58:109).
 *
 * 실기기 스파이크 전이라 실제 `getUserMedia` 피드는 없다 — 카메라가 돌지 않는 동안
 * "여기가 카메라 피드 자리"를 나타내는 중립 서피스를 그린다. Figma의 사선 밴드는
 * 12개 레이어로 그려져 있지만 구현은 `repeating-linear-gradient` 하나로 대체한다
 * (55px 밴드 / 110px 주기 / -45° — Figma 실측과 동일).
 *
 * 실제 피드가 붙으면 이 컴포넌트 안에서 `<video>`로 교체하고 목업 텍스처는 사라진다.
 * UI가 카메라 SDK를 직접 호출하지 않는 경계는 유지한다(`frontend/CLAUDE.md`).
 */
export interface CameraPreviewSurfaceProps {
  /** 카메라 어댑터가 실행 중인지 — false면 목업 텍스처를 노출한다. */
  isRunning: boolean;
  className?: string;
}

export function CameraPreviewSurface({ isRunning, className }: CameraPreviewSurfaceProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("absolute inset-0 overflow-hidden bg-[var(--session-camera-base)]", className)}
    >
      {!isRunning && (
        <>
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "repeating-linear-gradient(-45deg, rgba(255,255,255,0.03) 0 55px, transparent 55px 110px)",
            }}
          />
          <p className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[12px] leading-[14px] tracking-[2px] whitespace-nowrap text-white/16">
            [ 전 면 카 메 라 프 리 뷰 ]
          </p>
        </>
      )}
    </div>
  );
}
