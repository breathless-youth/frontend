import { ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

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
import { NoticeModalHost } from "@/features/notice/NoticeModalHost";
import { useFocusStart } from "@/features/onboarding/useFocusStart";
import { PlannerPillButton } from "@/features/planner/PlannerPillButton";
import { HomeRankingPopupHost } from "@/features/ranking/exposure/HomeRankingPopupHost";
import { IllustFlame } from "@/features/records/icons";
import { formatDuration } from "@/features/records/recordsFormat";
import { WeekDot } from "@/features/records/StreakBanner";
import { SessionRecoveryDialog } from "@/features/study-session/components/SessionRecoveryDialog";
import { useLaunchSessionRecovery } from "@/features/study-session/useLaunchSessionRecovery";
import { RecentTimelapses } from "@/features/timelapse/RecentTimelapses";
import { prefetchVisionAssets } from "@/features/study-session/vision/prefetchVisionAssets";
import { isNativeBridgeAvailable, postToNative } from "@/lib/bridge";
import { hasTokenSource, useIdentityPending, useUserId } from "@/lib/userId";
import { cn } from "@/lib/utils";
import { prefetchOnboardingGuidePage, prefetchTimelapsesPage } from "@/routes/lazyRoutes";

/**
 * 홈
 *
 * 탭 전환(소셜·기록·랭킹·설정)은 네이티브 탭바 소유라 웹 안에서 탭 라우트로 이동하지 않는다.
 * 친구 초대 카드의 소셜 탭 이동도 그래서 `navigate-tab` 브리지로 네이티브에 맡기고,
 * 브라우저 단독 모드에서만 웹 라우트로 직접 간다.
 *
 * "집중 시작"은 `focusStartFlow`의 `runFocusStartFlow`를 거쳐 가이드 미완료면 `/onboarding-guide`로,
 * 완료면 세션 시작 요청(`requestSessionStart`)으로 갈린다.
 */

/** 초대 카드 이중 탭 무시 구간. 탭 전환 애니메이션이 끝나기 전의 탭 재시도만 걸러낸다. */
const SOCIAL_TAP_GUARD_MS = 500;

const CARD_CLASS = "rounded-xl border-0 shadow-sb-card";

function StreakCard({ summary }: { summary: HomeSummary }) {
  return (
    <Card className={cn(CARD_CLASS, "flex items-center gap-4 px-4 pt-4 pb-3")}>
      <IllustFlame width={38} height={44} />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-center gap-1">
          <h2 className="text-[15px] leading-4.75 font-bold text-foreground">
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
      <p className="text-lg leading-5.5 font-extrabold text-foreground tabular-nums">
        {/* 숫자만 자간을 벌리려고 숫자 덩어리를 따로 감싼다 */}
        {value.split(/(\d+)/).map((part, i) =>
          i % 2 ? (
            <span key={i} className="tracking-[0.9px]">
              {part}
            </span>
          ) : (
            part
          ),
        )}
      </p>
    </div>
  );
}

function StatsCard({ summary }: { summary: HomeSummary }) {
  const { hours, minutes } = splitHoursMinutes(summary.focusSec);
  const focusPercent = Math.round(Math.min(100, Math.max(0, summary.focusRate)));

  return (
    <Card className={cn(CARD_CLASS, "flex flex-col gap-4.5 px-5.5 pt-5.5 pb-5")}>
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-sm leading-4.25 font-bold text-muted-foreground">오늘 순공시간</p>
          <p className="flex items-baseline pt-1.5 pb-2 text-foreground tabular-nums">
            <span className="text-[40px] leading-12 font-extrabold tracking-[2px]">{hours}</span>
            <span className="text-[21px] font-bold">시간</span>
            <span className="ml-1.5 text-[40px] leading-12 font-extrabold tracking-[2px]">
              {minutes}
            </span>
            <span className="text-[21px] font-bold">분</span>
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-sm leading-4.25 font-bold text-muted-foreground">집중률</p>
            <p className="text-[15px] leading-4.5 font-extrabold text-primary tabular-nums">
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
      className="flex min-h-11 items-center rounded-xl bg-brand-subtle px-5.5 py-5 text-left"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1 text-primary">
        <span className="text-base leading-5.5 font-semibold">
          오늘은 혼자 집중하기 힘든가요? <br />
          사람들과 함께 공부해보세요
        </span>{" "}
        <span className="flex items-center gap-1 self-end pt-3.5 text-xs leading-3.75 font-bold">
          그룹 스터디하러 이동
          <ChevronRight size={12} strokeWidth={2.2} aria-hidden="true" />
        </span>
      </span>
    </button>
  );
}

function HomeContent({ userId }: { userId: number }) {
  const summaryState = useHomeSummary(userId);

  /**
   * 통계까지 그린 뒤 세션의 Vision 자원(로더·wasm·모델)을 유휴 시간에 HTTP 캐시로 올려 둔다.
   * 첫 화면·통계와 대역폭을 다투지 않도록 성공한 뒤에만 부른다.
   * 가이드 화면 청크도 같은 때 받는다.
   * 가이드로 가는 슬라이드 전환은 청크를 기다리지 않는다.
   * document당 한 번은 함수가 보장한다.
   */
  const summaryShown = summaryState.status === "success";
  useEffect(() => {
    if (summaryShown) {
      prefetchVisionAssets();
      prefetchOnboardingGuidePage();
      // 맨 아래 최근 타임랩스의 `더보기`도 슬라이드 전환으로 전체 목록을 연다.
      prefetchTimelapsesPage();
    }
  }, [summaryShown]);

  const navigate = useNavigate();
  const location = useLocation();

  const startFocus = useFocusStart(userId);

  /**
   * 초대 카드의 마지막 탭 시각. 빠른 이중 탭이 `navigate-tab`을 두 번 보내면 셸이 `tab_pressed`를
   * 두 번 남긴다. 가이드 래치와 달리 홈 문서는 탭을 오가도 살아 있으므로 영구 래치가 아니라 잠깐만 막는다.
   */
  const lastSocialTapAtRef = useRef(0);

  /**
   * 친구 초대 카드 → 소셜 탭
   *
   * 웹뷰에서는 `navigate-tab` 브리지로 네이티브 탭바를 움직인다.
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

  return (
    <>
      {summaryState.status === "pending" && (
        <>
          <Skeleton className="h-25.25 rounded-xl" />
          <Skeleton className="h-63 rounded-xl" />
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
        className="w-full text-[18px] leading-5.25 font-bold tracking-[0.9px]"
        onClick={() => startFocus("home")}
      >
        집중 시작
      </Button>

      <InviteCard onClick={openSocial} />
      <RecentTimelapses />
    </>
  );
}

/**
 * 헤더
 *
 * 시안대로 좌상단 D-Day 블록, 맞은편에 오늘의 플래너로 가는 버튼이다. D-Day API는 토큰 계약뿐이라 토큰
 * 출처가 없는 문서(구 앱 웹뷰·브라우저 단독)에는 예전 로고와 날짜를 그대로 둔다. 출처가 있는데 첫
 * `auth-token`이 아직이면 스켈레톤이다 — 구 헤더를 먼저 그렸다가 토큰이 오면 D-Day 블록으로 바꾸면
 * 헤더가 리플로우된다(`LiveRoomPage`와 같은 판단).
 */
function HomeHeaderLead({
  userId,
  identityPending,
}: {
  userId: number | null;
  identityPending: boolean;
}) {
  if (hasTokenSource()) {
    // D-Day 블록은 버튼이라 페이지 제목이 없어진다 — 스크린리더용 h1을 숨겨 둔다.
    const hiddenTitle = <h1 className="sr-only">홈</h1>;
    if (identityPending) {
      return (
        <>
          {hiddenTitle}
          <Skeleton data-testid="home-header-pending" className="h-13.5 w-32 rounded-lg" />
        </>
      );
    }
    if (userId !== null) {
      return (
        <>
          {hiddenTitle}
          <DdaySection userId={userId} />
          <PlannerPillButton via="home" className="mt-1 self-start" />
        </>
      );
    }
  }
  return (
    <>
      <h1 className="text-[24px] leading-7.5 font-bold text-foreground">FocusMakers</h1>
      <p className="text-sm leading-4.25 text-muted-foreground">{todayLabel()}</p>
    </>
  );
}

export function HomeTabPage() {
  const userId = useUserId();
  const identityPending = useIdentityPending();
  const { recovered, settled: recoverySettled, dismiss } = useLaunchSessionRecovery(userId);
  // 공지가 복구 창보다 먼저다. 공지 판단이 끝나야 복구 창을 띄운다. 공지 호스트가 없으면 기다릴 것도 없다.
  const [noticeSettled, setNoticeSettled] = useState(false);
  const recoveryReady = userId === null || noticeSettled;
  // 랭킹 팝업이 떠 있는 동안 늦게 온 복구 창은 공지 때처럼 그 팝업이 닫힐 때까지 미룬다.
  const [rankingPopupOpen, setRankingPopupOpen] = useState(false);
  // 이번 실행 표시를 sessionStorage에 쓰지 못한 기기에서도 같은 문서에서는 홈 팝업 하나를 지키도록 메모리에도 둔다.
  const [homePopupInDoc, setHomePopupInDoc] = useState(false);
  const [recoveryInDoc, setRecoveryInDoc] = useState(false);
  if (recovered !== null && !recoveryInDoc) {
    setRecoveryInDoc(true);
  }

  return (
    <main
      data-testid="home-tab-page"
      className="theme-soft-blue bg-soft-blue page-column min-h-dvh pb-(--tab-bar-reserve) pt-[calc(env(safe-area-inset-top)+22px)] text-foreground"
    >
      <div className="flex flex-col gap-3 px-5">
        <header className="flex items-end justify-between pb-2">
          <HomeHeaderLead userId={userId} identityPending={identityPending} />
        </header>

        {identityPending ? (
          // 첫 토큰을 기다리는 동안은 헤더와 같이 로딩이다 — "등록 전"이라고 단정하지 않는다.
          <>
            <Skeleton className="h-25.25 rounded-xl" />
            <Skeleton className="h-63 rounded-xl" />
          </>
        ) : userId === null ? (
          <p className="p-4 text-sm text-muted-foreground">
            기기 등록 전이에요 — 앱에서 열면 기록이 저장됩니다
          </p>
        ) : (
          <HomeContent userId={userId} />
        )}
      </div>

      {userId !== null && (
        <NoticeModalHost
          userId={userId}
          paused={(recovered !== null && recoveryReady) || homePopupInDoc}
          onShown={() => setHomePopupInDoc(true)}
          onSettled={() => setNoticeSettled(true)}
        />
      )}
      {recovered !== null && recoveryReady && !rankingPopupOpen && (
        <SessionRecoveryDialog recovered={recovered} onConfirm={dismiss} />
      )}
      {/*
        랭킹 팝업은 공지·인터뷰·복구 창 다음 차례라 두 판단이 끝난 뒤에 판단한다.
        복구 결과는 실행 신호 기다림이 끝난 뒤에도 늦게 올 수 있다.
        그때 이미 떠 있는 랭킹 팝업은 내리지 않고 복구 창을 그 팝업이 닫힐 때까지 미룬다.
        메달은 띄운 직후 본 것으로 보내서, 내리면 사용자가 못 본 메달이 본 것으로 넘어간다.
      */}
      {userId !== null && (
        <HomeRankingPopupHost
          userId={userId}
          ready={noticeSettled && recoverySettled}
          blocked={homePopupInDoc || recoveryInDoc}
          onOpenChange={(open) => {
            setRankingPopupOpen(open);
            if (open) {
              setHomePopupInDoc(true);
            }
          }}
        />
      )}
    </main>
  );
}
