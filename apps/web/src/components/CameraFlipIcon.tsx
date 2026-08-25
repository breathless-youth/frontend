/**
 * 카메라 전환 아이콘 — 몸통은 고정하고 **안의 회전 화살표만** 돈다(2026-08-25 피드백).
 * `<img>` 자산으로는 일부만 돌릴 수 없어 인라인 SVG 컴포넌트로 옮겼다(종전
 * `session-camera-flip.svg` 대체). 도형은 통용되는 사진기+내부 회전 문법(혹과 몸통은 경계선 없는 한 path) —
 * 손으로 그린 임시 자산이라 Figma 정식 아이콘이 나오면 경로만 교체한다.
 *
 * `turns`는 누른 횟수 — 반 바퀴(180°)씩 누적 회전하고 CSS 트랜지션이 연속 회전을 만든다.
 * 회전 중심은 화살표 도형의 시각 중심(12, 13.5)이다(`transform-box` 기본 view-box 기준).
 */
export function CameraFlipIcon({ turns, className }: { turns: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      {/* 혹+몸통을 한 path로 — 별도 rect를 겹치면 만나는 자리에 경계선이 생긴다(2026-08-25 피드백). */}
      <path
        d="M8.6 7.2l.9-1.7A1.6 1.6 0 0 1 10.9 4.6h2.2a1.6 1.6 0 0 1 1.4.9l.9 1.7H18.2a3 3 0 0 1 3 3v6.6a3 3 0 0 1-3 3H5.8a3 3 0 0 1-3-3v-6.6a3 3 0 0 1 3-3Z"
        stroke="white"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <g
        data-testid="camera-flip-arrows"
        className="transition-transform duration-300 ease-out motion-reduce:transition-none"
        style={{ transform: `rotate(${turns * 180}deg)`, transformOrigin: "12px 13.5px" }}
      >
        <path
          d="M8.5 13a3.6 3.6 0 0 1 6.3-1.4"
          stroke="white"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M15.2 9.4v2.4h-2.4"
          stroke="white"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M15.5 14a3.6 3.6 0 0 1-6.3 1.4"
          stroke="white"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M8.8 17.6v-2.4h2.4"
          stroke="white"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}
