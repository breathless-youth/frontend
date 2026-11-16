import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";

import {
  ACCESSORY_BOARD_OUTSET,
  HIDE_MASCOT_UNDER_SET,
  splitAccessoryLayers,
  type AccessoryLayerImage,
  type GlowType,
} from "./mascotLayers";
import { MASCOT_SRC } from "./mascotSources";
import type { EffectPiece, MascotId, WornAccessory } from "./types";

const LAYER = "absolute inset-0 size-full object-contain";
const BOARD: CSSProperties = { inset: ACCESSORY_BOARD_OUTSET };
// 그림은 inset만으로 늘어나지 않아 넓어진 판의 한 변을 직접 준다(1440 / 1024).
const BOARD_IMAGE: CSSProperties = { ...BOARD, width: "140.625%", height: "140.625%" };

// Tailwind가 클래스를 찾도록 문자열을 통째로 둔다. 표에 없는 움직임은 멈춘 그림으로 그린다.
const PIECE_MOTION: ReadonlyMap<string, string> = new Map(
  Object.entries({
    float: "animate-[mascot-fx-float_3.2s_ease-in-out_infinite]",
    fall: "animate-[mascot-fx-fall_1.5s_ease-in_infinite]",
    rise: "animate-[mascot-fx-rise_2.6s_ease-in-out_infinite]",
    twinkle: "animate-[mascot-fx-twinkle_1.8s_ease-in-out_infinite]",
    flutter: "animate-[mascot-fx-flutter_2.6s_ease-in-out_infinite]",
    pulse: "animate-[mascot-fx-pulse_1.6s_ease-in-out_infinite]",
    sway: "animate-[mascot-fx-sway_2.4s_ease-in-out_infinite]",
    bob: "animate-[mascot-fx-bob_3s_ease-in-out_infinite]",
    pop: "animate-[mascot-fx-pop_2.4s_ease-in-out_infinite]",
  }),
);

/** 비율을 CSS 퍼센트 글자로 바꾸며 긴 소수는 넷째 자리에서 끊는다. */
function percent(ratio: number) {
  return `${Number((ratio * 100).toFixed(4))}%`;
}

/** 조각이 판의 어디에 있는지를 배경 위치 값으로 바꾸며 판을 꽉 채운 조각은 밀 곳이 없어 0이다. */
function backgroundOffset(start: number, size: number) {
  return size >= 1 ? "0%" : percent(start / (1 - size));
}

/**
 * 효과 그림에서 잘라 낸 조각 하나
 *
 * 그림 한 장을 배경으로 깔고 조각 자리만 보이게 해서 조각마다 따로 움직인다.
 * 조각들이 같은 박자로 움직이면 기계처럼 보여서 시작 시점을 조각마다 어긋나게 둔다.
 */
function EffectPieceLayer({
  imageUrl,
  piece,
  index,
}: {
  imageUrl: string;
  piece: EffectPiece;
  index: number;
}) {
  const motion = PIECE_MOTION.get(piece.motion);
  return (
    <span
      data-effect-piece={motion === undefined ? "still" : piece.motion}
      className={cn("absolute bg-no-repeat motion-reduce:animate-none", motion)}
      style={{
        left: percent(piece.x),
        top: percent(piece.y),
        width: percent(piece.width),
        height: percent(piece.height),
        backgroundImage: `url(${imageUrl})`,
        backgroundSize: `${percent(1 / piece.width)} ${percent(1 / piece.height)}`,
        backgroundPosition: `${backgroundOffset(piece.x, piece.width)} ${backgroundOffset(piece.y, piece.height)}`,
        animationDelay: `${(-0.43 * index).toFixed(2)}s`,
      }}
    />
  );
}

/**
 * 소품 그림 한 겹
 *
 * 조각 정보가 있으면 조각마다 움직이고, 없는 효과 그림은 통째로 천천히 떠오르내린다.
 * 모션 축소를 켠 기기에서는 멈춘 그림으로 보인다.
 */
function AccessoryLayer({ layer }: { layer: AccessoryLayerImage }) {
  if (layer.pieces !== undefined) {
    return (
      <span data-slot={`accessory-${layer.key}`} className="absolute" style={BOARD}>
        {layer.pieces.map((piece, index) => (
          <EffectPieceLayer key={index} imageUrl={layer.imageUrl} piece={piece} index={index} />
        ))}
      </span>
    );
  }
  return (
    <img
      src={layer.imageUrl}
      alt=""
      draggable={false}
      data-slot={`accessory-${layer.key}`}
      className={cn(
        // 전역 img의 max-width: 100%가 넓힌 폭을 상자 폭으로 잘라 그림이 가로로 눌리지 않게 푼다.
        "absolute max-w-none object-contain",
        layer.floats &&
          "animate-[mascot-effect-float_3.2s_ease-in-out_infinite] motion-reduce:animate-none",
      )}
      // 판이 넓어진 만큼 상자도 넓혀야 그림 속 마스코트 자리가 몸과 맞는다.
      style={BOARD_IMAGE}
    />
  );
}

/**
 * 몸 뒤에 코드로 그리는 빛
 *
 * 마스코트 그림을 가림막으로 써서 윤곽을 따라 번지므로 그림을 따로 만들지 않는다.
 * 색과 움직임은 종류마다 index.css에 있고 모션 축소를 켠 기기에서는 멈춘다.
 */
function GlowLayer({ type, id }: { type: GlowType; id: MascotId }) {
  const mask = `url(${MASCOT_SRC[id]})`;
  return (
    // 번짐 크기를 상자 폭에 비례시키려고 바깥을 컨테이너로 두고 그 안쪽을 흐린다.
    <span data-slot="mascot-glow" data-glow={type} className="mascot-glow absolute inset-0">
      <span className={cn("mascot-glow-blur absolute inset-0", `mascot-glow-${type}`)}>
        <span
          data-glow-shape=""
          className="absolute inset-0"
          style={{
            maskImage: mask,
            WebkitMaskImage: mask,
            maskSize: "100% 100%",
            WebkitMaskSize: "100% 100%",
          }}
        />
      </span>
    </span>
  );
}

/**
 * 고른 마스코트와 끼고 있는 소품을 겹쳐 그린 그림
 *
 * 상자는 마스코트 판 크기의 정사각형이고 크기와 자리는 쓰는 화면이 className으로 정한다.
 * 소품 그림은 마스코트 판보다 사방으로 넓은 판이라 상자 밖으로 조금 나가 그려지며, 그림 속 마스코트 자리는 몸과 정확히 겹친다.
 * 표정이 바뀌는 그림처럼 몸을 다르게 그리는 화면은 body로 몸 자리를 채운다.
 * 몸과 소품을 따로 움직이는 화면은 layerFrame을 넘겨 몸 뒤 층과 몸 앞 층을 판 크기 상자로 하나씩 감싼다.
 * 이름이나 상태는 옆 글자가 알려 주므로 그림은 화면 낭독기에서 뺀다.
 */
export function MascotFigure({
  id,
  accessories = [],
  body,
  layerFrame,
  className,
}: {
  id: MascotId;
  accessories?: readonly WornAccessory[];
  /** 기본 정지 그림 대신 몸 자리에 그릴 조각이며 상자를 꽉 채워야 소품이 맞는다. */
  body?: ReactNode;
  /** 소품 층을 감싸는 상자에 줄 클래스와 스타일이며 몸은 이 상자 밖에 그린다. */
  layerFrame?: { className?: string; style?: CSSProperties };
  className?: string;
}) {
  const { behind, front, glow, wearsSet } = splitAccessoryLayers(accessories);
  const behindLayers = (
    <>
      {glow !== null && <GlowLayer type={glow} id={id} />}
      {behind.map((accessory) => (
        <AccessoryLayer key={accessory.key} layer={accessory} />
      ))}
    </>
  );
  const frontLayers = front.map((accessory) => (
    <AccessoryLayer key={accessory.key} layer={accessory} />
  ));
  // 소품 그림의 판 위치가 이 상자 크기의 비율이라 감싸는 상자도 같은 크기여야 한다.
  const frame = (side: "behind" | "front", layers: ReactNode, empty: boolean) =>
    layerFrame === undefined || empty ? (
      layers
    ) : (
      <span
        data-layer-frame={side}
        className={cn("absolute inset-0", layerFrame.className)}
        style={layerFrame.style}
      >
        {layers}
      </span>
    );
  return (
    <span aria-hidden="true" className={cn("relative block aspect-square shrink-0", className)}>
      {frame("behind", behindLayers, glow === null && behind.length === 0)}
      {!(wearsSet && HIDE_MASCOT_UNDER_SET) && (
        <span data-slot="mascot-body" className="absolute inset-0">
          {body ?? <img src={MASCOT_SRC[id]} alt="" draggable={false} className={LAYER} />}
        </span>
      )}
      {frame("front", frontLayers, front.length === 0)}
    </span>
  );
}
