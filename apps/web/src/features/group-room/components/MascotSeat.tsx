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
 * 타이미 실루엣을 몸 원, 꼭지 캡슐, 옆 버튼 캡슐, 두 발 원으로 다시 짜고 눈 구멍은 뺐다.
 * 모양끼리 만나는 오목한 이음매를 작은 원호로 둥글려서 선이 꺾이지 않고 이어진다.
 * 좌표는 실루엣 상자 기준이고, 실루엣 상자는 마스코트 판에서 (55, 35)에 놓여 있어 그만큼 옮겨 그리면 타이미가 앉는 자리와 겹친다.
 */
const TIMI_OUTLINE =
  "M81 0H129A17 17 0 0 1 141.52 28.5A6 6 0 0 0 143.61 38.09A103.5 103.5 0 0 1 154.37 43.36A6 6 0 0 0 163.06 39.87A14 14 0 0 1 185.66 33.34L196.22 42.53A14 14 0 0 1 191.9 66.22A6 6 0 0 0 189.03 75.22A103.5 103.5 0 0 1 164.1 217.41A6 6 0 0 0 162.54 225.47A16 16 0 1 1 133.66 238.54A6 6 0 0 0 126.57 234.4A103.5 103.5 0 0 1 81.32 234.59A6 6 0 0 0 74.3 238.69A16 16 0 1 1 45.24 225.83A6 6 0 0 0 43.56 217.88A103.5 103.5 0 0 1 65.48 37.24A6 6 0 0 0 67.9 27.83A17 17 0 0 1 81 0Z";

const SEAT_BOX: Record<DeskSize, string> = {
  lg: "w-26",
  md: "w-full max-w-26",
  sm: "w-full max-w-14",
};

/**
 * 크기마다 윤곽 점의 수와 지름
 *
 * 경로 길이를 점 수로 나눠 점을 고르게 놓으므로 둘레 어디에도 간격이 어긋난 이음매가 생기지 않는다.
 * 점 수는 둘레 길이에 맞췄고, 지름은 그림 좌표라 화면에서 큰 자리는 약 1.9px, 작은 자리는 약 1.6px이다.
 */
const OUTLINE_DOTS: Record<DeskSize, { count: number; width: number }> = {
  lg: { count: 60, width: 9 },
  md: { count: 60, width: 9 },
  sm: { count: 30, width: 15.5 },
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
  const dots = OUTLINE_DOTS[size];
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
            pathLength={dots.count}
            strokeWidth={dots.width}
            strokeDasharray="0 1"
            // 닫힌 경로는 처음과 끝이 같은 자리라 반 칸 밀어 두어야 그 자리에 점이 겹쳐 찍히지 않는다.
            strokeDashoffset={-0.5}
            strokeLinecap="round"
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
