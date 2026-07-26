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
 *
 * **가로(S3-5 `61:439`~`61:455`)에는 방향 델타가 없다** — 대조 결과 밴드 기하(폭 55px · 주기
 * 110px · -45°)와 라벨 타이포(12px · tracking 2px · white 16%)가 세로와 완전히 같고, 프레임에
 * 그려진 stripe 개수만 12 → 16으로 늘어난다(더 넓은 프레임을 덮기 위한 것). 여기서는 밴드를
 * 레이어가 아니라 `repeating-linear-gradient` 하나로 그리므로 어떤 뷰포트에서도 자동으로
 * 채워진다 — 그래서 `landscape:` 변형을 추가하지 않는다. 가로 프레임의 라벨 문구(`· 가 로`)와
 * 위치(y=100)는 목업 고유값이라 재현하지 않는다.
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
      data-session-surface="camera"
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
