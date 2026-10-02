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
    <svg viewBox="0 0 28 28" fill="none" aria-hidden="true" className={className}>
      {/* 혹+몸통을 한 path로(겹치면 경계선이 남는다). 혹 옆면은 대각선 사다리꼴 — 2026-08-25 레퍼런스. */}
      <path
        d="M9.09533 8.40456L11.4287 5.83789H16.562L18.8953 8.40456H21.2287C22.1569 8.40456 23.0472 8.77331 23.7035 9.42968C24.3599 10.0861 24.7287 10.9763 24.7287 11.9046V19.6046C24.7287 20.5328 24.3599 21.4231 23.7035 22.0794C23.0472 22.7358 22.1569 23.1046 21.2287 23.1046H6.76199C5.83374 23.1046 4.9435 22.7358 4.28712 22.0794C3.63074 21.4231 3.26199 20.5328 3.26199 19.6046V11.9046C3.26199 10.9763 3.63074 10.0861 4.28712 9.42968C4.9435 8.77331 5.83374 8.40456 6.76199 8.40456H9.09533Z"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <g
        data-testid="camera-flip-arrows"
        className="transition-transform duration-300 ease-out motion-reduce:transition-none"
        style={{ transform: `rotate(${turns * 180}deg)`, transformOrigin: "14px 15.75px" }}
      >
        <path
          d="M9.91199 15.1689C10.0986 14.4084 10.4942 13.7152 11.0539 13.1676C11.6137 12.62 12.3154 12.2399 13.0798 12.07C13.8442 11.9001 14.6409 11.9473 15.3799 12.2063C16.1189 12.4653 16.7708 12.9257 17.262 13.5355"
          stroke="currentColor"
          strokeWidth={1.33}
          strokeLinecap="round"
        />
        <path
          d="M17.738 10.9619V13.7619H14.938"
          stroke="currentColor"
          strokeWidth={1.33}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M18.088 16.3379C17.9014 17.0984 17.5058 17.7916 16.9461 18.3391C16.3863 18.8867 15.6846 19.2669 14.9202 19.4368C14.1558 19.6067 13.3591 19.5594 12.6201 19.3005C11.8811 19.0415 11.2292 18.5811 10.738 17.9712"
          stroke="currentColor"
          strokeWidth={1.33}
          strokeLinecap="round"
        />
        <path
          d="M10.262 20.538V17.738H13.062"
          stroke="currentColor"
          strokeWidth={1.33}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}
