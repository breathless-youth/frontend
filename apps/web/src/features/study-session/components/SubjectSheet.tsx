import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import dotIcon from "@/assets/icons/sheet-dot.svg";
import { ChevronUp } from "lucide-react";

import { vibrate } from "@/lib/haptics";
import { cn } from "@/lib/utils";

import { formatElapsed, toKoreanDuration } from "../formatDuration";
import { SUBJECT_SHEET_COPY } from "../sessionCopy";

/**
 * 과목 시트 껍데기(S3-9) — **컨트롤 바 알약이 위로 끌려 올라가며 시트 상단으로 변형되는**
 * 비모달 패널. 원본은 Claude Design `Session Subject Sheet.dc.html`이고 치수·
 * 임계·모션은 그 프로토타입 로직을 옮긴 것이다.
 *
 * ## 구조
 *
 * 레이아웃 흐름에는 바 크기의 자리(`slot`)와 그 위 한 줄 라벨만 남긴다. 실제 바는 **뷰포트에
 * 고정된 그룹** 안에 들어 있고, 접힌 상태에서는 그룹이 아래로 밀려 바만 자리에 겹쳐 보인다.
 * 열리면 그룹이 `--sheet-top`(세로 27svh = 237/874 · 가로 23svh = 92/402)까지 올라오며 배경
 * (base.dark 90% + blur 14)과 상단 라운드 28이 켜지고, 바는 알약 배경을 잃는다(`bar` 렌더 prop에
 * `surface`를 넘긴다). 접힌 위치는 자리의 실측으로 계산해 두고 열림/닫힘은 CSS 트랜지션이다.
 *
 * ## 제스처(원본 `barMove`)
 *
 * - 바 위 포인터 이동 10px 미만은 탭 — 일시정지·전환·종료 버튼이 그대로 동작한다.
 *   `setPointerCapture`를 쓰지 않는다(캡처하면 `click`이 버튼 대신 래퍼로 간다).
 * - **올릴 때**: 임계(26%) 전에는 손가락보다 덜 따라오며 버틴다(0.06배). 임계를 넘는 순간
 *   햅틱과 함께 스프링으로 손가락 위치까지 올라오며 알약이 시트로 변한다(`merged`). 그 뒤로는
 *   1:1로 따라가고, 14% 아래로 내려오면 다시 알약으로 돌아간다(히스테리시스).
 * - **내릴 때**: 26%까지 내려오면 햅틱과 함께 한 번에 접힌다 — 드래그는 거기서 끝난다.
 * - 놓으면 `merged` 여부가 곧 열림 여부다.
 * - 바깥 탭은 시트만 접는다 — 전면 `fixed` 캐처가 심플 모드 토글 위를 덮는다. 시트는 비모달이라
 *   세션·감지는 계속 흐르고 배경을 `inert`로 만들지 않는다.
 * - 라벨 탭으로도 열린다(키보드·보조기기 경로). `motion-reduce`에서는 즉시 스냅.
 */

const TAP_SLOP_PX = 10;
/** 올릴 때 알약→시트 변형 임계 · 내릴 때 접힘 임계(진행률). */
const MERGE_RATIO = 0.26;
/** 변형된 뒤 다시 알약으로 돌아가는 진행률 — 임계 근처에서 떨리지 않게 낮춰 둔다. */
const UNMERGE_RATIO = 0.14;
/** 임계 전 저항 — 손가락 이동의 이 비율만 따라온다. */
const RESIST = 0.06;
/** 그룹 상단에서 바 상단까지(원본 Open 모드 위 여백 18). */
const BAR_TOP_PX = 18;
/** 스프링(catch-up) 트랜지션이 도는 시간 — 원본 360ms. */
const CATCH_UP_MS = 360;

export type SubjectSheetBarSurface = "pill" | "bare";

export interface SubjectSheetLabel {
  name: string;
  focusSec: number;
}

export interface SubjectSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 접힌 상태 라벨 — 선택한 과목과 누적 순공. `null`이면 안내 문구. */
  label: SubjectSheetLabel | null;
  /** 컨트롤 바 — 드래그 도중 알약이 시트로 변하는 순간에 맞춰 `surface`가 바뀐다. */
  bar: (surface: SubjectSheetBarSurface) => ReactNode;
  /** 패널 내용(헤더 + 목록). */
  children: ReactNode;
  className?: string;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export function SubjectSheet({
  open,
  onOpenChange,
  label,
  bar,
  children,
  className,
}: SubjectSheetProps) {
  const panelId = useId();
  const slotRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);
  openRef.current = open;
  /** 접힌 상태의 세로 이동량(px, 양수) — 자리 실측. 열림은 0이다. */
  const [closedY, setClosedY] = useState(0);
  /** 드래그 중 위치. 놓으면 null로 돌아가 CSS 트랜지션이 스냅을 맡는다. */
  const [dragY, setDragY] = useState<number | null>(null);
  /** 알약이 시트로 변형된 상태 — 놓았을 때의 열림 여부이자 배경·핸들·내용의 표시 조건. */
  const [merged, setMerged] = useState(open);
  const mergedRef = useRef(open);
  /** 변형 직후 스프링으로 손가락을 따라잡는 구간. */
  const [catchUp, setCatchUp] = useState(false);
  const catchUpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragRef = useRef<{ startY: number; startOpen: boolean; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);

  function setMergedNow(next: boolean) {
    mergedRef.current = next;
    setMerged(next);
  }

  function spring() {
    if (catchUpTimerRef.current !== null) {
      clearTimeout(catchUpTimerRef.current);
    }
    setCatchUp(true);
    catchUpTimerRef.current = setTimeout(() => {
      catchUpTimerRef.current = null;
      setCatchUp(false);
    }, CATCH_UP_MS);
  }

  useEffect(() => {
    return () => {
      if (catchUpTimerRef.current !== null) {
        clearTimeout(catchUpTimerRef.current);
      }
    };
  }, []);

  // 밖에서 열고 닫으면(라벨 탭·바깥 탭·재생 버튼) 변형 상태도 따라간다.
  useEffect(() => {
    setMergedNow(open);
  }, [open]);

  // 자리(slot)는 레이아웃 흐름 안에 있어 회전·폰트 확대로 움직인다 — 그때마다 다시 잰다.
  // `offsetTop`은 transform을 무시하므로 그룹이 밀려 있어도 열림 위치를 그대로 읽는다.
  useLayoutEffect(() => {
    function measure() {
      const slot = slotRef.current;
      const group = groupRef.current;
      if (slot === null || group === null) {
        return;
      }
      const slotTop = slot.getBoundingClientRect().top;
      setClosedY(Math.max(0, slotTop - BAR_TOP_PX - group.offsetTop));
    }
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, []);

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) {
      return;
    }
    if (closedY <= 0) {
      return;
    }
    dragRef.current = { startY: event.clientY, startOpen: openRef.current, moved: false };
    suppressClickRef.current = false;

    const detach = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };

    const onMove = (move: globalThis.PointerEvent) => {
      const drag = dragRef.current;
      if (drag === null) {
        return;
      }
      const dy = move.clientY - drag.startY;
      if (!drag.moved) {
        if (Math.abs(dy) < TAP_SLOP_PX) {
          return;
        }
        drag.moved = true;
        suppressClickRef.current = true;
      }
      // 진행률 0=접힘 · 1=펼침.
      const raw = clamp01((drag.startOpen ? 1 : 0) - dy / closedY);

      // 내릴 때: 임계까지 내려오면 한 번에 접히고 드래그가 끝난다.
      if (drag.startOpen && raw <= MERGE_RATIO) {
        detach();
        dragRef.current = null;
        vibrate(8);
        spring();
        setMergedNow(false);
        setDragY(null);
        onOpenChange(false);
        return;
      }

      const nextMerged = drag.startOpen
        ? true
        : mergedRef.current
          ? raw > UNMERGE_RATIO
          : raw >= MERGE_RATIO;
      if (nextMerged !== mergedRef.current) {
        vibrate(nextMerged ? 12 : 8);
        spring();
        setMergedNow(nextMerged);
      }
      // 올릴 때 임계 전에는 버틴다.
      const offset = !nextMerged && !drag.startOpen ? raw * RESIST : raw;
      setDragY((1 - offset) * closedY);
    };
    const finish = (cancelled: boolean) => {
      detach();
      const drag = dragRef.current;
      dragRef.current = null;
      setDragY(null);
      if (drag === null || !drag.moved) {
        return;
      }
      const nextOpen = cancelled ? openRef.current : mergedRef.current;
      setMergedNow(nextOpen);
      if (nextOpen !== openRef.current) {
        onOpenChange(nextOpen);
      }
    };
    const onUp = () => finish(false);
    const onCancel = () => finish(true);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  }

  function handleLabelClick() {
    if (!open) {
      vibrate(12);
      spring();
    }
    onOpenChange(!open);
  }

  const restY = open ? 0 : closedY;
  const y = dragY ?? restY;
  const dragging = dragY !== null;

  return (
    <div className={cn("relative flex flex-col items-center", className)}>
      {/* 접힌 상태 라벨 — 선택: 파란 점(펄스) + 과목명 + 순공 / 미선택: 안내 문구 + 위 화살표.
          누르면 열린다. 열린 뒤에는 자리만 남기고 숨긴다. */}
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={handleLabelClick}
        className={cn(
          "pointer-events-auto mb-[10px] flex h-5 max-w-[min(100vw-48px,320px)] items-center gap-2 text-[13px] leading-4 font-semibold transition-opacity duration-200 motion-reduce:transition-none",
          merged && "pointer-events-none opacity-0",
        )}
      >
        {label === null ? (
          <>
            <span className="text-white/55">{SUBJECT_SHEET_COPY.hint}</span>
            <ChevronUp aria-hidden="true" className="size-[14px] text-white/40" strokeWidth={2.5} />
          </>
        ) : (
          <>
            <img
              src={dotIcon}
              alt=""
              aria-hidden="true"
              className="size-[6px] animate-pulse motion-reduce:animate-none"
            />
            <span className="truncate text-white/85">{label.name}</span>
            <span className="font-bold text-white/92 tabular-nums">
              <span aria-hidden="true">{formatElapsed(label.focusSec)}</span>
              <span className="sr-only">{`순공 ${toKoreanDuration(label.focusSec)}`}</span>
            </span>
          </>
        )}
      </button>

      {/* 바깥 탭 캐처 — 열려 있을 때만. 심플 모드 토글(`absolute inset-0`) 위에 놓여 탭을 먹는다. */}
      {open && (
        <button
          type="button"
          aria-label="과목 시트 닫기"
          onClick={() => onOpenChange(false)}
          className="pointer-events-auto fixed inset-0 cursor-default"
        />
      )}

      {/* 레이아웃 자리 — 바 높이만 차지한다. 실제 바는 아래 고정 그룹 안에 있다. */}
      <div
        ref={slotRef}
        className="relative h-20 w-[244px] landscape:h-[68px] landscape:w-[218px]"
      />

      <div
        ref={groupRef}
        data-open={open}
        data-merged={merged}
        style={{ transform: `translateY(${y}px)` }}
        className={cn(
          "pointer-events-auto fixed inset-x-0 top-[var(--sheet-top)] flex h-[calc(100svh-var(--sheet-top))] flex-col items-center rounded-t-[28px] [--sheet-top:27svh] landscape:[--sheet-top:23svh]",
          "transition-[transform,background-color,box-shadow] motion-reduce:transition-none",
          // 원본: 드래그 중 none · 변형 직후 스프링(340ms, overshoot) · 그 외 260ms.
          dragging && !catchUp
            ? "transition-none"
            : catchUp
              ? "duration-[340ms] ease-[cubic-bezier(0.22,1.35,0.36,1)]"
              : "duration-[260ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]",
          merged &&
            "bg-[var(--session-sheet-bg)] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)] backdrop-blur-[14px]",
        )}
      >
        {/* 드래그 핸들 + 컨트롤 바. 세로 팬을 브라우저 스크롤로 넘기지 않는다. 핸들은 시트로
            변형됐을 때만 보인다(알약 상태의 핸들은 실기기 피드백으로 제거된 장식이다). */}
        <div
          className="flex touch-none flex-col items-center"
          onPointerDown={handlePointerDown}
          onClickCapture={(event) => {
            if (suppressClickRef.current) {
              suppressClickRef.current = false;
              event.stopPropagation();
              event.preventDefault();
            }
          }}
        >
          <div
            aria-hidden="true"
            className={cn(
              "mt-[6px] mb-2 h-1 w-9 rounded-full bg-white/22 transition-opacity duration-200 motion-reduce:transition-none",
              !merged && "opacity-0",
            )}
          />
          {bar(merged ? "bare" : "pill")}
        </div>

        {/* 시트 내용 — 변형되며 아래(72px)에서 스프링으로 올라오고, 접히면 빠르게 사라진다. */}
        <div
          id={panelId}
          role="region"
          aria-label={SUBJECT_SHEET_COPY.title}
          aria-hidden={!open}
          className={cn(
            "flex min-h-0 w-full flex-1 flex-col text-white transition-[transform,opacity] motion-reduce:transition-none",
            merged
              ? "translate-y-0 opacity-100 duration-[360ms] ease-[cubic-bezier(0.22,1.2,0.36,1)]"
              : "translate-y-[72px] opacity-0 duration-200 ease-in",
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
