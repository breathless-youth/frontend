import { useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Link, matchPath, Outlet, useLocation } from "react-router-dom";

import mascotStopwatch from "@/assets/mascot/stopwatch-upright.svg";
import { plannerEntryOf } from "@/features/planner/useOpenPlanner";
import { type PcTab, trackTabPressed } from "@/lib/amplitude";
import { legacyQuery } from "@/lib/userId";

import { PcProfileMenu } from "./PcProfileMenu";
import { useNarrowPcWindow } from "./usePcShell";

const TABS: readonly { tab: PcTab; to: string }[] = [
  { tab: "home", to: "/home" },
  { tab: "social", to: "/social" },
  { tab: "record", to: "/records" },
  { tab: "ranking", to: "/ranking" },
];

// 첫 출시는 홈만 연다.
// 나머지 탭은 경로와 현재 탭 판정에 남겨 두어 다시 열 때 이 목록만 바꾼다.
const VISIBLE_TABS = TABS.filter(({ tab }) => tab === "home");

/**
 * 지금 화면이 속한 탭
 *
 * 플래너는 홈과 기록 탭 양쪽에서 열려서 주소의 경로가 아니라 플래너를 연 곳으로 정한다.
 * 연 곳을 모르면 모바일에서 플래너를 처음 여는 홈으로 본다.
 */
function currentTabOf(location: { pathname: string; search: string; state: unknown }) {
  if (location.pathname === "/planner" || location.pathname === "/manual-record") {
    return plannerEntryOf(location) === "records" ? "record" : "home";
  }
  return TABS.find(({ to }) => matchPath({ path: to, end: false }, location.pathname))?.tab;
}

/**
 * 넓은 브라우저 창의 상단 바와 둥근 페이지 상자
 *
 * 페이지는 모바일 화면을 그대로 상자 안에 그리고, 스크롤도 문서가 아니라 상자 안쪽이 맡는다.
 * 상자에 transform을 걸어 페이지의 fixed 머리줄·하단 버튼이 창이 아니라 상자를 기준으로 붙어 상단 바 위로 나가지 않는다.
 * 스크롤을 맡는 요소는 페이지가 바뀌어도 남아서 앞 화면의 위치가 다음 화면으로 넘어가므로, 경로가 바뀌면 뒤로 가기를 포함해 늘 맨 위로 올린다.
 * Soft Blue 테마를 상자까지 켜면 테마를 직접 달지 않은 약관 같은 페이지의 글자색이 바뀌므로, 페이지가 원래 모습을 유지하도록 상단 바에만 켠다.
 * 하단 탭 바는 앱만 그리고 여기서는 상단 바가 대신하므로 탭 바 몫으로 비워 두던 아래 여백을 줄인다.
 * 창이 960px보다 좁으면 상자를 덮개로 가리고 안쪽은 지우지 않고 막기만 해서 공부 세션이 뒤에서 계속된다.
 * 덮개는 상자 안 창들보다 위 층이라 공부 가이드와 종료 창도 함께 가린다.
 */
export function PcShell() {
  const { t } = useTranslation("desktop");
  const location = useLocation();
  const { pathname } = location;
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentTab = currentTabOf(location);
  const narrow = useNarrowPcWindow();

  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [pathname]);

  return (
    <div className="flex h-dvh flex-col bg-background px-3.5 pb-3.5">
      {/* 상단 바만 글자 선택에서 뺀다. 페이지 상자는 약관처럼 고를 수 있어야 하는 화면도 그린다. */}
      <header className="session-no-drag theme-soft-blue flex h-14 shrink-0 items-center gap-6 px-2.5">
        <div className="flex shrink-0 items-center gap-2">
          <img src={mascotStopwatch} alt="" className="size-7" />
          <span className="text-[15px] font-bold text-foreground">
            {t("logo", { ns: "login" })}
          </span>
        </div>
        <nav aria-label={t("nav.label")} className="flex gap-1">
          {VISIBLE_TABS.map(({ tab, to }) => (
            <Link
              key={tab}
              aria-current={tab === currentTab ? "page" : undefined}
              to={{ pathname: to, search: legacyQuery("") }}
              onClick={() => {
                if (tab !== currentTab) {
                  trackTabPressed({ tab, from_tab: currentTab, via: "pc_top_bar" });
                }
              }}
              className="relative flex h-8 items-center rounded-sm px-3.5 text-sm text-muted-foreground transition-colors duration-150 before:absolute before:inset-x-0 before:-inset-y-1.5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none motion-reduce:transition-none aria-[current=page]:bg-brand-subtle aria-[current=page]:font-medium aria-[current=page]:text-brand-subtle-text"
            >
              {t(`nav.${tab}`)}
            </Link>
          ))}
        </nav>
        <div className="ml-auto">
          <PcProfileMenu />
        </div>
      </header>
      <div className="relative min-h-0 flex-1 transform-gpu overflow-hidden rounded-xl border border-border bg-muted [--tab-bar-reserve:--spacing(2)]">
        <div ref={scrollRef} inert={narrow} className="h-full overflow-y-auto overscroll-contain">
          <Outlet />
        </div>
        {narrow && (
          <p
            role="status"
            className="absolute inset-0 z-60 flex items-center justify-center bg-background px-6 text-center text-[17px] leading-6 font-bold text-foreground"
          >
            {t("shell.narrow")}
          </p>
        )}
      </div>
    </div>
  );
}
