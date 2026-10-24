import { Fragment, useEffect, useRef } from "react";
import type { KeyboardEvent, PointerEvent } from "react";

import { clampTimerSec } from "../multiTimerSettings";
import { joinTimerSec, splitTimerSec } from "../multiTimerFormat";

type Unit = "h" | "m" | "s";

const COLUMNS: ReadonlyArray<{ unit: Unit; label: string; size: number }> = [
  { unit: "h", label: "시간", size: 24 },
  { unit: "m", label: "분", size: 60 },
  { unit: "s", label: "초", size: 60 },
];

const OFFSETS = [-3, -2, -1, 0, 1, 2, 3] as const;
const COLUMN_HEIGHT = 300;
const DRAG_STEP_PX = 46;

function mod(value: number, size: number): number {
  return ((value % size) + size) % size;
}

function rowOpacity(offset: number): string {
  const distance = Math.abs(offset);
  if (distance === 0) return "opacity-100";
  return distance === 1 ? "opacity-45" : "opacity-20";
}

interface WheelColumnProps {
  label: string;
  size: number;
  value: number;
  onSelect: (value: number) => void;
}

function WheelColumn({ label, size, value, onSelect }: WheelColumnProps) {
  const drag = useRef<{ y0: number; v0: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  const step = (delta: number) => onSelect(mod(value + delta, size));

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      step(1);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      step(-1);
    }
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    drag.current = { y0: event.clientY, v0: value, moved: false };
    suppressClick.current = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    // 화면에 그려진 높이와 논리 높이가 다를 수 있어 논리 좌표로 환산한다.
    const scale = rect.height > 0 ? COLUMN_HEIGHT / rect.height : 1;
    const steps = Math.round(((event.clientY - current.y0) * scale) / DRAG_STEP_PX);
    if (steps !== 0) {
      current.moved = true;
      suppressClick.current = true;
    }
    const next = mod(current.v0 - steps, size);
    if (next !== value) onSelect(next);
  };

  const handlePointerEnd = () => {
    drag.current = null;
  };

  const wheelRef = useRef<HTMLDivElement>(null);
  const latestStep = useRef(step);
  useEffect(() => {
    latestStep.current = step;
  });

  // React의 wheel 리스너는 passive라 preventDefault가 먹지 않는다.
  // 열 위에서 굴린 휠이 바깥 시트까지 스크롤하지 않도록 네이티브 리스너를 직접 건다.
  useEffect(() => {
    const el = wheelRef.current;
    if (!el) return;
    // 트랙패드는 한 번 쓸 때 몇 px짜리 이벤트를 수십 개 보내서 이벤트마다 넘기면 값이 튄다.
    // 그래서 픽셀 단위는 한 행 높이만큼 모일 때마다 한 칸 넘기고, 줄·쪽 단위인 마우스 휠은 한 번에 한 칸 넘긴다.
    // 한 이벤트에서는 한 칸만 넘겨 한 번 굴린 마우스 휠이 여러 칸을 건너뛰지 않게 한다.
    let pending = 0;
    const onWheel = (event: globalThis.WheelEvent) => {
      event.preventDefault();
      if (event.deltaY === 0) return;
      const direction = event.deltaY > 0 ? 1 : -1;
      if (event.deltaMode !== event.DOM_DELTA_PIXEL) {
        pending = 0;
        latestStep.current(direction);
        return;
      }
      // 방향을 바꾸면 반대쪽으로 모인 양이 새 방향의 첫 칸을 늦추지 않게 버린다.
      if (Math.sign(pending) === -direction) pending = 0;
      pending += event.deltaY;
      if (Math.abs(pending) < DRAG_STEP_PX) return;
      pending %= DRAG_STEP_PX;
      latestStep.current(direction);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center">
      <div
        role="spinbutton"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={size - 1}
        aria-valuenow={value}
        aria-valuetext={`${value}${label}`}
        ref={wheelRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        className="relative h-75 w-full touch-none select-none rounded-md focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none"
        style={{ transformStyle: "preserve-3d" }}
      >
        <div
          className="absolute inset-0 overflow-hidden"
          style={{
            transformStyle: "preserve-3d",
            maskImage:
              "linear-gradient(180deg, transparent 0%, #000 30%, #000 70%, transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(180deg, transparent 0%, #000 30%, #000 70%, transparent 100%)",
          }}
        >
          {OFFSETS.map((offset) => {
            const rowValue = mod(value + offset, size);
            const center = offset === 0;
            return (
              <div
                key={offset}
                aria-hidden="true"
                onClick={() => {
                  if (suppressClick.current) {
                    suppressClick.current = false;
                    return;
                  }
                  if (!center) onSelect(rowValue);
                }}
                className={`absolute inset-x-0 top-1/2 -mt-5.75 flex h-11.5 cursor-pointer items-center justify-center font-bold tabular-nums text-foreground transition-opacity motion-reduce:transition-none ${
                  center ? "text-[48px]" : "text-[38px]"
                } ${rowOpacity(offset)}`}
                style={{
                  transform: `rotateX(${-offset * 24}deg) translateZ(110px)`,
                  backfaceVisibility: "hidden",
                }}
              >
                {String(rowValue).padStart(2, "0")}
              </div>
            );
          })}
        </div>
      </div>
      <span className="mt-2 text-[13px] leading-5 font-semibold text-text-tertiary">{label}</span>
    </div>
  );
}

export function TimerWheel({
  valueSec,
  onChange,
}: {
  valueSec: number;
  onChange: (sec: number) => void;
}) {
  const parts = splitTimerSec(valueSec);

  return (
    // 열 폭을 고정하면 좁은 폰에서 줄이 본문보다 넓어져 밴드가 잘리고 옆으로 끌린다.
    // 그래서 세 열이 콜론을 뺀 폭을 똑같이 나누고, 줄은 열이 100px이 되는 348px에서 더 넓어지지 않는다.
    <div
      className="relative mx-auto flex w-full max-w-87 items-start"
      style={{ perspective: "900px" }}
    >
      {/* 선택 밴드는 세 열 뒤에 깔려 가운데 행을 받친다. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-29 h-17 rounded-[18px] bg-muted inset-ring-1 inset-ring-white/8"
      />
      {COLUMNS.map(({ unit, label, size }, index) => (
        <Fragment key={unit}>
          {index > 0 && (
            <span
              aria-hidden="true"
              className="relative flex h-75 w-6 shrink-0 items-center justify-center text-[44px] font-bold text-foreground"
            >
              :
            </span>
          )}
          <WheelColumn
            label={label}
            size={size}
            value={parts[unit]}
            onSelect={(next) => onChange(clampTimerSec(joinTimerSec({ ...parts, [unit]: next })))}
          />
        </Fragment>
      ))}
    </div>
  );
}
