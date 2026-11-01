import type { CSSProperties } from "react";
import { useEffect, useLayoutEffect, useState } from "react";

const TITLE = "지금 바로 시작해 보세요";
const BODY = "집중 시작을 누르면 측정 화면으로 넘어가요";
const SKIP = "나중에 할게요";
/** 대상 둘레 여유(px) */
const RING = 5;
/** 제목 묶음 아래 끝과 링 위 끝 사이(px) */
const TEXT_GAP = 20;
/** 링 아래 끝과 건너뛰기 버튼 위 끝 사이(px) */
const SKIP_GAP = 12;

type Rect = { top: number; left: number; width: number; height: number };

const TARGET_SELECTOR = '[data-coach="start"]';

/**
 * 대상 요소 둘레에 여유를 더한 화면 좌표. 대상이 없으면 null이다.
 *
 * 마운트 뒤 데이터가 늦게 와서 레이아웃이 밀리면 resize·scroll 없이도 대상이 움직인다.
 * 그래서 대상과 `body`의 크기 변화도 지켜보고, 대상이 다시 마운트돼 다른 요소가 될 수 있어 잴 때마다 새로 찾는다.
 */
function useTargetRect(): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);
  useLayoutEffect(() => {
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
    };
  }, []);
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
 * 홈 첫 세션 안내 코치마크
 *
 * `data-coach="start"` 요소만 뚫어 밝게 보이고 나머지는 덮개로 가린다.
 * 한 장에 구멍을 내면 구멍 아래 버튼이 눌리지 않아 덮개를 네 조각으로 나눈다.
 * 덮개는 탭을 삼키기만 하고 닫지 않는다. 닫는 길은 대상 버튼을 눌러 세션으로 넘어가는 것뿐이다.
 * 대화상자가 아니라 오버레이다. `aria-modal`을 붙이면 `nativeModalOverlay`가 모달로 읽어 탭 바 차단 경로가 둘이 된다.
 * 탭 바 차단은 `useCoachMarkTabBar`가 따로 보낸다.
 * 모달이 아니라 낭독기가 뜬 것을 모르므로 뜰 때 대상 버튼에 초점을 옮긴다.
 * 덮개가 홈을 막는 동안 세션을 시작하지 않고 나올 길로 링 아래에 `나중에 할게요`를 둔다. 누르면 부모가 이번 진입 동안만 숨긴다.
 * 대상은 페이지 쪽 요소이고 이 버튼은 그 뒤에 그려, 본문이 `inert`인 동안 Tab 순서가 `집중 시작` → `나중에 할게요`가 된다.
 * 대상을 못 찾으면 덮개만 남아 홈이 막히므로 아무것도 그리지 않는다.
 * 그려졌는지는 `onVisibleChange`로 알린다. 부모는 본문을 막거나 노출 이벤트를 보내기 전에 이 값을 확인한다.
 * 사라질 때는 `false`로 되돌려 알려서 부모가 막은 채로 남지 않게 한다.
 */
export function StartCoachMark({
  onVisibleChange,
  onSkip,
}: {
  onVisibleChange: (visible: boolean) => void;
  onSkip: () => void;
}) {
  const rect = useTargetRect();
  const placed = rect !== null;
  useEffect(() => {
    onVisibleChange(placed);
    return () => onVisibleChange(false);
  }, [placed, onVisibleChange]);
  useEffect(() => {
    if (placed) {
      document.querySelector<HTMLElement>(TARGET_SELECTOR)?.focus();
    }
  }, [placed]);

  if (rect === null) {
    return null;
  }
  return (
    <div
      role="dialog"
      aria-label={TITLE}
      className="pointer-events-none fixed inset-0 z-40 animate-[coach-fade-in_200ms_ease-out] motion-reduce:animate-none"
    >
      {holePieces(rect).map((style, index) => (
        <div
          // 조각 수와 순서는 렌더마다 같다.
          key={index}
          aria-hidden
          data-testid="coach-dim"
          className="pointer-events-auto absolute bg-(--coach-dim)"
          style={style}
        />
      ))}
      <div
        aria-hidden
        className="absolute rounded-[21px] border-2 border-(--coach-ring) shadow-coach-glow"
        style={rect}
      />
      <div
        className="absolute flex -translate-y-full flex-col items-center"
        style={{
          top: rect.top - TEXT_GAP,
          left: rect.left + RING,
          width: rect.width - RING * 2,
        }}
      >
        <h2 className="bg-(image:--gradient-brand-text) bg-clip-text text-center text-[30px] leading-9.5 font-bold tracking-[-0.01em] break-keep text-transparent">
          {TITLE}
        </h2>
        <p className="mt-2.5 text-center text-[15px] leading-5.5 break-keep text-white">{BODY}</p>
      </div>
      <div
        className="absolute flex justify-center"
        style={{
          top: rect.top + rect.height + SKIP_GAP,
          left: rect.left + RING,
          width: rect.width - RING * 2,
        }}
      >
        <button
          type="button"
          onClick={onSkip}
          className="pointer-events-auto min-h-11 min-w-30 text-[15px] font-medium text-white/70"
        >
          {SKIP}
        </button>
      </div>
    </div>
  );
}
