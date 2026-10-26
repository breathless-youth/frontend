import { useId, useRef } from "react";
import type { KeyboardEvent, PointerEvent } from "react";

import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

import {
  angleToMinute,
  clampDialValue,
  dialFraction,
  dialPoint,
  pointToDialAngle,
  stepDialDrag,
  tapDialDrag,
  wedgePath,
} from "../pomodoroDialMath";
import type { DialDrag, DialLimit } from "../pomodoroDialMath";

export type DialTone = "focus" | "break" | "distract";

const VIEW = 340;
const CENTER = VIEW / 2;
const WEDGE_R = 120;
const TICK_OUTER_R = 142;
const MAJOR_TICK_INNER_R = 128;
const MINOR_TICK_INNER_R = 135;
const NUMBER_R = 158;
const KNOB_R = 14;
/** 부채꼴 경로로는 360도를 그릴 수 없어 이 비율부터는 원으로 그린다. */
const FULL_FRACTION = 0.9997;

const TICKS = Array.from({ length: 60 }, (_, minute) => {
  const major = minute % 5 === 0;
  const deg = minute * 6;
  const [x1, y1] = dialPoint(CENTER, TICK_OUTER_R, deg);
  const [x2, y2] = dialPoint(CENTER, major ? MAJOR_TICK_INNER_R : MINOR_TICK_INNER_R, deg);
  return { minute, major, x1, y1, x2, y2 };
});
const MAJOR_TICKS = TICKS.filter((tick) => tick.major);
const MINOR_TICKS = TICKS.filter((tick) => !tick.major);
const NUMBERS = MAJOR_TICKS.map(({ minute }) => {
  const [x, y] = dialPoint(CENTER, NUMBER_R, minute * 6);
  return { minute, x, y };
});

const TONE_CLASS: Record<DialTone, string> = {
  focus: "text-(--session-mode-focus)",
  break: "text-(--session-mode-break)",
  distract: "text-state-distract",
};

const KEY_STEP: Partial<Record<string, number>> = {
  ArrowRight: 1,
  ArrowUp: 1,
  ArrowLeft: -1,
  ArrowDown: -1,
};

function Wedge({ fraction }: { fraction: number }) {
  if (fraction <= 0) return null;
  if (fraction >= FULL_FRACTION) {
    return <circle cx={CENTER} cy={CENTER} r={WEDGE_R} fill="currentColor" />;
  }
  return <path d={wedgePath(CENTER, WEDGE_R, fraction)} fill="currentColor" />;
}

/**
 * 뽀모도로 다이얼
 *
 * 한 바퀴가 60분이고, 넘친 시간은 뒤에 옅은 원과 바퀴 배지로 보인다.
 * 설정 중에는 손잡이를 돌리거나 화살표 키로 분을 바꾸고, 진행 중에는 남은 시간을 그리기만 한다.
 */
export function PomodoroDial({
  minutes,
  tone,
  interactive,
  label,
  limit,
  onChange,
}: {
  minutes: number;
  tone: DialTone;
  interactive: boolean;
  label: string;
  limit: DialLimit;
  onChange?: (minutes: number) => void;
}) {
  const drag = useRef<DialDrag | null>(null);
  const shadowId = `dial-knob-shadow-${useId().replace(/[^\w-]/g, "")}`;
  const { laps, fraction } = dialFraction(minutes);
  // 진행 중 값은 소수라, 시간 표기처럼 남은 분을 올려 읽힌다.
  const shownMinutes = Math.ceil(minutes);
  // 단계가 넘어가는 순간 0분이 될 수 있어 슬라이더 값은 범위 안으로 넣고, 읽는 글은 실제 값을 둔다.
  const reportedMinutes = clampDialValue(shownMinutes, limit);
  const [knobX, knobY] = dialPoint(CENTER, WEDGE_R, fraction * 360);

  // 손으로 돌릴 때만 분이 넘어갈 때마다 가볍게 울린다. 화살표 키 조작에는 손끝 감각이 필요 없다.
  const emit = (next: number, tick = false) => {
    if (next === shownMinutes) return;
    if (tick) haptic("light");
    onChange?.(next);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = KEY_STEP[event.key];
    if (step === undefined) return;
    event.preventDefault();
    emit(clampDialValue(shownMinutes + step, limit));
  };

  const pointerMinute = (event: PointerEvent<HTMLDivElement>): number | null => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    // 그려진 크기와 상관없이 viewBox 좌표로 환산해 각도를 잰다.
    const x = ((event.clientX - rect.left) / rect.width) * VIEW - CENTER;
    const y = ((event.clientY - rect.top) / rect.height) * VIEW - CENTER;
    return angleToMinute(pointToDialAngle(x, y));
  };

  const follow = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (current === null) return;
    const minute = pointerMinute(event);
    if (minute === null) return;
    const next = stepDialDrag(current, minute, limit);
    drag.current = next.drag;
    emit(next.value, true);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const minute = pointerMinute(event);
    if (minute === null) return;
    const next = tapDialDrag(shownMinutes, minute, limit);
    drag.current = next.drag;
    emit(next.value, true);
  };

  const handlePointerEnd = () => {
    drag.current = null;
  };

  return (
    <div
      role="slider"
      aria-label={label}
      aria-valuemin={limit.min}
      aria-valuemax={limit.max}
      aria-valuenow={reportedMinutes}
      aria-valuetext={`${shownMinutes}분`}
      aria-disabled={interactive ? undefined : true}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? handleKeyDown : undefined}
      onPointerDown={interactive ? handlePointerDown : undefined}
      onPointerMove={interactive ? follow : undefined}
      onPointerUp={interactive ? handlePointerEnd : undefined}
      onPointerCancel={interactive ? handlePointerEnd : undefined}
      className={cn(
        // 키 작은 폰에서도 카드·큰 버튼과 한 화면에 들어오게 화면 높이에 맞춰 줄인다.
        // 340px은 헤더와 큰 버튼 자리 약 220, 카드 자리 78, 알림음 줄 24, 여유 18을 더한 값이다.
        "relative aspect-square w-[min(370px,100%,max(220px,calc(100svh-340px)))] rounded-full select-none focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none",
        // 가로 폰에서는 모드 화면이 정한 무대를 가득 채운다.
        "landscape-compact:w-(--timer-stage)",
        interactive && "cursor-grab touch-none",
        TONE_CLASS[tone],
      )}
    >
      <svg viewBox={`0 0 ${VIEW} ${VIEW}`} aria-hidden="true" className="block size-full">
        {/* CSS drop-shadow 필터는 WKWebView의 SVG 도형에 그려지지 않을 수 있어 SVG 필터로 그린다. */}
        <defs>
          <filter id={shadowId} x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx={0} dy={2} stdDeviation={3} floodColor="black" floodOpacity={0.4} />
          </filter>
        </defs>
        <g className="stroke-white/28" strokeWidth={2} strokeLinecap="round">
          {MINOR_TICKS.map(({ minute, x1, y1, x2, y2 }) => (
            <line key={minute} x1={x1} y1={y1} x2={x2} y2={y2} />
          ))}
        </g>
        <g
          className="text-foreground"
          stroke="currentColor"
          strokeWidth={3.5}
          strokeLinecap="round"
        >
          {MAJOR_TICKS.map(({ minute, x1, y1, x2, y2 }) => (
            <line key={minute} x1={x1} y1={y1} x2={x2} y2={y2} />
          ))}
        </g>
        <g className="fill-muted-foreground text-[15px] font-semibold">
          {NUMBERS.map(({ minute, x, y }) => (
            <text key={minute} x={x} y={y} textAnchor="middle" dominantBaseline="central">
              {minute}
            </text>
          ))}
        </g>
        {laps > 0 && (
          <circle cx={CENTER} cy={CENTER} r={WEDGE_R} fill="currentColor" opacity={0.3} />
        )}
        <Wedge fraction={fraction} />
        {interactive && (
          <circle
            cx={knobX}
            cy={knobY}
            r={KNOB_R}
            strokeWidth={1.5}
            filter={`url(#${shadowId})`}
            className="fill-white stroke-black/25"
          />
        )}
      </svg>
      {laps > 0 && (
        <span className="pointer-events-none absolute -top-1.5 left-1/2 -translate-x-1/2 rounded-full bg-primary px-2.5 py-1 text-xs leading-4 font-bold whitespace-nowrap text-primary-foreground">
          {laps + 1}바퀴째
        </span>
      )}
    </div>
  );
}
