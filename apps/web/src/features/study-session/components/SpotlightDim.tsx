import { useEffectEvent, useId, useLayoutEffect, useState, type RefObject } from "react";

export interface SpotlightHole {
  readonly ref: RefObject<HTMLElement | null>;
  readonly padX: number;
  readonly padY: number;
  /** 높이 절반보다 크면 알약·원이 된다. */
  readonly radius: number;
}

interface HoleRect {
  x: number;
  y: number;
  width: number;
  height: number;
  rx: number;
}

/**
 * 도움말 덮개
 *
 * 강조 대상은 덮개 없이 원래 밝기로 보여야 해서 덮개에 구멍을 뚫는다.
 * 그림자 한 겹으로 뚫으면 구멍이 둘일 때 서로를 덮으므로 마스크 하나에 구멍을 모두 뚫는다.
 * 자리는 대상 요소를 직접 재서 안전 영역·창 크기가 달라도 맞는다.
 * 덮개는 화면 왼쪽 위에 붙은 상자 안에 두어야 잰 자리와 그리는 자리가 같다.
 * 단계마다 새로 재도록 호출부가 key를 바꾼다.
 */
export function SpotlightDim({
  holes,
  opacity,
}: {
  holes: readonly SpotlightHole[];
  opacity: number;
}) {
  const maskId = useId();
  const [rects, setRects] = useState<readonly HoleRect[]>([]);
  const measure = useEffectEvent(() => {
    setRects(
      holes.flatMap(({ ref, padX, padY, radius }) => {
        const box = ref.current?.getBoundingClientRect();
        if (!box) return [];
        const height = Math.round(box.height + padY * 2);
        return [
          {
            x: Math.round(box.x - padX),
            y: Math.round(box.y - padY),
            width: Math.round(box.width + padX * 2),
            height,
            rx: Math.min(radius, height / 2),
          },
        ];
      }),
    );
  });
  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 구멍 자리는 그려진 대상 요소를 재야 알 수 있다
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  return (
    <svg aria-hidden="true" className="pointer-events-none absolute inset-0 size-full">
      <defs>
        <mask id={maskId}>
          <rect width="100%" height="100%" fill="white" />
          {rects.map((rect, index) => (
            <rect key={index} data-hole="" {...rect} ry={rect.rx} fill="black" />
          ))}
        </mask>
      </defs>
      <rect
        data-dim=""
        width="100%"
        height="100%"
        fill="black"
        fillOpacity={opacity}
        mask={`url(#${maskId})`}
      />
    </svg>
  );
}
