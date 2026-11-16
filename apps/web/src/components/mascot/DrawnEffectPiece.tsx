import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

import type { DrawnMotion } from "./drawnMotion";
import type { EffectPiece } from "./types";

type Part = { box: CSSProperties; picture: CSSProperties };

/** 늘 같은 모양이 나오게 씨앗에서 만드는 난수 */
function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function timing(duration: number, delay: number): CSSProperties {
  return { animationDuration: `${duration}s`, animationDelay: `${delay.toFixed(2)}s` };
}

const pct = (value: number) => `${value.toFixed(2)}%`;

/** 효과 그림 모양대로 잘라 빛줄기가 그림 안에서만 지나가게 하는 가림막 */
function shapeOf(picture: CSSProperties): CSSProperties {
  return {
    maskImage: picture.backgroundImage,
    WebkitMaskImage: picture.backgroundImage,
    maskSize: picture.backgroundSize,
    WebkitMaskSize: picture.backgroundSize,
    maskPosition: picture.backgroundPosition,
    WebkitMaskPosition: picture.backgroundPosition,
    maskRepeat: "no-repeat",
    WebkitMaskRepeat: "no-repeat",
  } as CSSProperties;
}

/** 보물 오라: 크기는 그대로 두고 밝기가 크게 오르내리며 금빛 빛줄기가 오라 가장자리를 따라 돈다. */
function Glow({ box, picture }: Part) {
  return (
    <span data-effect-piece="glow" className="mascot-glow absolute" style={box}>
      <span
        data-fx-detail=""
        className="mascot-fx-glow-halo absolute inset-0 bg-no-repeat"
        style={picture}
      />
      {/* 밝아지는 겹과 빛줄기가 흔들리는 그림에서 어긋나지 않게 셋을 한 상자로 함께 흔든다. */}
      <span className="mascot-fx-glow-sway absolute inset-0">
        <span className="absolute inset-0 bg-no-repeat" style={picture} />
        <span className="mascot-fx-glow-bright absolute inset-0 bg-no-repeat" style={picture} />
        <span className="absolute inset-0 overflow-hidden" style={shapeOf(picture)}>
          <span className="mascot-fx-glow-sheen absolute -inset-1/4" />
        </span>
      </span>
    </span>
  );
}

// 고리 한 겹이 퍼지는 시간을 겹 수로 나눠 시작을 어긋나게 두어, 앞 고리가 사라질 때 다음 고리가 가운데에서 시작한다.
const RIPPLE_RINGS = [0, 1, 2];

/**
 * 연보라 오라: 몸 가운데에서 빛 고리가 바깥으로 천천히 퍼지며 옅어지고, 오라 빛은 제자리에서 숨 쉬듯 번진다.
 *
 * 고리는 같은 오라 그림을 몸 가운데를 축으로 키우며 흐리게 해서, 몸 밖으로 나온 가장자리만 고리처럼 보인다.
 * 좌우로 흔들거나 돌리는 움직임은 어지러워서 두지 않는다.
 */
function Ripple({ box, picture, piece }: Part & { piece: EffectPiece }) {
  // 판 가운데가 마스코트 몸 가운데라 조각 상자 안에서 그 자리를 축으로 삼는다.
  const center = {
    transformOrigin: `${pct(((0.5 - piece.x) / piece.width) * 100)} ${pct(((0.5 - piece.y) / piece.height) * 100)}`,
  };
  return (
    <span data-effect-piece="ripple" className="mascot-glow absolute" style={box}>
      {RIPPLE_RINGS.map((ring) => (
        <span
          key={ring}
          data-fx-detail={ring === 0 ? undefined : ""}
          className="mascot-fx-ripple-ring absolute inset-0 bg-no-repeat"
          style={{ ...picture, ...center, animationDelay: `${-ring}s` }}
        />
      ))}
      <span
        data-fx-detail=""
        className="mascot-fx-ripple-halo absolute inset-0 bg-no-repeat"
        style={{ ...picture, ...center }}
      />
      <span className="absolute inset-0 bg-no-repeat" style={picture} />
      <span className="mascot-fx-ripple-bright absolute inset-0 bg-no-repeat" style={picture} />
    </span>
  );
}

/** 오라 속 반짝이: 조각 그림 자체가 제자리에서 반짝이며 판 가운데에서 먼 쪽으로 살짝 떠올랐다 돌아온다. */
function Drift({ box, picture, piece, index }: Part & { piece: EffectPiece; index: number }) {
  const side = piece.x + piece.width / 2 < 0.5 ? "left" : "right";
  return (
    <span
      data-effect-piece="drift"
      data-drift-side={side}
      className={cn(
        "mascot-fx-drift absolute bg-no-repeat",
        side === "left" ? "mascot-fx-drift-l" : "mascot-fx-drift-r",
      )}
      style={{ ...box, ...picture, ...timing(3, -0.4 - 0.75 * index) }}
    />
  );
}

// 가루 덩어리는 서로 겹쳐 있어 네모로 자르면 옆 덩어리가 묻어 나온다.
// 그래서 둥근 가림막으로 덩어리만 남긴다.
const SOFT_EDGE = "radial-gradient(closest-side, #000 88%, transparent)";

/**
 * 지우개 가루: 그림 속 가루 덩어리마다 바깥 위로 흩어졌다가 제자리로 모인다.
 *
 * 판 왼쪽 덩어리는 왼쪽으로, 오른쪽 덩어리는 오른쪽으로 흩어지고 가운데 띠는 제자리에서 출렁인다.
 * 덩어리마다 갈래·박자·시작 시점을 달리해 한꺼번에 움직이지 않는다.
 * 이동 거리를 변수로 넘기면 합성 단계에서 돌지 못해 정해 둔 갈래 가운데 하나로 움직인다.
 */
function Spread({ box, picture, piece, index }: Part & { piece: EffectPiece; index: number }) {
  const center = piece.x + piece.width / 2;
  const side = center < 0.45 ? "left" : center > 0.55 ? "right" : "middle";
  const path = side === "middle" ? "m" : `${side === "left" ? "l" : "r"}${(index % 3) + 1}`;
  const duration = side !== "middle" && index % 3 === 1 ? 1.5 : 3;
  const random = seeded(index * 29 + 7);
  return (
    <span
      data-effect-piece="spread"
      data-spread-side={side}
      className={cn("mascot-fx-spread absolute bg-no-repeat", `mascot-fx-spread-${path}`)}
      style={{
        ...box,
        ...picture,
        maskImage: SOFT_EDGE,
        WebkitMaskImage: SOFT_EDGE,
        ...timing(duration, -random() * duration),
      }}
    />
  );
}

/** 무지개: 왼쪽 끝에서 오른쪽 끝까지 띠가 그려졌다가 잠깐 머문 뒤 사라진다. */
function Wipe({ box, picture }: Part) {
  return (
    <span data-effect-piece="wipe" className="absolute" style={box}>
      <span className="mascot-fx-wipe absolute inset-0 bg-no-repeat" style={picture} />
    </span>
  );
}

// 열쇠가 도는 기운 타원(판에 대한 %)이며 index.css의 mascot-fx-spiral-front·back과 같은 식으로 만든다.
const ORBIT_RING = {
  front:
    "81.0,55.0 80.7,55.8 79.9,56.7 78.6,57.7 76.8,58.7 74.6,59.7 71.9,60.7 68.9,61.7 65.5,62.7 61.9,63.6 58.0,64.5 54.0,65.3 50.0,66.0 46.0,66.6 42.0,67.1 38.1,67.5 34.5,67.7 31.1,67.8 28.1,67.8 25.4,67.6 23.2,67.3 21.4,66.9 20.1,66.4 19.3,65.7 19.0,65.0",
  back: "19.0,65.0 19.3,64.2 20.1,63.3 21.4,62.3 23.2,61.3 25.4,60.3 28.1,59.3 31.1,58.3 34.5,57.3 38.1,56.4 42.0,55.5 46.0,54.7 50.0,54.0 54.0,53.4 58.0,52.9 61.9,52.5 65.5,52.3 68.9,52.2 71.9,52.2 74.6,52.4 76.8,52.7 78.6,53.1 79.9,53.6 80.7,54.3 81.0,55.0",
} as const;

// 한 바퀴(index.css의 mascot-fx-spiral-key, 4.2초)를 열쇠 세 개가 고르게 나눠 시작 시점을 이만큼씩 어긋나게 둔다.
const ORBIT_GAP_SECONDS = 1.4;

/**
 * 열쇠 고리: 열쇠마다 몸 둘레의 기운 타원을 돌며 앞으로 올 때는 크고 선명하게, 뒤로 갈 때는 작고 흐리게 보인다.
 *
 * 같은 열쇠를 몸 뒤 층과 몸 앞 층에 하나씩 두고 같은 박자로 돌린다.
 * 몸 뒤 층은 궤도 뒤쪽 반에서만, 몸 앞 층은 앞쪽 반에서만 보여서 열쇠가 몸 앞뒤를 오가며 이어져 보인다.
 * 층이 바뀌는 순간은 열쇠가 몸 옆 끝에 있을 때라 끊겨 보이지 않는다.
 */
function Spiral({ box, picture, index, side }: Part & { index: number; side: OrbitSide }) {
  return (
    <span data-effect-piece="spiral" data-orbit-side={side} className="absolute inset-0">
      {index === 0 && (
        <svg
          aria-hidden="true"
          viewBox="0 0 100 100"
          data-orbit-ring={side}
          className="mascot-fx-spiral-rings absolute inset-0 size-full"
        >
          <polyline className="mascot-fx-spiral-ring-glow" points={ORBIT_RING[side]} />
          <polyline className="mascot-fx-spiral-ring" points={ORBIT_RING[side]} />
        </svg>
      )}
      {/* 판 크기 상자가 궤도를 돌아서 이동 거리를 판에 대한 %로 쓸 수 있고, 열쇠 그림은 그 안 가운데에 둔다. */}
      <span
        className={cn(
          "mascot-fx-spiral-key absolute inset-0",
          side === "front" ? "mascot-fx-spiral-front" : "mascot-fx-spiral-back",
        )}
        style={{ animationDelay: `${-index * ORBIT_GAP_SECONDS}s` }}
      >
        <span
          className="absolute bg-no-repeat"
          style={{
            ...picture,
            left: `calc(50% - ${String(box.width)} / 2)`,
            top: `calc(60% - ${String(box.height)} / 2)`,
            width: box.width,
            height: box.height,
          }}
        />
      </span>
    </span>
  );
}

// 3초 안에 딱 맞게 도는 길이만 써서 긴 화면에서도 박자가 어긋나지 않게 되풀이된다.
const BEATS = [0.75, 1, 1.5];

/** 밤하늘 원판: 몸에 가리지 않는 가장자리 쪽에서 반짝이는 별 */
const STARS = Array.from({ length: 9 }, (_, i) => {
  const random = seeded(i * 23 + 7);
  const angle = (i / 9) * Math.PI * 2 + random() * 0.5;
  const radius = 36 + random() * 9;
  return {
    left: 50 + radius * Math.cos(angle),
    top: 50 + radius * Math.sin(angle),
    size: 4 + random() * 4,
    duration: BEATS[i % 3],
    delay: -random() * 1.5,
  };
});

/** 밤하늘 원판: 원판이 아주 천천히 돌고 별이 반짝이며 가끔 별똥별이 지나간다. */
function Starry({ box, picture }: Part) {
  return (
    <span data-effect-piece="starry" className="absolute" style={box}>
      <span className="mascot-fx-starry-disc absolute inset-0 bg-no-repeat" style={picture} />
      {STARS.map((star, index) => (
        <span
          key={index}
          // 작은 크기에서는 둘레에 고르게 남도록 두 개 걸러 하나씩 남긴다.
          data-fx-detail={index % 2 === 0 && index < 8 ? undefined : ""}
          className="mascot-fx-star absolute aspect-square"
          style={{
            left: pct(star.left - star.size / 2),
            top: pct(star.top - star.size / 2),
            width: pct(star.size),
            ...timing(star.duration, star.delay),
          }}
        />
      ))}
      {/* 원판 안에서만 지나가도록 길을 짧게 잡아 따로 잘라 내지 않는다(잘라 내면 도는 원판을 매번 다시 그린다). */}
      <span data-fx-detail="" className="mascot-fx-meteor-path absolute inset-0">
        <span className="mascot-fx-meteor absolute" />
      </span>
    </span>
  );
}

/** 오로라: 띠가 물결처럼 흔들리며 빛이 흘러가고 색이 천천히 바뀐다. */
function Flow({ box, picture }: Part) {
  return (
    <span data-effect-piece="flow" className="mascot-fx-flow-wave absolute" style={box}>
      <span className="mascot-fx-flow-color absolute inset-0 bg-no-repeat" style={picture} />
      <span className="absolute inset-0 overflow-hidden" style={shapeOf(picture)}>
        <span className="mascot-fx-flow-shine absolute inset-y-0 left-0 w-2/5" />
      </span>
    </span>
  );
}

/** 플래시 섬광: 짧고 강하게 번쩍인 뒤 잔광이 남았다 사라지고 잠시 쉰다. */
function Flash({ box, picture }: Part) {
  return (
    <span data-effect-piece="flash" className="absolute" style={box}>
      <span className="mascot-fx-flash-burst absolute inset-0 bg-no-repeat" style={picture} />
      <span className="mascot-fx-flash-light absolute inset-0 rounded-full" />
    </span>
  );
}

/** 필름 카운트다운: 원 안이 시계 방향으로 쓸리고 위쪽 숫자가 3·2·1로 바뀐다. */
function Countdown({ box, picture }: Part) {
  return (
    <span data-effect-piece="countdown" className="absolute" style={box}>
      <span className="absolute inset-0 bg-no-repeat" style={picture} />
      <span className="mascot-fx-countdown-sweep absolute inset-[9%] rounded-full" />
      <span className="mascot-fx-countdown-badge absolute top-0 left-1/2 aspect-square w-[17%] -translate-x-1/2 rounded-full">
        {["3", "2", "1"].map((digit, index) => (
          <span
            key={digit}
            className="mascot-fx-countdown-digit absolute inset-0 flex items-center justify-center"
            style={{ animationDelay: `${index === 0 ? 0 : index - 3}s` }}
          >
            {digit}
          </span>
        ))}
      </span>
    </span>
  );
}

/** 열쇠 고리처럼 몸 둘레를 도는 조각이 지금 그려지는 층 */
export type OrbitSide = "back" | "front";

/**
 * 코드로 그리는 효과 조각 하나
 *
 * 서버가 준 효과 그림 조각을 바탕으로 쓰고, 빛·입자·선·가림막을 코드로 더해 그려서 새 그림이 필요 없다.
 * 움직임은 transform과 opacity만 바꿔 합성 단계에서 돌고, 입자 모양은 늘 같은 씨앗으로 만들어 화면마다 같다.
 * 모션 축소를 켠 기기에서는 더한 것을 숨기고 그림만 멈춰 보인다(index.css).
 * 마스코트가 작게 여러 마리 보이는 화면에서는 data-fx-detail을 붙인 부분을 index.css가 덜어 낸다.
 */
export function DrawnEffectPiece({
  motion,
  piece,
  index,
  side,
  box,
  picture,
}: {
  motion: DrawnMotion;
  piece: EffectPiece;
  index: number;
  side: OrbitSide;
  box: CSSProperties;
  picture: CSSProperties;
}) {
  const part = { box, picture };
  switch (motion) {
    case "glow":
      return <Glow {...part} />;
    case "ripple":
      return <Ripple {...part} piece={piece} />;
    case "drift":
      return <Drift {...part} piece={piece} index={index} />;
    case "spread":
      return <Spread {...part} piece={piece} index={index} />;
    case "wipe":
      return <Wipe {...part} />;
    case "spiral":
      return <Spiral {...part} index={index} side={side} />;
    case "starry":
      return <Starry {...part} />;
    case "flow":
      return <Flow {...part} />;
    case "flash":
      return <Flash {...part} />;
    case "countdown":
      return <Countdown {...part} />;
  }
}
