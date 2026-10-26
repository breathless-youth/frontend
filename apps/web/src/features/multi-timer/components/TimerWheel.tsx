import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";

import { haptic } from "@/lib/haptics";
import { prefersReducedMotion } from "@/lib/prefersReducedMotion";

import { clampTimerSec } from "../multiTimerSettings";
import { joinTimerSec, splitTimerSec } from "../multiTimerFormat";
import {
  medianFrameInterval,
  motionForFrameInterval,
  probeFrameInterval,
  recordFrameInterval,
  rubberBand,
  settleDuration,
} from "../wheelMotion";

type Unit = "h" | "m" | "s";

const COLUMNS: ReadonlyArray<{ unit: Unit; label: string; size: number }> = [
  { unit: "h", label: "시간", size: 24 },
  { unit: "m", label: "분", size: 60 },
  { unit: "s", label: "초", size: 60 },
];

/** 굴러가는 동안 가장자리로 들어오는 줄까지 그리고, 멈춰 있을 때는 위아래 두 줄만 보인다. */
const OFFSETS = [-3, -2, -1, 0, 1, 2, 3] as const;
const COLUMN_HEIGHT = 300;
const DRAG_STEP_PX = 46;
const ROW_DEG = 24;
/** 가운데 줄 숫자 대비 나머지 줄 숫자의 크기 비율 */
const SIDE_ROW_SCALE = 38 / 48;
/** 손가락이 이만큼 움직여야 탭이 아니라 끌기로 본다. */
const DRAG_THRESHOLD_ROWS = 0.2;
/** 손을 떼기 전에 이보다 오래 멈춰 있었으면 튕긴 것으로 보지 않는다. */
const FLING_IDLE_MS = 80;
const VELOCITY_WINDOW_MS = 100;
/** 휠이 뜰 때 화면 갱신 간격을 재는 프레임 수 */
const PROBE_FRAMES = 8;
/**
 * 단위 글자 크기와 숫자와의 간격
 *
 * 한글은 한 글자가 대략 글자 크기만큼 넓다.
 */
const UNIT_FONT_PX = 15;
const UNIT_GAP_PX = 6;

/** 가운데에서 떨어진 칸 수에 따른 투명도. 1칸 45%, 2칸 20%, 3칸에서 사라진다. */
function rowOpacity(distance: number): number {
  if (distance <= 1) return 1 - 0.55 * distance;
  if (distance <= 2) return 0.45 - 0.25 * (distance - 1);
  return Math.max(0, 0.2 * (3 - distance));
}

function rowScale(distance: number): number {
  return 1 - (1 - SIDE_ROW_SCALE) * Math.min(distance, 1);
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

interface WheelColumnProps {
  label: string;
  size: number;
  value: number;
  onSelect: (value: number) => void;
}

interface DragState {
  y0: number;
  from: number;
  moved: boolean;
  samples: Array<{ t: number; p: number }>;
}

/**
 * 시·분·초 한 칸의 휠
 *
 * 값은 바뀌는 즉시 넘기고, 화면의 숫자는 그 값까지 굴러가듯 따라간다.
 * 끄는 동안에는 손가락을 소수 칸 단위로 따라가다가, 손을 떼면 가까운 칸에 붙거나 튕긴 속도만큼 더 굴러간다.
 * 화면이 초당 30번만 그려지는 기기에서는 짧게 붙고 덜 굴러가서 끊김이 덜 보인다.
 * 손으로 칸을 넘길 때마다 가벼운 햅틱을 낸다.
 * 양 끝에서는 반대쪽 끝으로 넘어가지 않고, 끝을 넘겨 끌면 버티며 따라오다가 손을 떼면 끝 값으로 돌아온다.
 */
function WheelColumn({ label, size, value, onSelect }: WheelColumnProps) {
  // 굴러가는 중인 위치(칸 단위)이고, 멈춰 있으면 null이라 값 그대로 그린다.
  const [rolling, setRolling] = useState<number | null>(null);
  const rollingRef = useRef<number | null>(null);
  const frame = useRef<number | null>(null);
  const lastRow = useRef(0);
  const drag = useRef<DragState | null>(null);
  const suppressClick = useRef(false);

  // 숫자와 단위를 한 묶음으로 가운데 두려고 숫자 줄을 단위 자리만큼 왼쪽으로 민다.
  const unitSlot = label.length * UNIT_FONT_PX + UNIT_GAP_PX;
  const max = size - 1;
  const clampToEnds = (row: number) => Math.min(max, Math.max(0, row));
  const position = rolling ?? value;
  const base = Math.round(position);
  const frac = position - base;

  const show = (next: number | null) => {
    rollingRef.current = next;
    setRolling(next);
  };

  const stopRoll = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  };

  const commit = (row: number) => {
    const next = clampToEnds(row);
    if (next !== value) onSelect(next);
  };

  // 화면만 굴린다. 값은 부르는 쪽이 이미 넘겼다.
  const settle = (from: number, to: number, tick: boolean) => {
    stopRoll();
    if (from === to || prefersReducedMotion() || typeof requestAnimationFrame !== "function") {
      show(null);
      return;
    }
    const duration = settleDuration(motionForFrameInterval(medianFrameInterval()), to - from);
    let startedAt: number | null = null;
    let previous: number | null = null;
    lastRow.current = clampToEnds(Math.round(from));
    const step = (now: number) => {
      startedAt ??= now;
      if (previous !== null) recordFrameInterval(now - previous);
      previous = now;
      const t = Math.min(1, (now - startedAt) / duration);
      const p = from + (to - from) * easeOutCubic(t);
      const row = clampToEnds(Math.round(p));
      if (tick && row !== lastRow.current) {
        lastRow.current = row;
        haptic("light");
      }
      if (t >= 1) {
        frame.current = null;
        show(null);
        return;
      }
      show(p);
      frame.current = requestAnimationFrame(step);
    };
    show(from);
    frame.current = requestAnimationFrame(step);
  };

  const roll = (delta: number, tick: boolean) => {
    const from = rollingRef.current ?? value;
    // 끝을 넘겨 끈 뒤 돌아오는 중이면 화면 위치가 범위 밖이라 끝 값에서부터 센다.
    const current = clampToEnds(Math.round(from));
    const target = clampToEnds(current + delta);
    // 끝에서 더 넘기려는 입력은 값도 햅틱도 바꾸지 않는다.
    if (target === current) return;
    if (tick) haptic("light");
    commit(target);
    settle(from, target, false);
  };

  useEffect(() => () => stopRoll(), []);

  useEffect(() => {
    if (typeof requestAnimationFrame !== "function") return;
    return probeFrameInterval(PROBE_FRAMES);
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      roll(1, false);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      roll(-1, false);
    } else if (event.key === "Home") {
      event.preventDefault();
      roll(-size, false);
    } else if (event.key === "End") {
      event.preventDefault();
      roll(size, false);
    }
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    stopRoll();
    const from = rollingRef.current ?? value;
    drag.current = {
      y0: event.clientY,
      from,
      moved: false,
      samples: [{ t: performance.now(), p: from }],
    };
    lastRow.current = clampToEnds(Math.round(from));
    suppressClick.current = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    // 화면에 그려진 높이와 논리 높이가 다를 수 있어 논리 좌표로 환산한다.
    const scale = rect.height > 0 ? COLUMN_HEIGHT / rect.height : 1;
    const raw = current.from - ((event.clientY - current.y0) * scale) / DRAG_STEP_PX;
    const p = prefersReducedMotion() ? clampToEnds(raw) : rubberBand(raw, max);
    if (Math.abs(raw - current.from) >= DRAG_THRESHOLD_ROWS) {
      current.moved = true;
      suppressClick.current = true;
    }
    const now = performance.now();
    current.samples = [
      ...current.samples.filter(({ t }) => now - t <= VELOCITY_WINDOW_MS),
      { t: now, p },
    ];
    show(p);
    const row = clampToEnds(Math.round(p));
    if (row !== lastRow.current) {
      lastRow.current = row;
      haptic("light");
      commit(row);
    }
  };

  const handlePointerEnd = () => {
    const current = drag.current;
    drag.current = null;
    if (!current) return;
    const from = rollingRef.current ?? value;
    if (!current.moved) {
      show(null);
      return;
    }
    const first = current.samples[0];
    const last = current.samples[current.samples.length - 1];
    const idle = performance.now() - last.t > FLING_IDLE_MS;
    const velocity = idle || last.t === first.t ? 0 : (last.p - first.p) / (last.t - first.t);
    const motion = motionForFrameInterval(medianFrameInterval());
    const fling = prefersReducedMotion()
      ? 0
      : Math.max(-motion.maxFlingRows, Math.min(motion.maxFlingRows, velocity * motion.flingMs));
    // 끝 너머로 튕긴 만큼은 버리고 끝 값에 멈춘다.
    const target = clampToEnds(Math.round(from + fling));
    commit(target);
    settle(from, target, true);
  };

  const wheelRef = useRef<HTMLDivElement>(null);
  const latestRoll = useRef(roll);
  useEffect(() => {
    latestRoll.current = roll;
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
        latestRoll.current(direction, true);
        return;
      }
      // 방향을 바꾸면 반대쪽으로 모인 양이 새 방향의 첫 칸을 늦추지 않게 버린다.
      if (Math.sign(pending) === -direction) pending = 0;
      pending += event.deltaY;
      if (Math.abs(pending) < DRAG_STEP_PX) return;
      pending %= DRAG_STEP_PX;
      latestRoll.current(direction, true);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    // 남는 폭을 열마다 똑같이 더해 단위 길이가 달라도 숫자 묶음 사이 간격이 고르다.
    <div className="flex min-w-0 flex-col items-center" style={{ flex: `1 1 ${unitSlot}px` }}>
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
            const distance = Math.abs(offset - frac);
            const opacity = rowOpacity(distance);
            if (opacity < 0.01) return null;
            const rowValue = base + offset;
            // 끝 너머 줄은 비워 두어 첫 값 위와 마지막 값 아래가 빈칸으로 보인다.
            if (rowValue < 0 || rowValue > max) return null;
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
                  if (!center) roll(offset, true);
                }}
                className="absolute inset-x-0 top-1/2 -mt-5.75 flex h-11.5 cursor-pointer items-center justify-center text-[40px] font-medium tabular-nums text-foreground"
                style={{
                  paddingRight: unitSlot,
                  opacity,
                  transform: `rotateX(${-(offset - frac) * ROW_DEG}deg) translateZ(110px) scale(${rowScale(distance)})`,
                  backfaceVisibility: "hidden",
                }}
              >
                {String(rowValue).padStart(2, "0")}
              </div>
            );
          })}
        </div>
        {/* 단위는 굴러가지 않고 선택 밴드 안 가운데 숫자 오른쪽에 붙어 있다.
            숫자와 같은 글꼴의 1ch가 두 자리 숫자 폭의 절반이라 그 오른쪽 끝을 잴 수 있다. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 flex h-11.5 -translate-y-1/2 items-center text-[40px] font-medium tabular-nums"
          style={{ left: `calc(50% - ${unitSlot / 2}px + 1ch + ${UNIT_GAP_PX}px)` }}
        >
          <span
            className="leading-5 font-medium text-foreground"
            style={{ fontSize: UNIT_FONT_PX }}
          >
            {label}
          </span>
        </span>
      </div>
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
    // 그래서 세 열이 폭을 나누고, 줄은 348px에서 더 넓어지지 않는다.
    // 안쪽 여백은 양 끝 숫자와 단위가 밴드 가장자리에 붙지 않게 한다.
    <div
      className="relative mx-auto flex w-full max-w-87 items-start px-1.5"
      style={{ perspective: "900px" }}
    >
      {/* 선택 밴드는 세 열 뒤에 깔려 가운데 행을 받친다. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-29 h-17 rounded-[18px] bg-muted inset-ring-1 inset-ring-white/8"
      />
      {COLUMNS.map(({ unit, label, size }) => (
        <WheelColumn
          key={unit}
          label={label}
          size={size}
          value={parts[unit]}
          onSelect={(next) => onChange(clampTimerSec(joinTimerSec({ ...parts, [unit]: next })))}
        />
      ))}
    </div>
  );
}
