import { cn } from "@/lib/utils";

import type { DeskTone } from "../model/desks";

// `--feedback-success`는 `.theme-soft-blue` 안에서만 값이 있어 그 바탕 밖에 그리면 다른 곳에서 공부 중인 초록이 빠진다.
const PERSON_STROKE = {
  room: "stroke-primary",
  elsewhere: "stroke-feedback-success",
  rest: "stroke-text-tertiary",
  empty: "stroke-text-tertiary",
} as const;

/**
 * 크기마다 다른 모양
 *
 * 작은 책상은 같은 그림을 줄이므로 선이 가늘어져 흐려지지 않게 그림 좌표 기준 굵기를 따로 둔다.
 */
const SIZE = {
  md: { box: "h-15 w-16", person: 2.8, dashed: 2.4, top: 3, legs: 2.4 },
  sm: { box: "h-8 w-8.5", person: 3.8, dashed: 3.3, top: 3.8, legs: 3 },
} as const;

/**
 * 책상에 앉은 사람 그림
 *
 * 나중에 커스텀 캐릭터로 갈아 끼우도록 사람과 책상을 이 부품 하나로 감싼다.
 * 상태는 칸의 이름이나 옆 글자가 알려 주므로 그림은 화면 낭독기에서 뺀다.
 */
export function DeskFigure({ tone, size }: { tone: DeskTone | "empty"; size: "md" | "sm" }) {
  const look = SIZE[size];
  const empty = tone === "empty";
  return (
    <svg viewBox="0 0 64 60" aria-hidden="true" className={cn("shrink-0", look.box)}>
      <g
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={empty ? look.dashed : look.person}
        strokeDasharray={empty ? "3 3" : undefined}
        className={PERSON_STROKE[tone]}
      >
        <circle cx="32" cy="17" r="7" />
        <path d="M17 45 V38 C17 33 21 29.5 26 29.5 H38 C43 29.5 47 33 47 38 V45" />
      </g>
      <g fill="none" strokeLinecap="round" className="stroke-border-strong">
        <path d="M6 46 H58" strokeWidth={look.top} />
        <path d="M11 47 V58 M53 47 V58" strokeWidth={look.legs} />
      </g>
      {/* 작은 책상에서는 글자가 너무 작아 읽히지 않아 쉼 표시를 그리지 않는다. */}
      {tone === "rest" && size === "md" && (
        <g className="font-bold">
          <text x="44" y="11.7" fontSize="9" className="fill-state-pause">
            z
          </text>
          <text x="50.3" y="5.5" fontSize="6.8" className="fill-text-disabled">
            z
          </text>
        </g>
      )}
    </svg>
  );
}
