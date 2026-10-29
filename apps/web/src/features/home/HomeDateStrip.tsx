import { Menu } from "lucide-react";
import { useLayoutEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { hasNativeTabBar } from "@/lib/nativeTabBar";
import { hasTabBarPlayButton } from "@/lib/tabBarPlayCapability";
import { cn } from "@/lib/utils";

import { homeDateAccessibilityLabel, homeDateChipLabel, homeDateKeys } from "./homeDates";
import { hasNativeDateBar } from "./nativeHomeDateBar";

/**
 * 홈 날짜 줄
 *
 * 탭 바 바로 위에 떠 있는 막대이고, 본문 흐름 끝에 sticky로 붙여 본문이 그 높이만큼 저절로 비켜 간다.
 * 최근 30일을 가로로 늘어놓고 처음에는 오른쪽 끝의 오늘이 보이게 둔다.
 * 칩 폭은 폰에서 줄 폭의 3분의 1이라 최소 3일이 보이고, 넓은 화면에서는 폭 상한에 걸려 더 많은 날이 보인다.
 * 탭 바에 재생 버튼이 없는 앱에서는 과목 없이 시작하는 버튼을 막대 위에 막대와 같은 너비·높이로 둔다.
 * 앱이 날짜 줄을 직접 그리면 막대를 빼고 시작 버튼만 남기며, 남길 것이 없으면 아무것도 그리지 않는다.
 */
export function HomeDateStrip({
  todayKey,
  selectedKey,
  onSelect,
  onMenu,
  onStartWithoutSubject,
}: {
  todayKey: string;
  selectedKey: string;
  onSelect: (dateKey: string) => void;
  onMenu: () => void;
  onStartWithoutSubject: () => void;
}) {
  const keys = homeDateKeys(todayKey);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller !== null) {
      scroller.scrollLeft = scroller.scrollWidth;
    }
  }, [todayKey]);

  const showStart = !hasTabBarPlayButton();
  const nativeDateBar = hasNativeDateBar();
  // Android 앱은 탭 바 위에 날짜 줄을 띄우고 iOS 액세서리는 웹뷰 안전 영역에 들어가 비울 필요가 없다.
  const reserveNativeBar = nativeDateBar && !hasNativeTabBar();
  if (nativeDateBar && !showStart && !reserveNativeBar) {
    return null;
  }

  return (
    // 막대 바깥 빈 곳은 아래 목록으로 누름을 넘긴다.
    <div className="pointer-events-none sticky bottom-(--tab-bar-reserve) z-20 flex flex-col items-end gap-3 pt-3">
      {showStart && (
        <Button
          onClick={onStartWithoutSubject}
          className="pointer-events-auto h-14 w-full rounded-full text-base font-bold shadow-sb-card"
        >
          순공 시작하기
        </Button>
      )}
      {nativeDateBar ? (
        // 앱이 띄우는 날짜 줄 높이 56과 탭 바와의 간격 8을 더한 만큼 비운다.
        reserveNativeBar && <div aria-hidden data-testid="home-date-bar-spacer" className="h-16" />
      ) : (
        <div className="pointer-events-auto flex w-full items-center gap-1 rounded-full p-1.5 glass-surface">
          <button
            type="button"
            aria-label="과목 메뉴"
            onClick={onMenu}
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground"
          >
            <Menu aria-hidden size={22} />
          </button>
          <span aria-hidden className="h-6 w-px shrink-0 bg-border" />
          <div
            ref={scrollerRef}
            role="group"
            aria-label="날짜"
            className="flex min-w-0 flex-1 overflow-x-auto scrollbar-none [&::-webkit-scrollbar]:hidden"
          >
            {keys.map((key) => {
              const selected = key === selectedKey;
              const today = key === todayKey;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={selected}
                  aria-label={homeDateAccessibilityLabel(key, todayKey)}
                  onClick={() => onSelect(key)}
                  className={cn(
                    "h-11 w-1/3 max-w-26 shrink-0 rounded-full text-[15px] leading-5 tabular-nums",
                    selected
                      ? "bg-muted font-bold text-foreground shadow-sb-card"
                      : today
                        ? "font-semibold text-primary"
                        : "font-medium text-muted-foreground",
                  )}
                >
                  {homeDateChipLabel(key)}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
