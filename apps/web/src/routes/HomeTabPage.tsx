import { ChevronRight } from "lucide-react";
import { useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import inviteFriendsImage from "@/assets/home-invite-friends.png";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/ErrorState";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/Skeleton";
import { DdaySection } from "@/features/home/DdaySection";
import { splitHoursMinutes, todayLabel } from "@/features/home/homeFormat";
import type { HomeSummary } from "@/features/home/homeSummary";
import { useHomeSummary } from "@/features/home/useHomeSummary";
import { runFocusStartFlow } from "@/features/onboarding/focusStartFlow";
import type { OnboardingGuideEntry } from "@/features/onboarding/onboardingGuideSteps";
import { IllustFlame } from "@/features/records/icons";
import { formatDuration } from "@/features/records/recordsFormat";
import { WeekDot } from "@/features/records/StreakBanner";
import { SessionRecoveryDialog } from "@/features/study-session/components/SessionRecoveryDialog";
import { useLaunchSessionRecovery } from "@/features/study-session/useLaunchSessionRecovery";
import { trackFocusStartTapped } from "@/lib/amplitude";
import { getTokenSource } from "@/lib/auth/tokenSource";
import { isNativeBridgeAvailable, postToNative } from "@/lib/bridge";
import { requestSessionStart } from "@/lib/sessionStart";
import { useIdentityPending, useUserId } from "@/lib/userId";
import { cn } from "@/lib/utils";

/**
 * 홈(S1). 네이티브 셸이 `/home?userId=N`으로 로드한다(세션 `/room/:id?userId=N`과 같은 규칙).
 *
 * 시안은 Figma V2 `홈 · 집중률 바 (Soft Blue)`다. 이 화면 서브트리에서만 `theme-soft-blue`로
 * V2 팔레트를 켠다.
 *
 * 탭 전환(소셜·기록·설정)은 네이티브 탭바 소유라 웹 안에서 탭 라우트로 이동하지 않는다.
 * 친구 초대 카드의 소셜 탭 이동도 그래서 `navigate-tab` 브리지로 네이티브에 맡기고,
 * 브라우저 단독 모드에서만 웹 라우트로 직접 간다.
 *
 * "집중 시작"은 `focusStartFlow`의 `runFocusStartFlow`를 거쳐 가이드 미완료면 `/onboarding-guide`로,
 * 완료면 세션 시작 요청(`requestSessionStart`)으로 갈린다.
 */

/** 초대 카드 이중 탭 무시 구간. 탭 전환 애니메이션이 끝나기 전의 재탭만 걸러낸다. */
const SOCIAL_TAP_GUARD_MS = 500;

/** V2 카드 셸 — 반경 20, 테두리 없음, `shadow/card-soft-blue`. */
const CARD_CLASS = "rounded-xl border-0 shadow-sb-card";

function StreakCard({ summary }: { summary: HomeSummary }) {
  return (
    <Card className={cn(CARD_CLASS, "flex items-center gap-4 px-4 pt-4 pb-3")}>
      <IllustFlame width={38} height={44} />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-center gap-1">
          <h2 className="text-[15px] leading-[19px] font-bold text-foreground">
            {summary.streakDays}일 연속 공부 중
          </h2>
          <InfoTooltip label="연속 공부 기준 안내" iconSize={14}>
            하루 10분 이상 공부하면 연속 공부가 이어져요
          </InfoTooltip>
        </div>
        <div className="flex justify-between">
          {summary.weekDays.map((day) => (
            <WeekDot key={day.dateKey} day={day} />
          ))}
        </div>
      </div>
    </Card>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn("flex flex-1 flex-col gap-1", className)}>
      <p className="text-[13px] leading-4 text-muted-foreground">{label}</p>
      <p className="text-lg leading-[22px] font-extrabold text-foreground tabular-nums">{value}</p>
    </div>
  );
}

function StatsCard({ summary }: { summary: HomeSummary }) {
  const { hours, minutes } = splitHoursMinutes(summary.focusSec);
  const focusPercent = Math.round(Math.min(100, Math.max(0, summary.focusRate)));

  return (
    <Card className={cn(CARD_CLASS, "flex flex-col gap-[18px] px-[22px] pt-[22px] pb-5")}>
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-sm leading-[17px] font-bold text-muted-foreground">오늘 순공시간</p>
          <p className="flex items-baseline pt-1.5 pb-2 text-foreground tabular-nums">
            <span className="text-[40px] leading-[48px] font-extrabold tracking-[-1.2px]">
              {hours}
            </span>
            <span className="text-[21px] font-bold">시간</span>
            <span className="ml-1.5 text-[40px] leading-[48px] font-extrabold tracking-[-1.2px]">
              {minutes}
            </span>
            <span className="text-[21px] font-bold">분</span>
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-sm leading-[17px] font-bold text-muted-foreground">집중률</p>
            <p className="text-[15px] leading-[18px] font-extrabold text-primary tabular-nums">
              {focusPercent}%
            </p>
          </div>
          <Progress value={focusPercent} aria-label="집중률" />
        </div>
      </div>

      <div className="h-px bg-border" aria-hidden="true" />

      <div className="flex gap-3">
        <Stat
          label="총 공부시간"
          value={formatDuration(summary.studySec)}
          className="border-r border-border pr-3"
        />
        <Stat label="최대 집중시간" value={formatDuration(summary.longestFocusSec)} />
      </div>
    </Card>
  );
}

function InviteCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 items-center gap-4 rounded-xl bg-brand-subtle px-[22px] py-5 text-left"
    >
      {/* 일러스트는 Figma 원본 PNG다. 글자가 카드의 뜻을 다 전하므로 이미지는 장식이다. */}
      <img src={inviteFriendsImage} alt="" width={64} height={64} className="size-16 shrink-0" />
      <span className="flex min-w-0 flex-1 flex-col gap-1 text-primary">
        <span className="text-base leading-5 font-bold">오늘은 혼자 집중하기 힘든가요?</span>
        <span className="text-sm leading-5">친구들을 초대해서 같이 공부해보세요</span>
        <span className="flex items-center gap-1 pt-0.5 text-xs leading-[15px] font-bold">
          친구 초대하여 공부하기
          <ChevronRight size={12} strokeWidth={2.2} aria-hidden="true" />
        </span>
      </span>
    </button>
  );
}

function HomeContent({ userId }: { userId: number }) {
  const summaryState = useHomeSummary(userId);
  const navigate = useNavigate();
  const location = useLocation();

  /**
   * 가이드 이동 래치. react-router `navigate()`는 무조건 push라 빠른 이중 탭에서 가이드가 두 번
   * 열려(스택에 두 장 쌓여) X를 눌러도 그 아래 가이드가 다시 보인다. 첫 탭만 유효하게 막는다.
   * 세션 시작 경로는 아래 `isStartingRef`가 따로 막는다. 그쪽은 서버 응답을 기다리는 구간이라
   * 이유가 다르다.
   */
  const hasOpenedGuideRef = useRef(false);
  /** 집중 시작이 서버 응답을 기다리는 동안 다시 눌리는 것을 막는다. */
  const isStartingRef = useRef(false);
  /**
   * 초대 카드의 마지막 탭 시각. 빠른 이중 탭이 `navigate-tab`을 두 번 보내면 셸이 `tab_pressed`를
   * 두 번 남긴다. 가이드 래치와 달리 홈 문서는 탭을 오가도 살아 있으므로 영구 래치가 아니라 잠깐만 막는다.
   */
  const lastSocialTapAtRef = useRef(0);

  /**
   * 온보딩 가이드로 이동한다. 현재 쿼리(`?userId=N`)를 잃지 않도록 `entry`만 더해 넘긴다.
   * 쿼리를 잃으면 가이드가 미저장 모드로 뜬다.
   */
  function openOnboardingGuide(entry: OnboardingGuideEntry) {
    if (hasOpenedGuideRef.current) {
      return;
    }
    hasOpenedGuideRef.current = true;
    const params = new URLSearchParams(location.search);
    params.set("entry", entry);
    navigate({ pathname: "/onboarding-guide", search: params.toString() });
  }

  /**
   * 친구 초대 카드 → 소셜 탭. 웹뷰에서는 `navigate-tab` 브리지로 네이티브 탭바를 움직인다.
   * 웹 라우터로 `/social`에 가면 홈 탭 웹뷰 안의 문서만 바뀌어 탭바 활성 표시와 어긋난다.
   * 브라우저 단독 모드에서는 탭바가 없으므로 웹 라우트로 직접 가되 쿼리를 이어받는다.
   */
  function openSocial() {
    const now = Date.now();
    if (now - lastSocialTapAtRef.current < SOCIAL_TAP_GUARD_MS) {
      return;
    }
    lastSocialTapAtRef.current = now;
    if (isNativeBridgeAvailable()) {
      postToNative({ type: "navigate-tab", tab: "social", via: "invite_card", atMs: now });
      return;
    }
    navigate({ pathname: "/social", search: location.search });
  }

  /**
   * "집중 시작". 분기는 `focusStartFlow.runFocusStartFlow`가 소유한다. 이 화면은 그 명세의 웹
   * 구현만 제공한다. 가이드로 갈 때는 `openOnboardingGuide`에, 세션 시작은 `requestSessionStart`
   * (브리지 있으면 발신, 없으면 세션 라우트로 직접 이동)에 그대로 맡긴다.
   */
  function startFocusFlow() {
    // 세션 시작은 서버에 옛 세션 마감을 먼저 보내고 기다린다. 그 사이 한 번 더 누르면 요청과
    // 화면 전환이 두 벌 나가므로 진행 중에는 막는다. 실패로 끝나면 다시 누를 수 있게 푼다.
    if (isStartingRef.current) {
      return;
    }
    isStartingRef.current = true;
    void runFocusStartFlow({
      openOnboardingGuide: (entry) => {
        trackFocusStartTapped("guide");
        openOnboardingGuide(entry);
      },
      startSession: async () => {
        trackFocusStartTapped("session");
        await requestSessionStart(userId, () =>
          navigate({ pathname: "/room/1", search: location.search }),
        );
      },
    })
      .catch((error: unknown) => {
        console.warn("[home] 집중 시작 처리 실패", error);
      })
      .finally(() => {
        isStartingRef.current = false;
      });
  }

  return (
    <>
      {summaryState.status === "pending" && (
        <>
          <Skeleton className="h-[101px] rounded-xl" />
          <Skeleton className="h-[252px] rounded-xl" />
        </>
      )}
      {summaryState.status === "error" && (
        <ErrorState message="기록을 불러오지 못했어요" onRetry={summaryState.retry} screen="home" />
      )}
      {summaryState.status === "success" && (
        <>
          <StreakCard summary={summaryState.summary} />
          <StatsCard summary={summaryState.summary} />
        </>
      )}

      <Button
        size="xl"
        className="w-full text-[17px] leading-[21px] font-bold"
        onClick={startFocusFlow}
      >
        집중 시작
      </Button>

      <InviteCard onClick={openSocial} />
    </>
  );
}

/**
 * 헤더 왼쪽. D-Day API는 토큰 계약뿐이라 토큰 출처가 없는 문서(구 앱 웹뷰·브라우저 단독)에는 예전
 * 로고와 날짜를 그대로 둔다. 출처가 있는데 첫 `auth-token`이 아직이면 스켈레톤이다 — 구 헤더를 먼저
 * 그렸다가 토큰이 오면 D-Day 블록으로 바꾸면 헤더가 리플로우된다(`LiveRoomPage`와 같은 판단).
 */
function HomeHeaderLead({
  userId,
  identityPending,
}: {
  userId: number | null;
  identityPending: boolean;
}) {
  if (getTokenSource() !== null) {
    if (identityPending) {
      return <Skeleton data-testid="home-header-pending" className="h-[54px] w-32 rounded-lg" />;
    }
    if (userId !== null) {
      return <DdaySection userId={userId} />;
    }
  }
  return (
    <>
      <h1 className="text-[24px] leading-[30px] font-bold text-foreground">FocusMakers</h1>
      <p className="text-sm leading-[17px] text-muted-foreground">{todayLabel()}</p>
    </>
  );
}

export function HomeTabPage() {
  const userId = useUserId();
  const identityPending = useIdentityPending();
  const { recovered, dismiss } = useLaunchSessionRecovery(userId);

  return (
    <main
      data-testid="home-tab-page"
      className="theme-soft-blue bg-soft-blue min-h-dvh pb-[var(--tab-bar-reserve)] pt-[calc(env(safe-area-inset-top)+22px)] text-foreground"
    >
      <div className="flex flex-col gap-3 px-5">
        <header className="flex items-end justify-between pb-2">
          <HomeHeaderLead userId={userId} identityPending={identityPending} />
        </header>

        {userId === null ? (
          <p className="p-4 text-sm text-muted-foreground">
            기기 등록 전이에요 — 앱에서 열면 기록이 저장됩니다
          </p>
        ) : (
          <HomeContent userId={userId} />
        )}
      </div>

      {recovered !== null && <SessionRecoveryDialog recovered={recovered} onConfirm={dismiss} />}
    </main>
  );
}
