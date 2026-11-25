import { useEffect, useState, type CSSProperties } from "react";

import type { EffectSprite } from "./types";

// 한 번 받은 띠 그림은 다시 그릴 때 지금 그림을 거치지 않게 기억한다.
const decoded = new Set<string>();

/** 띠 그림을 다 받아 바로 그릴 수 있는지 */
function useSpriteReady(url: string | null) {
  const [ready, setReady] = useState<string | null>(() =>
    url !== null && decoded.has(url) ? url : null,
  );
  useEffect(() => {
    if (url === null || decoded.has(url)) {
      return;
    }
    let alive = true;
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    // 테스트의 jsdom처럼 decode가 없는 환경에서도 throw하지 않고 지금 그림에 머물게 한 번 감싼다.
    Promise.resolve()
      .then(() => image.decode())
      .then(
        () => {
          decoded.add(url);
          if (alive) {
            setReady(url);
          }
        },
        () => {},
      );
    return () => {
      alive = false;
    };
  }, [url]);
  return url !== null && (ready === url || decoded.has(url));
}

/** 넘길 장이 두 장 이상이고 길이가 있어야 띠 그림으로 그린다. */
function playable(sprite: EffectSprite) {
  return Number.isInteger(sprite.frames) && sprite.frames >= 2 && sprite.durationMs > 0;
}

/**
 * 미리 그린 프레임 띠 그림으로 움직이는 효과 조각
 *
 * 띠 그림은 조각 자리 크기의 장을 가로로 이은 한 그림이고, steps()로 한 장 폭씩 밀어 손그림처럼 넘긴다.
 * 미는 일은 transform만 바꿔 합성 단계에서 돈다.
 * 띠 그림을 다 받기 전이나 받지 못하면 지금 효과 그림 조각을 그대로 보인다.
 * 첫 장이 지금 그림과 같아서 띠 그림으로 바뀌는 순간이 튀지 않고, 모션 축소에서는 첫 장에 멈춘다(index.css).
 * 그룹 책상처럼 작은 크기에서도 같은 띠 그림을 브라우저가 줄여 그린다.
 */
export function SpriteEffectPiece({
  sprite,
  box,
  picture,
}: {
  sprite: EffectSprite;
  box: CSSProperties;
  picture: CSSProperties;
}) {
  const frames = Math.round(sprite.frames);
  const ready = useSpriteReady(playable(sprite) ? sprite.url : null);
  return (
    <span data-effect-piece="sprite" className="absolute overflow-hidden" style={box}>
      {ready ? (
        // 띠를 (장 수 − 1)장 폭인 상자에 얹고 그 상자를 자기 폭만큼 밀어서, 장 수가 달라도 키프레임 하나로 마지막 장까지 넘긴다.
        <span
          className="mascot-fx-sprite absolute inset-y-0 left-0"
          style={{
            width: `${(frames - 1) * 100}%`,
            animationDuration: `${sprite.durationMs}ms`,
            animationTimingFunction: `steps(${frames}, jump-none)`,
          }}
        >
          <span
            className="absolute inset-y-0 left-0 bg-no-repeat"
            style={{
              width: `${Number(((frames / (frames - 1)) * 100).toFixed(4))}%`,
              backgroundImage: `url(${sprite.url})`,
              backgroundSize: "100% 100%",
            }}
          />
        </span>
      ) : (
        <span className="absolute inset-0 bg-no-repeat" style={picture} />
      )}
    </span>
  );
}
