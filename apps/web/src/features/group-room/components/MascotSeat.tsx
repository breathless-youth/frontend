import type { CSSProperties } from "react";

import { MASCOT_FOOT_Y } from "@/components/mascot/mascotExpressions";
import { MascotFigure } from "@/components/mascot/MascotFigure";
import { splitAccessoryLayers } from "@/components/mascot/mascotLayers";
import type { MascotId, MascotLook } from "@/components/mascot/types";
import { cn } from "@/lib/utils";

import type { DeskTone } from "../model/desks";

export type DeskSize = "sm" | "md" | "lg";

/** 모습이 비어 있는 멤버에게 앉히는 기본 마스코트 */
const DEFAULT_LOOK: MascotLook = { id: "stopwatch", accessories: [] };

// 아래 위치 숫자는 모두 이 크기의 자리 한 칸에서 잰 값이고, 실제 크기는 쓰는 화면이 정해 비율대로 줄고 는다.
const SEAT_W = 104;
const SEAT_H = 114;
/** 마스코트 판이 놓이는 정사각형 자리 */
const BODY = { left: 18, top: 42, size: 68 } as const;

/**
 * 마스코트 정지 그림에서 측정한 몸 폭
 *
 * 마스코트 판 한 변에 대한 비율이고 바닥 그림자 폭을 몸에 맞추는 데 쓴다.
 * 마스코트 그림을 바꾸면 다시 측정한다.
 */
const BODY_WIDTH: Record<MascotId, number> = {
  book: 235 / 320,
  planner: 205 / 320,
  pencil: 188 / 320,
  stopwatch: 207 / 320,
  lamp: 225 / 320,
  padlock: 186 / 320,
  camcorder: 209 / 320,
};

/**
 * 타이미 그림의 바깥 윤곽
 *
 * 타이미 정지 그림의 실루엣에서 눈 구멍을 뺀 테두리이며 좌표는 실루엣 상자 기준이다.
 * 실루엣 상자는 마스코트 판에서 (55, 35)에 놓여 있어 그만큼 옮겨 그리면 타이미가 앉는 자리와 겹친다.
 */
const TIMI_OUTLINE =
  "M129 0C138.389 0 146 7.61116 146 17C146 25.5543 139.681 32.6305 131.457 33.8213C143.087 37.0763 153.89 42.3101 163.479 49.1396C161.581 44.4182 162.334 38.8267 165.901 34.7227C170.974 28.8874 179.817 28.2692 185.652 33.3418L196.218 42.5264C202.053 47.599 202.671 56.4419 197.599 62.2773C193.661 66.8063 187.454 68.1909 182.144 66.2129C197.639 84.3067 207 107.81 207 133.5C207 170.431 187.656 202.843 158.548 221.16C162.464 224.077 165 228.742 165 234C165 242.837 157.837 250 149 250C140.163 250 133 242.837 133 234C133 233.569 133.017 233.142 133.051 232.72C123.687 235.504 113.768 237 103.5 237C93.6036 237 84.0321 235.609 74.9688 233.016C74.9885 233.341 75 233.669 75 234C75 242.837 67.8366 250 59 250C50.1634 250 43 242.837 43 234C43 228.945 45.3437 224.438 49.0039 221.506C19.5888 203.252 0 170.664 0 133.5C0 85.5699 32.5805 45.2507 76.8027 33.4775C69.4438 31.6087 64 24.9403 64 17C64 7.61116 71.6112 0 81 0H129Z";

const SEAT_BOX: Record<DeskSize, string> = {
  lg: "w-26",
  md: "w-full max-w-26",
  sm: "w-full max-w-14",
};

// 윤곽 선은 화면 픽셀 기준이라 자리 크기가 달라도 같은 굵기로 보이며, 작은 자리만 가늘게 둔다.
const OUTLINE_STROKE: Record<DeskSize, { width: number; dash: string }> = {
  lg: { width: 2, dash: "4 3" },
  md: { width: 2, dash: "4 3" },
  sm: { width: 1.25, dash: "2.5 2" },
};

// 범례 점과 같은 색이고, 꺼진 전등은 쉬는 중이 빈자리보다 한 단계 진하다.
const SHADE: Record<DeskTone | "empty", string> = {
  room: "bg-primary",
  elsewhere: "bg-feedback-success",
  rest: "bg-text-tertiary",
  empty: "bg-border-strong",
};

const LIGHT: Partial<Record<DeskTone | "empty", string>> = {
  room: "from-primary/32 to-primary/4",
  elsewhere: "from-feedback-success/30 to-feedback-success/4",
};

const SHADOW_LAYER = "radial-gradient(closest-side, var(--result-mascot-shadow), transparent)";

/**
 * 바닥 그림자 진하기
 *
 * 그림자 토큰 한 겹은 쉬는 중의 진하기라 공부 중에는 두 겹을 겹쳐 더 진하게 둔다.
 * 빈자리는 한 겹을 더 흐리게 해서 아무도 앉지 않은 자리로 보이게 한다.
 */
const SHADOW: Record<DeskTone | "empty", CSSProperties> = {
  room: { backgroundImage: `${SHADOW_LAYER}, ${SHADOW_LAYER}` },
  elsewhere: { backgroundImage: `${SHADOW_LAYER}, ${SHADOW_LAYER}` },
  rest: { backgroundImage: SHADOW_LAYER },
  empty: { backgroundImage: SHADOW_LAYER, opacity: 0.6 },
};

function percent(ratio: number) {
  return `${Number((ratio * 100).toFixed(3))}%`;
}

/** 자리 한 칸 좌표의 사각형을 자리 크기에 대한 비율 위치로 바꾼다. */
function place(left: number, top: number, width: number, height: number): CSSProperties {
  return {
    left: percent(left / SEAT_W),
    top: percent(top / SEAT_H),
    width: percent(width / SEAT_W),
    height: percent(height / SEAT_H),
  };
}

/** 발끝이 그림자 가운데보다 조금 아래에 닿아 그림자 위에 서 있는 것처럼 보이게 둔다. */
function shadowBox(id: MascotId): CSSProperties {
  const width = BODY.size * BODY_WIDTH[id];
  const centerY = BODY.top + BODY.size * MASCOT_FOOT_Y[id] - 2.5;
  return place(SEAT_W / 2 - width / 2, centerY - 6, width, 12);
}

/**
 * 천장 전등 아래에 앉은 마스코트 자리
 *
 * 공부 상태는 전등갓 색으로 알리고, 공부 중일 때만 전등을 켜서 빛줄기를 내린다.
 * 바닥 그림자는 상태와 상관없는 중립 색이고, 발밑 소품을 끼면 그 소품이 바닥이라 그림자를 그리지 않는다.
 * 빈자리는 꺼진 전등 아래 타이미 모양 점선 윤곽만 그리고 속은 비운다.
 * 상태는 칸의 이름이나 옆 글자가 알려 주므로 그림은 화면 낭독기에서 뺀다.
 */
export function MascotSeat({
  tone,
  size,
  look,
}: {
  tone: DeskTone | "empty";
  size: DeskSize;
  /** 비어 있으면 기본 마스코트를 앉히며 빈자리에서는 쓰지 않는다. */
  look?: MascotLook;
}) {
  const empty = tone === "empty";
  const seated = look ?? DEFAULT_LOOK;
  const { behind, front } = splitAccessoryLayers(seated.accessories);
  const grounded = !empty && [...behind, ...front].some((layer) => layer.slot === "underfoot");
  const light = LIGHT[tone];
  const stroke = OUTLINE_STROKE[size];
  return (
    <span
      aria-hidden="true"
      data-slot="mascot-seat"
      className={cn("relative block aspect-104/114 shrink-0", SEAT_BOX[size])}
    >
      <span className="absolute bg-border-strong" style={place(51, 0, 2, 10)} />
      <span
        data-slot="seat-lamp"
        data-lamp={light === undefined ? "off" : "on"}
        className={cn("absolute", SHADE[tone])}
        style={{ ...place(38, 9, 28, 14), borderRadius: "50% 50% 14% 14% / 100% 100% 29% 29%" }}
      />
      {light !== undefined && (
        <span
          data-slot="seat-light"
          className={cn("absolute bg-linear-to-b", light)}
          style={{ ...place(12, 22, 80, 82), clipPath: "polygon(38% 0, 62% 0, 100% 100%, 0 100%)" }}
        />
      )}
      {!grounded && (
        <span
          data-slot="seat-shadow"
          className="absolute rounded-[50%]"
          style={{ ...shadowBox(seated.id), ...SHADOW[tone] }}
        />
      )}
      {empty ? (
        <svg
          data-slot="vacant-mascot"
          viewBox="0 0 320 320"
          className="absolute overflow-visible"
          style={place(BODY.left, BODY.top, BODY.size, BODY.size)}
        >
          <path
            d={TIMI_OUTLINE}
            transform="translate(55 35)"
            fill="none"
            strokeWidth={stroke.width}
            strokeDasharray={stroke.dash}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            className="stroke-text-tertiary"
          />
        </svg>
      ) : (
        <span
          data-resting={tone === "rest" || undefined}
          className={cn("absolute", tone === "rest" && "brightness-115 grayscale")}
          style={place(BODY.left, BODY.top, BODY.size, BODY.size)}
        >
          <MascotFigure id={seated.id} accessories={seated.accessories} className="size-full" />
        </span>
      )}
      {/* 작은 자리에서는 글자가 너무 작아 읽히지 않아 쉼 표시를 그리지 않는다. */}
      {tone === "rest" && size !== "sm" && (
        <svg
          viewBox={`0 0 ${SEAT_W} ${SEAT_H}`}
          className="absolute inset-0 size-full fill-muted-foreground font-bold"
        >
          <text x="79" y="50" fontSize="12">
            z
          </text>
          <text x="86.5" y="44" fontSize="9">
            z
          </text>
        </svg>
      )}
    </span>
  );
}
