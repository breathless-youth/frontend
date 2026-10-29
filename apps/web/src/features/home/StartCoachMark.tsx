import type { CSSProperties } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

const TITLE = "지금 바로 시작해 보세요";
const BODY = "시작 버튼을 누르면 측정 화면으로 넘어가요";
/** 대상 둘레 여유(px) */
const RING = 5;
/** 제목 묶음 아래 끝과 링 위 끝 사이(px) */
const TEXT_GAP = 20;

type Rect = { top: number; left: number; width: number; height: number };

const TARGET_SELECTOR = '[data-coach="start"]';

/**
 * 대상 요소 둘레에 여유를 더한 화면 좌표. 대상이 없거나 꺼져 있으면 null이다.
 *
 * 마운트 뒤 데이터가 늦게 와서 레이아웃이 밀리면 resize·scroll 없이도 대상이 움직인다.
 * 그래서 대상과 `body`의 크기 변화도 지켜보고, 대상이 다시 마운트돼 다른 요소가 될 수 있어 잴 때마다 새로 찾는다.
 */
function useTargetRect(enabled: boolean): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);
  useLayoutEffect(() => {
    if (!enabled) {
      return;
    }
    let observed: HTMLElement | null = null;
    // 구형 웹뷰·jsdom에는 없을 수 있다. 없으면 resize·scroll만으로 잰다.
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => measure());
    function measure() {
      const target = document.querySelector<HTMLElement>(TARGET_SELECTOR);
      if (observer !== null && target !== observed) {
        if (observed !== null) {
          observer.unobserve(observed);
        }
        if (target !== null) {
          observer.observe(target);
        }
        observed = target;
      }
      if (target === null) {
        setRect(null);
        return;
      }
      const r = target.getBoundingClientRect();
      setRect({
        top: r.top - RING,
        left: r.left - RING,
        width: r.width + RING * 2,
        height: r.height + RING * 2,
      });
    }
    measure();
    observer?.observe(document.body);
    window.addEventListener("resize", measure);
    // 스크롤 컨테이너가 window가 아닐 수 있어 캡처 단계에서 모든 스크롤을 받는다.
    window.addEventListener("scroll", measure, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      setRect(null);
    };
  }, [enabled]);
  return rect;
}

/** 대상 자리를 비운 덮개 네 조각. 대상이 화면 밖으로 걸쳐도 음수 크기가 나오지 않게 0에서 자른다. */
function holePieces(rect: Rect): CSSProperties[] {
  const bottom = rect.top + rect.height;
  const right = rect.left + rect.width;
  return [
    { top: 0, left: 0, right: 0, height: Math.max(0, rect.top) },
    { top: bottom, left: 0, right: 0, bottom: 0 },
    { top: rect.top, left: 0, width: Math.max(0, rect.left), height: rect.height },
    { top: rect.top, left: right, right: 0, height: rect.height },
  ];
}

/**
 * 첫 세션 안내 코치마크
 *
 * 대화상자가 아니라 오버레이다. `aria-modal`을 붙이면 `nativeModalOverlay`가 모달로 읽어 탭 바를 통째로 막고
 * 재생 원 앱에서 재생 원까지 눌리지 않는다. 탭 바 차단은 `useCoachMarkTabBar`가 따로 보낸다.
 * 버튼 대상은 덮개를 네 조각으로 나눠 대상 자리를 비운다. 한 장에 구멍을 내면 구멍 아래 버튼이 눌리지 않는다.
 * 재생 원은 웹뷰 밖이라 덮개를 통째로 깔고 화살표로 오른쪽 아래 재생 원을 가리킨다.
 * 대상 요소를 못 찾으면 재생 원처럼 덮개 한 장으로 물러서되 가리킬 재생 원이 없어 화살표는 그리지 않는다.
 * 모달이 아니라 낭독기가 뜬 것을 모르므로 뜰 때 첫 닫기 조각에 초점을 옮긴다.
 */
export function StartCoachMark({
  target,
  onDismiss,
}: {
  target: "button" | "play";
  onDismiss: () => void;
}) {
  const rect = useTargetRect(target === "button");
  // 덮개 조각의 닫기 영역 합이 화면 대부분이라 조각마다 min-h를 걸지 않는다(폭 0인 조각도 생긴다).
  const pieces = rect === null ? [{ inset: 0 }] : holePieces(rect);
  // 첫 조각은 키가 같아 네 조각으로 바뀌어도 같은 요소라 초점이 남는다.
  const firstPieceRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    firstPieceRef.current?.focus();
  }, []);

  return (
    <div
      role="dialog"
      aria-label={TITLE}
      className="pointer-events-none fixed inset-0 z-40 animate-[coach-fade-in_200ms_ease-out] motion-reduce:animate-none"
    >
      {pieces.map((style, index) => (
        <button
          // 조각 수와 순서는 렌더마다 같다.
          key={index}
          ref={index === 0 ? firstPieceRef : undefined}
          type="button"
          aria-label="안내 닫기"
          // 낭독기에는 첫 조각 하나만 "안내 닫기"로 남긴다. 나머지도 눌러서 닫을 수는 있다.
          aria-hidden={index > 0 || undefined}
          tabIndex={index > 0 ? -1 : undefined}
          onClick={onDismiss}
          className="pointer-events-auto absolute bg-(--coach-dim) outline-none"
          style={style}
        />
      ))}
      {rect !== null && (
        <div
          aria-hidden
          className="absolute rounded-full border-2 border-(--coach-ring) shadow-coach-glow"
          style={rect}
        />
      )}
      <div
        className={cn(
          "absolute inset-x-5 flex flex-col items-center",
          rect === null && "bottom-[calc(var(--tab-bar-reserve)+4.5rem)]",
          rect !== null && "-translate-y-full",
        )}
        style={rect === null ? undefined : { top: rect.top - TEXT_GAP }}
      >
        <h2 className="bg-(image:--gradient-brand-text) bg-clip-text text-center text-[30px] leading-9.5 font-bold tracking-[-0.01em] break-keep text-transparent">
          {TITLE}
        </h2>
        <p className="mt-2.5 text-center text-[15px] leading-5.5 break-keep text-primary-foreground/90">
          {BODY}
        </p>
        {target === "play" && (
          // Figma 시안(7516:14487)의 점선 곡선 화살표를 코드로 옮겼다. 따로 내보낸 자산 파일은 없다.
          // 시작점이 가운데에 오도록 화살표 폭의 절반만큼 오른쪽으로 민다.
          <svg
            aria-hidden
            viewBox="0 0 120 60"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mt-2 h-15 w-30 translate-x-1/2 text-primary-foreground/90"
          >
            <path d="M4 4 Q8 50 106 50" strokeDasharray="4 5" />
            <path d="M98 43 L107 50 L98 57" />
          </svg>
        )}
      </div>
    </div>
  );
}
