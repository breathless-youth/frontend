/**
 * 카메라 전환 아이콘 — 몸통은 고정하고 **안의 회전 화살표만** 돈다(2026-08-25 피드백).
 * `<img>` 자산으로는 일부만 돌릴 수 없어 인라인 SVG 컴포넌트로 옮겼다(종전
 * `session-camera-flip.svg` 대체). 도형은 통용되는 카메라 몸통+내부 회전 문법(상단 혹은 2026-08-25 피드백으로 제거) —
 * 손으로 그린 임시 자산이라 Figma 정식 아이콘이 나오면 경로만 교체한다.
 *
 * `turns`는 누른 횟수 — 반 바퀴(180°)씩 누적 회전하고 CSS 트랜지션이 연속 회전을 만든다.
 * 회전 중심은 화살표 도형의 시각 중심(12, 12)이다(`transform-box` 기본 view-box 기준).
 */
export function CameraFlipIcon({ turns, className }: { turns: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <rect
        x="2.8"
        y="5.7"
        width="18.4"
        height="12.6"
        rx="3"
        stroke="white"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <g
        data-testid="camera-flip-arrows"
        className="transition-transform duration-300 ease-out motion-reduce:transition-none"
        style={{ transform: `rotate(${turns * 180}deg)`, transformOrigin: "12px 12px" }}
      >
        <path
          d="M8.5 11.5a3.6 3.6 0 0 1 6.3-1.4"
          stroke="white"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M15.2 7.9v2.4h-2.4"
          stroke="white"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M15.5 12.5a3.6 3.6 0 0 1-6.3 1.4"
          stroke="white"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M8.8 16.1v-2.4h2.4"
          stroke="white"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}
