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

import { haptic } from "@/lib/haptics";
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
 * - **드래그를 받는 곳**: ① 핸들 줄 — 접혔을 때는 44×28 박스, **열렸을 때는 시트 전폭 띠**
 *   (열린 시트의 핸들 줄은 좌우 여백까지 잡힌다) ② 컨트롤 바 면(버튼 제외). 버튼은 탭 전용이라
 *   드래그가 끼어들지 않는다. 포인터 이동 10px 미만은 무시한다.
 *   접혔을 때 전폭으로 넓히지 않는 이유는 그 자리에 라벨 버튼이 있어 탭을 가로채기 때문이다.
 * - **올릴 때**: 임계(26%) 전에는 손가락보다 덜 따라오며 버틴다(0.06배). 임계를 넘는 순간
 *   햅틱과 함께 손가락 위치까지 올라오며 알약이 시트로 변한다(`merged`). 그 뒤로는 1:1로
 *   따라가고, 14% 아래로 내려오면 다시 알약으로 돌아간다(히스테리시스).
 * - **내릴 때**: 26%까지 내려오면 햅틱과 함께 한 번에 접힌다 — 드래그는 거기서 끝난다.
 * - 전환은 전부 같은 이징·길이다(260ms) — 되튀는 스프링은 실기기 확인으로 걷어냈다. 드래그 중에는
 *   전환을 끄되 변형 순간만 예외다(아래 `snapping`).
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
/** 시트↔알약 변형 순간, 손가락 위치까지 따라잡는 전환 길이. 아래 타이머 이동과 같아야 한다. */
const SNAP_MS = 260;

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
  /**
   * 변형 순간에만 켜지는 전환 구간.
   *
   * 드래그 중에는 손가락을 1:1로 따라가야 해서 전환을 끄지만, **임계를 넘어 알약이 시트로 바뀌는
   * 순간만은 예외**다. 그 순간 시트는 저항 위치에서 손가락 위치로 한 번에 건너뛰는데, 전환이 없으면
   * 한 프레임에 튀어 올라 타이머를 덮어버리고 타이머만 뒤늦게 기어 나온다. 여기서 같은 길이·이징을
   * 켜 두면 시트와 타이머가 나란히 올라온다.
   */
  const [snapping, setSnapping] = useState(false);
  const snapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragRef = useRef<{ startY: number; startOpen: boolean; moved: boolean } | null>(null);

  function snap() {
    if (snapTimerRef.current !== null) {
      clearTimeout(snapTimerRef.current);
    }
    setSnapping(true);
    snapTimerRef.current = setTimeout(() => {
      snapTimerRef.current = null;
      setSnapping(false);
    }, SNAP_MS);
  }

  useEffect(() => {
    return () => {
      if (snapTimerRef.current !== null) {
        clearTimeout(snapTimerRef.current);
      }
    };
  }, []);

  function setMergedNow(next: boolean) {
    mergedRef.current = next;
    setMerged(next);
  }

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

  const restY = open ? 0 : closedY;
  const y = dragY ?? restY;
  const dragging = dragY !== null;
  /** 0=접힘 · 1=펼침. 드래그 중에는 손가락을 따라 연속으로 움직인다. */
  const progress = closedY > 0 ? clamp01(1 - y / closedY) : merged ? 1 : 0;
  /** 라벨은 시트가 올라오는 동안 **같이** 옅어진다 — merged에서 툭 꺼지면 계단처럼 보인다. */
  const labelOpacity = clamp01(1 - progress * 1.8);

  /**
   * 진행률과 전환 길이를 문서 루트의 CSS 변수로 내보낸다 — 세션 화면의 타이머가 이 값으로 시트와
   * **같은 비율만큼** 따라 올라온다(시안은 타이머를 시트와 한 덩어리로 끌어올린다).
   *
   * prop으로 넘기지 않는 이유: 드래그 중에는 포인터가 움직일 때마다 값이 바뀌는데, 그 값을 세션
   * 화면 상태로 올리면 카메라 프리뷰까지 매 프레임 다시 그린다. CSS 변수는 리렌더 없이 흐른다.
   */
  const publishedRef = useRef({ progress: "", transition: "" });
  useLayoutEffect(() => {
    const root = document.documentElement;
    const nextProgress = progress.toFixed(4);
    const nextTransition = dragging && !snapping ? "0s" : `${SNAP_MS}ms`;
    // ⚠️ 값이 같으면 쓰지 않는다. `:root`의 커스텀 속성을 건드리면 **문서 전체** 스타일이
    // 무효화되는데, 이 컴포넌트는 라벨의 시간이 흘러 1초마다 다시 그려진다. 그대로 두면
    // 애니메이션 도중에 전체 재계산이 끼어들어 프레임을 떨군다.
    if (publishedRef.current.progress !== nextProgress) {
      publishedRef.current.progress = nextProgress;
      root.style.setProperty("--session-sheet-progress", nextProgress);
    }
    if (publishedRef.current.transition !== nextTransition) {
      publishedRef.current.transition = nextTransition;
      root.style.setProperty("--session-sheet-transition", nextTransition);
    }
  });

  useEffect(() => {
    return () => {
      // 세션을 떠나면 값이 남아 다른 화면의 계산에 섞이지 않게 되돌린다.
      document.documentElement.style.removeProperty("--session-sheet-progress");
      document.documentElement.style.removeProperty("--session-sheet-transition");
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
      }
      // 진행률 0=접힘 · 1=펼침.
      const raw = clamp01((drag.startOpen ? 1 : 0) - dy / closedY);

      // 내릴 때: 임계까지 내려오면 한 번에 접히고 드래그가 끝난다.
      if (drag.startOpen && raw <= MERGE_RATIO) {
        detach();
        dragRef.current = null;
        haptic("medium");
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
        haptic(nextMerged ? "heavy" : "medium");
        snap();
        setMergedNow(nextMerged);
        // 손을 떼기 전에 알린다 — 세션 화면의 타이머가 시트와 **같은 박자로** 자리를 옮긴다.
        // release에서 알리면 시트가 올라오는 내내 타이머가 가려져 있다가 뒤늦게 튄다.
        onOpenChange(nextMerged);
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
      haptic("heavy");
    }
    onOpenChange(!open);
  }

  return (
    <div className={cn("relative flex flex-col items-center", className)}>
      {/* 접힌 상태 라벨 — 선택: 파란 점(펄스) + 과목명 + 순공 / 미선택: 안내 문구 + 위 화살표.
          누르면 열린다. 열린 뒤에는 자리만 남기고 숨긴다. */}
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={handleLabelClick}
        style={{ opacity: labelOpacity }}
        className={cn(
          "mb-[10px] flex h-5 max-w-[min(100vw-48px,320px)] items-center gap-2 text-[13px] leading-4 font-semibold transition-opacity duration-[260ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none",
          merged ? "pointer-events-none" : "pointer-events-auto",
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
          "pointer-events-auto fixed inset-x-0 top-[var(--sheet-top)] flex h-[calc(100svh-var(--sheet-top))] flex-col items-center rounded-t-[28px] will-change-transform [--sheet-top:27svh] landscape:[--sheet-top:23svh]",
          "transition-transform motion-reduce:transition-none",
          // 드래그 중에는 손가락을 그대로 따라가고, 변형 순간과 놓았을 때만 전환을 태운다.
          dragging && !snapping
            ? "transition-none"
            : "duration-[260ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]",
        )}
      >
        {/* 배경과 상단 하이라이트는 별도 레이어다 — 클래스로 껐다 켜면 한 프레임에 튄다.
            ⚠️ **여기에 `backdrop-blur`를 넣지 말 것.** 화면을 가득 채운 흐림 레이어가 움직이면서
            동시에 투명도까지 바뀌면 iOS 웹뷰가 매 프레임 배경을 다시 샘플링하느라 프레임을 떨군다
            (실기기에서 "닫을 때 덜덜 떨린다"로 관측). 배경이 이미 90% 불투명이라 흐림이 보태는
            것도 거의 없다. */}
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-0 rounded-t-[28px] bg-[var(--session-sheet-bg)] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)] transition-opacity duration-[260ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none",
            merged ? "opacity-100" : "opacity-0",
          )}
        />

        {/* 컨트롤 바 + 드래그 핸들. 바는 그룹 상단에서 18px 아래에 있고(원본 Open 모드 위 여백),
            핸들 36×4는 **접힌 알약 안에도 보인다** — 알약일 때는 알약 위 6px, 시트로 변형되면
            그룹 상단 6px로 올라간다. 히트 영역은 열림 여부로 갈린다(위 제스처 주석). */}
        <div className="relative flex w-full flex-col items-center pt-[18px]">
          <div
            className="touch-none"
            onPointerDown={(event) => {
              if ((event.target as Element).closest("button") !== null) {
                return;
              }
              handlePointerDown(event);
            }}
          >
            {bar(merged ? "bare" : "pill")}
          </div>

          {/* 핸들 그림 — 히트 영역과 분리해 위치만 움직인다.
              ⚠️ `top`을 전환하지 말 것. 레이아웃 속성이라 260ms 내내 매 프레임 재배치가 돌고,
              그 재배치가 시트 안의 과목 목록까지 훑어 본체·타이머가 함께 떨린다(실기기 관측).
              같은 이동을 `transform`으로 하면 합성 단계에서 끝난다. */}
          <div
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute top-0 left-1/2 h-1 w-9 -translate-x-1/2 rounded-full bg-white/22 transition-transform duration-[260ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none",
              merged ? "translate-y-[6px]" : "translate-y-[24px]",
            )}
          />

          <div
            aria-label="과목 시트 끌기"
            className={cn(
              "absolute h-7 touch-none cursor-grab active:cursor-grabbing",
              merged ? "inset-x-0 top-0" : "left-1/2 top-[18px] w-11 -translate-x-1/2",
            )}
            onPointerDown={handlePointerDown}
          />
        </div>

        {/* 시트 내용 — 변형되며 아래(72px)에서 스프링으로 올라오고, 접히면 빠르게 사라진다. */}
        <div
          id={panelId}
          role="region"
          aria-label={SUBJECT_SHEET_COPY.title}
          aria-hidden={!open}
          className={cn(
            "flex min-h-0 w-full flex-1 flex-col text-white",
            // 등장만 올라오고(키프레임) 퇴장은 투명도만 줄인다 — 이유는 `index.css`의 키프레임 주석.
            merged
              ? "animate-[sheet-content-rise_260ms_cubic-bezier(0.2,0.8,0.2,1)] opacity-100 motion-reduce:animate-none"
              : "opacity-0 transition-opacity duration-[260ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none",
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
