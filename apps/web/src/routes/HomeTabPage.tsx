import { useNavigate, useSearchParams } from "react-router-dom";

import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  formatHoursMinutes,
  formatMinutes,
  splitHoursMinutes,
  todayLabel,
} from "@/features/home/homeFormat";
import type { HomeSummary } from "@/features/home/homeSummary";
import { IconChevronRight, IconPlay, IllustFlame, IllustStudyDoodle } from "@/features/home/icons";
import { UpdateNoticeSheetHost } from "@/features/home/UpdateNoticeSheetHost";
import { useHomeSummary } from "@/features/home/useHomeSummary";
import { parseUserId } from "@/lib/userId";

/**
 * 홈(S1) — `apps/mobile/app/(tabs)/index.tsx`에서 이식 (BY-329).
 * 네이티브 셸이 `/home?userId=N`으로 로드한다(세션 `/room/:id?userId=N`과 같은 계약).
 *
 * RN판과의 동작 차이(의도된 것):
 * - 탭 전환(기록·설정)은 **네이티브 탭바 소유**다 — 웹 안에서 탭 라우트로 이동하지 않는다.
 *   그래서 연속 공부 카드의 기록(S5) 연결은 RN판의 TODO 그대로 미연결로 둔다.
 * - 온보딩 가이드(G1~G5)는 아직 웹 미이관 — 가이드 카드·최초 진입 분기(`focusStartFlow`)는
 *   온보딩 웹 이관 티켓에서 연결한다. 그때까지 "집중 시작"은 세션 라우트로 직행한다
 *   (권한 게이트·가이드 분기의 네이티브 배선은 BY-333 셸 전환에서).
 */

function HeroTodayCard({ summary }: { summary: HomeSummary }) {
  const { hours, minutes } = splitHoursMinutes(summary.focusSec);
  const fillPercent = Math.min(100, Math.max(0, summary.focusRate));

  return (
    <section className="flex flex-col gap-3 rounded-[20px] border border-border bg-muted px-5 pt-[22px] pb-[18px]">
      <div className="flex flex-col gap-1.5">
        <p className="text-[13px] font-medium text-muted-foreground">오늘 순공시간</p>
        <p className="flex items-baseline gap-1 text-foreground">
          <span className="text-[46px] font-bold">{hours}</span>
          <span className="text-[21px] font-bold">시간</span>
          <span className="w-1.5" />
          <span className="text-[46px] font-bold">{minutes}</span>
          <span className="text-[21px] font-bold">분</span>
        </p>
      </div>

      {/* 목표 참조용 게이지 — 25/50/75% 눈금은 Figma 디자인 그대로이며 특정 데이터 필드와 연동되지 않는다 */}
      <div className="h-3 overflow-hidden rounded-full bg-bg-layer-2">
        <div className="h-3 rounded-full bg-primary" style={{ width: `${fillPercent}%` }} />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-[13px] text-muted-foreground">
          총 공부 {formatHoursMinutes(summary.studySec)}
        </p>
        <p className="rounded-full bg-brand-subtle px-[9px] py-[3px] text-xs font-semibold text-primary">
          {Math.round(summary.focusRate)}% 집중
        </p>
      </div>
    </section>
  );
}

function StartCtaCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="집중 시작. 누르면 바로 측정이 시작돼요"
      className="flex min-h-11 items-center justify-between rounded-[18px] bg-primary px-5 py-[22px] text-left shadow-[0_6px_18px_rgba(27,100,218,0.28)]"
    >
      <span className="flex flex-col gap-1">
        <span className="text-[21px] font-bold text-white">집중 시작</span>
        <span className="text-[12.5px] text-white/80">누르면 바로 측정이 시작돼요</span>
      </span>
      <span className="flex size-[50px] items-center justify-center rounded-full bg-white/20">
        <IconPlay size={18} />
      </span>
    </button>
  );
}

function StatCard({ variant, summary }: { variant: "streak" | "longest"; summary: HomeSummary }) {
  const isStreak = variant === "streak";

  return (
    // RN판도 기록(S5) 연결이 TODO였고, 웹에서 탭 전환은 네이티브 탭바 소유라 비인터랙티브로 둔다.
    <div className="flex min-h-11 flex-1 flex-col gap-1 rounded-2xl border border-border bg-muted p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-text-tertiary">
          {isStreak ? "연속 공부" : "최장 집중"}
        </p>
        {isStreak && <IconChevronRight size={12} />}
      </div>
      <div className="flex items-center gap-1.5">
        {isStreak && <IllustFlame width={19} height={22} />}
        <p className="text-xl font-bold text-foreground">
          {isStreak ? `${summary.streakDays}일째` : formatMinutes(summary.longestFocusSec)}
        </p>
      </div>
      <p className="text-[11px] text-text-tertiary">
        {isStreak
          ? summary.streakDays > 0
            ? "하루 10분이면 유지돼요"
            : "오늘 10분 집중하면 연속 공부가 시작돼요"
          : "오늘 가장 길게 집중했어요"}
      </p>
    </div>
  );
}

function GuideCard() {
  return (
    // TODO(온보딩 웹 이관 티켓): G1~G5 가이드가 웹으로 오면 onClick으로 연다(진입 경로 B — 다시 보기).
    <div className="flex items-center justify-between rounded-[20px] bg-bg-guide px-5 pt-5 pb-[18px]">
      <div className="flex shrink flex-col gap-1.5">
        <p className="text-base font-bold text-foreground">공부 측정 가이드</p>
        <p className="text-[13px] leading-5 whitespace-pre-line text-muted-foreground">
          {"내 진짜 순공시간,\n어떻게 재는 걸까요?"}
        </p>
        <p className="flex items-center gap-1 text-[13px] font-semibold text-primary">
          지금 확인해 보세요
          {/* 가이드 카드 링크의 셰브런은 브랜드 색이다(스탯 카드의 회색 셰브런과 다름 — Figma 확인) */}
          <IconChevronRight size={12} color="var(--color-primary)" />
        </p>
      </div>
      <IllustStudyDoodle width={96} height={75} />
    </div>
  );
}

function HomeContent({ userId }: { userId: number }) {
  const summaryState = useHomeSummary(userId);
  const navigate = useNavigate();

  return (
    <>
      {summaryState.status === "pending" && <Skeleton className="h-[180px] rounded-[20px]" />}
      {summaryState.status === "error" && (
        <ErrorState message="기록을 불러오지 못했어요" onRetry={summaryState.retry} />
      )}
      {summaryState.status === "success" && <HeroTodayCard summary={summaryState.summary} />}

      <StartCtaCard onClick={() => navigate(`/room/1?userId=${userId}`)} />

      <p className="px-1 text-center text-xs text-text-tertiary">
        카메라가 자동으로 측정해요 · 영상은 저장되지 않아요
      </p>

      {summaryState.status === "pending" && (
        <div className="flex gap-3">
          <Skeleton className="h-[92px] flex-1 rounded-2xl" />
          <Skeleton className="h-[92px] flex-1 rounded-2xl" />
        </div>
      )}
      {summaryState.status === "success" && (
        <div className="flex gap-3">
          <StatCard variant="streak" summary={summaryState.summary} />
          <StatCard variant="longest" summary={summaryState.summary} />
        </div>
      )}

      <GuideCard />
    </>
  );
}

export function HomeTabPage() {
  const [searchParams] = useSearchParams();
  const userId = parseUserId(searchParams.get("userId"));

  return (
    <main
      data-testid="home-tab-page"
      className="min-h-dvh bg-background pb-6 pt-[calc(env(safe-area-inset-top)+15px)] text-foreground"
    >
      <div className="flex flex-col gap-3 px-5">
        <header className="flex items-center justify-between">
          <h1 className="text-[17px] font-bold text-foreground">FocusON</h1>
          <p className="text-[13px] font-medium text-text-tertiary">{todayLabel()}</p>
        </header>

        {userId === null ? (
          <p className="p-4 text-sm text-muted-foreground">userId 없음 — 브라우저 단독 모드</p>
        ) : (
          <HomeContent userId={userId} />
        )}
      </div>

      {/* U1 업데이트 안내 시트 — 기본은 비노출이라 평소에는 아무것도 렌더하지 않는다. */}
      <UpdateNoticeSheetHost />
    </main>
  );
}
