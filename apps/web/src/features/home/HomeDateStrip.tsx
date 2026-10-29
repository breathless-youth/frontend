import type { HomeMenuAction } from "@focusmakers/types";
import { ArrowUpDown, Menu, Pencil } from "lucide-react";
import { useLayoutEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { hasNativeTabBar } from "@/lib/nativeTabBar";
import { hasTabBarPlayButton } from "@/lib/tabBarPlayCapability";
import { cn } from "@/lib/utils";

import { homeDateAccessibilityLabel, homeDateChipLabel, homeDateKeys } from "./homeDates";
import { hasNativeDateBar } from "./nativeHomeDateBar";

const MENU_ITEM_CLASS =
  "h-11 gap-3 rounded-none px-4 py-0 text-[15px] leading-5 font-medium text-foreground";

/**
 * 홈 날짜 줄
 *
 * 탭 바 바로 위에 떠 있는 막대이고, 본문 흐름 끝에 sticky로 붙여 본문이 그 높이만큼 저절로 비켜 간다.
 * 최근 30일을 가로로 늘어놓고 처음에는 오른쪽 끝의 오늘이 보이게 둔다.
 * 칩 폭은 폰에서 줄 폭의 3분의 1이라 최소 3일이 보이고, 넓은 화면에서는 폭 상한에 걸려 더 많은 날이 보인다.
 * 탭 바에 재생 버튼이 없는 앱에서는 과목 없이 시작하는 버튼을 막대 위에 막대와 같은 너비·높이로 둔다.
 * 앱이 날짜 줄을 직접 그리면 막대를 빼고 시작 버튼만 남기며, 남길 것이 없으면 아무것도 그리지 않는다.
 * 메뉴 버튼은 앱 날짜 줄 메뉴와 같은 두 항목을 웹 메뉴로 연다.
 * `menuDisabled`인 동안 두 항목은 보이되 고를 수 없다.
 */
export function HomeDateStrip({
  todayKey,
  selectedKey,
  onSelect,
  onMenuAction,
  menuDisabled = false,
  onStartWithoutSubject,
}: {
  todayKey: string;
  selectedKey: string;
  onSelect: (dateKey: string) => void;
  onMenuAction: (action: HomeMenuAction) => void;
  menuDisabled?: boolean;
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
          data-coach="start"
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
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="과목 메뉴"
              className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none"
            >
              <Menu aria-hidden size={22} />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="top"
              align="start"
              sideOffset={10}
              // Radix 스크롤 잠금이 막은 터치를 iOS는 클릭으로 만들지 않아 메뉴 항목 탭이 씹힌다.
              onTouchMove={(event) => event.stopPropagation()}
              // 포털이 body로 나가므로 홈 테마를 다시 단다.
              className="theme-soft-blue w-63 rounded-[14px] border-0 p-0 shadow-[0_12px_24px_0_rgba(15,23,42,0.16)]"
            >
              <DropdownMenuItem
                disabled={menuDisabled}
                onSelect={() => onMenuAction("reorder-subjects")}
                className={MENU_ITEM_CLASS}
              >
                <ArrowUpDown aria-hidden size={20} className="shrink-0" />
                과목 순서 변경
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={menuDisabled}
                onSelect={() => onMenuAction("edit-subjects")}
                className={cn(MENU_ITEM_CLASS, "border-t border-border")}
              >
                <Pencil aria-hidden size={20} className="shrink-0" />
                과목 편집
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
