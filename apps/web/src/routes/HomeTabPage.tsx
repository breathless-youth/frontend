import { useRef } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

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
import { useHomeSummary } from "@/features/home/useHomeSummary";
import { runFocusStartFlow } from "@/features/onboarding/focusStartFlow";
import type { OnboardingGuideEntry } from "@/features/onboarding/onboardingGuideSteps";
import { trackFocusStartTapped } from "@/lib/amplitude";
import { isNativeBridgeAvailable, postToNative } from "@/lib/bridge";
import { SessionRecoveryDialog } from "@/features/study-session/components/SessionRecoveryDialog";
import { useLaunchSessionRecovery } from "@/features/study-session/useLaunchSessionRecovery";
import { requestSessionStart } from "@/lib/sessionStart";
import { parseUserId } from "@/lib/userId";

/**
 * 홈(S1) — `apps/mobile/app/(tabs)/index.tsx`에서 이식 (BY-329).
 * 네이티브 셸이 `/home?userId=N`으로 로드한다(세션 `/room/:id?userId=N`과 같은 계약).
 *
 * RN판과의 동작 차이(의도된 것):
 * - 탭 전환(기록·설정)은 **네이티브 탭바 소유**다 — 웹 안에서 탭 라우트로 이동하지 않는다.
 *   연속 공부 카드의 기록(S5) 연결도 그래서 `navigate-tab` 브리지로 네이티브에 맡긴다
 *   (`openRecords` — 브라우저 단독 모드만 웹 라우트로 직접 이동).
 * - 온보딩 가이드(G1~G5)가 웹으로 이관됐다(BY-334) — "집중 시작"은 `focusStartFlow`의
 *   `runFocusStartFlow`를 거쳐 가이드 미완료면 `/onboarding-guide`로, 완료면 세션 시작
 *   요청(`requestSessionStart`)으로 갈린다. 가이드 카드(다시 보기, entry=home-card)는 최초
 *   1회 판정과 무관하게 `openOnboardingGuide`로 항상 가이드를 연다(RN판 진입 경로 B와 동일).
 */

/** 게이지 눈금 위치(%) — Figma 실측 80/161/241 ÷ 322 = 25·50·75%. */
const GAUGE_MARKERS = [25, 50, 75];

/**
 * 목표 참조용 게이지 (Figma `Card / Hero Today` 39:71 — 트랙 322×12, r999).
 *
 * 눈금 3개는 **채움 위에 있는지에 따라 색이 갈린다**: 채워진 구간에서는 흰색 50%(진한 브랜드색
 * 위에서 읽히는 유일한 색), 빈 구간에서는 `border/strong`(연한 트랙 위라 흰색은 보이지 않는다).
 * 한 색으로 통일하면 둘 중 한쪽 구간에서 눈금이 사라진다.
 *
 * 채움은 단색이 아니라 brand 그라디언트다(왼쪽 50% 투명 → 오른쪽 불투명) — 왼쪽 끝이 트랙에
 * 자연스럽게 녹아든다.
 *
 * 눈금은 **특정 데이터 필드와 연동되지 않는다** — 목표치가 아니라 눈대중용 등분선이다.
 */
function FocusGauge({ fillPercent }: { fillPercent: number }) {
  return (
    <div className="relative h-3 overflow-hidden rounded-full bg-bg-layer-2">
      <div
        className="absolute top-0 left-0 h-3 rounded-full bg-gradient-to-r from-primary/50 to-primary"
        style={{ width: `${fillPercent}%` }}
      />
      {GAUGE_MARKERS.map((percent) => (
        <div
          key={percent}
          className={
            fillPercent > percent
              ? "absolute top-[3px] h-1.5 w-px bg-white/50"
              : "absolute top-[3px] h-1.5 w-px bg-border-strong"
          }
          style={{ left: `${percent}%` }}
        />
      ))}
    </div>
  );
}

function HeroTodayCard({ summary }: { summary: HomeSummary }) {
  const { hours, minutes } = splitHoursMinutes(summary.focusSec);
  const fillPercent = Math.min(100, Math.max(0, summary.focusRate));

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-muted px-5 pt-[22px] pb-[18px]">
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

      <FocusGauge fillPercent={fillPercent} />

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
      {/*
        아이콘 22px — Figma 실측은 18px이지만 **의도적으로 키웠다**(2026-08-01 사용자 확인).
        50px 서클 안에서 18px 삼각형은 여백이 과해 비어 보였다. 서클 크기는 Figma 그대로다.
      */}
      <span className="flex size-[50px] items-center justify-center rounded-full bg-white/20">
        <IconPlay size={22} />
      </span>
    </button>
  );
}

const STAT_CARD_CLASS =
  "flex min-h-11 flex-1 flex-col gap-1 rounded-2xl border border-border bg-muted p-4";

function StatCard({
  variant,
  summary,
  onPress,
}: {
  variant: "streak" | "longest";
  summary: HomeSummary;
  /**
   * 연속 공부 카드만 받는다 — 기록 탭 이동(Figma `Card / Stat` 38:86 "Streak=불꽃+셰브런
   * (기록 탭 이동)", BY-329 이식 때 TODO로 남겼던 연결). 셰브런(이동 어포던스)은 `onPress`가
   * 있을 때만 그린다 — 기록 탭의 SessionListItem에서 확인했듯 누를 수 없는 곳에 셰브런만
   * 남기지 않는다. 터치 타겟은 셰브런이 아니라 **카드 전체**다(12px 아이콘은 타겟으로 너무 작다).
   */
  onPress?: () => void;
}) {
  const isStreak = variant === "streak";

  const content = (
    <>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-text-tertiary">
          {isStreak ? "연속 공부" : "최장 집중"}
        </p>
        {onPress !== undefined && <IconChevronRight size={12} />}
      </div>
      <div className="flex items-center gap-1.5">
        {isStreak && <IllustFlame width={19} height={22} />}
        <p className="text-xl font-bold text-foreground">
          {isStreak ? `${summary.streakDays}일째` : formatMinutes(summary.longestFocusSec)}
        </p>
      </div>
      {/*
        연속 0일 문구는 Figma에 프레임이 없다(있는 건 유지 상태 "하루 10분이면 유지돼요"뿐).
        유지 문구와 같은 리듬("~이면 ~돼요")으로 맞춘다 — 이전 문구("오늘 10분 집중하면 연속
        공부가 시작돼요")는 카드 제목 "연속 공부"를 본문에서 반복하고 11px 한 줄 대비 길었다
        (2026-08-01 사용자 정정 요청).
      */}
      <p className="text-[11px] text-text-tertiary">
        {isStreak
          ? summary.streakDays > 0
            ? "하루 10분이면 유지돼요"
            : "오늘 10분이면 시작돼요"
          : "오늘 가장 길게 집중했어요"}
      </p>
    </>
  );

  if (onPress === undefined) {
    return <div className={STAT_CARD_CLASS}>{content}</div>;
  }
  return (
    <button type="button" onClick={onPress} className={`${STAT_CARD_CLASS} text-left`}>
      {content}
    </button>
  );
}

function GuideCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 items-center justify-between rounded-xl bg-bg-guide px-5 pt-5 pb-[18px] text-left"
    >
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
    </button>
  );
}

function HomeContent({ userId }: { userId: number }) {
  const summaryState = useHomeSummary(userId);
  const navigate = useNavigate();
  const location = useLocation();

  /**
   * 가이드 이동 래치(리뷰 반영, BY-334) — react-router `navigate()`는 RN `router.navigate`(이미
   * 그 화면이면 재사용, push가 아님)와 달리 무조건 push라 빠른 이중 탭에서 가이드가 두 번
   * 열려(스택에 두 장 쌓여) X를 눌러도 그 아래 가이드가 다시 보이는 문제가 그대로 승계된다
   * (`apps/mobile/app/(tabs)/index.tsx:23-28`, BY-151 리뷰 반영 — RN은 라우터가 중복을 막아
   * 주지만 웹은 그 개념이 없어 첫 탭만 유효하게 래치한다). 세션 시작 경로는 아래
   * `isStartingRef`가 따로 막는다 — 그쪽은 서버 응답을 기다리는 구간이라 이유가 다르다.
   */
  const hasOpenedGuideRef = useRef(false);
  /** 집중 시작이 서버 응답을 기다리는 동안 다시 눌리는 것을 막는다. */
  const isStartingRef = useRef(false);

  /**
   * 온보딩 가이드로 이동한다 — 현재 쿼리(`?userId=N`)를 잃지 않도록 `entry`만 얹어
   * 승계한다(`OnboardingGuidePage`의 `location.search` 승계 패턴과 동일 — BY-327에서 쿼리
   * 유실이 실제 버그였다). "집중 시작"(가이드 미완료 시)과 가이드 카드(다시 보기) 둘 다
   * 이 함수를 공유한다 — 목적지가 같으므로 승계·중복 방지 로직도 한 곳이면 된다.
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
   * 연속 공부 카드 → 기록 탭 (Figma `Card / Stat` 38:86 "기록 탭 이동" — BY-329 이식 때
   * TODO로 남겼던 연결).
   *
   * 웹뷰에서는 `navigate-tab` 브리지로 **네이티브 탭바**를 움직인다 — 웹 라우터로
   * `/records`에 가면 홈 탭 웹뷰 안의 문서만 바뀌어 탭바 활성 표시와 어긋난다(기록 탭
   * 웹뷰는 따로 있다). 브라우저 단독 모드에서는 탭바가 없으므로 웹 라우트로 직접 가되,
   * 쿼리를 승계한다(`openOnboardingGuide`와 같은 이유 — 잃으면 기록이 미저장 모드로 뜬다).
   */
  function openRecords() {
    if (isNativeBridgeAvailable()) {
      postToNative({ type: "navigate-tab", tab: "records", atMs: Date.now() });
      return;
    }
    navigate({ pathname: "/records", search: location.search });
  }

  /**
   * "집중 시작" 탭 진입점 (BY-334) — 분기는 `focusStartFlow.runFocusStartFlow`가 소유한다.
   * 이 화면은 그 계약(`FocusStartNavigator`)의 웹 구현만 제공한다: 가이드로 갈 때는
   * `openOnboardingGuide`에, 세션 시작은 `requestSessionStart`(브리지 있으면 발신, 없으면
   * 세션 라우트로 직접 이동)에 그대로 맡긴다.
   */
  function startFocusFlow() {
    // 세션 시작은 서버에 옛 세션 마감을 먼저 보내고 기다린다. 그 사이 한 번 더 누르면 요청과
    // 화면 전환이 두 벌 나가므로 진행 중에는 막는다. 실패로 끝나면 다시 누를 수 있게 푼다.
    if (isStartingRef.current) {
      return;
    }
    isStartingRef.current = true;
    void runFocusStartFlow({
      // 분기 결과를 여기서 찍는다(BY-616 확장) — 가이드 미완료면 가이드, 완료면 세션 요청.
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
      {summaryState.status === "pending" && <Skeleton className="h-[180px] rounded-xl" />}
      {summaryState.status === "error" && (
        <ErrorState message="기록을 불러오지 못했어요" onRetry={summaryState.retry} screen="home" />
      )}
      {summaryState.status === "success" && <HeroTodayCard summary={summaryState.summary} />}

      <StartCtaCard onClick={startFocusFlow} />

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
          <StatCard variant="streak" summary={summaryState.summary} onPress={openRecords} />
          <StatCard variant="longest" summary={summaryState.summary} />
        </div>
      )}

      {/*
        진입 경로 B — 홈 가이드 카드에서의 "다시 보기". 최초 1회 판정과 무관하게 항상 열린다
        (`SCR-G1-G5-onboarding-guide.md` Interaction Contract §1,
        `apps/mobile/app/(tabs)/index.tsx:244-247`).
      */}
      <GuideCard onClick={() => openOnboardingGuide("home-card")} />
    </>
  );
}

export function HomeTabPage() {
  const [searchParams] = useSearchParams();
  const userId = parseUserId(searchParams.get("userId"));
  const { recovered, dismiss } = useLaunchSessionRecovery(userId);

  return (
    <main
      data-testid="home-tab-page"
      className="min-h-dvh bg-background pb-6 pt-[calc(env(safe-area-inset-top)+15px)] text-foreground"
    >
      <div className="flex flex-col gap-3 px-5">
        <header className="flex items-center justify-between">
          <h1 className="text-[17px] font-bold text-foreground">FocusMakers</h1>
          <p className="text-[13px] font-medium text-text-tertiary">{todayLabel()}</p>
        </header>

        {userId === null ? (
          <p className="p-4 text-sm text-muted-foreground">userId 없음 — 브라우저 단독 모드</p>
        ) : (
          <HomeContent userId={userId} />
        )}
      </div>

      {recovered !== null && <SessionRecoveryDialog recovered={recovered} onConfirm={dismiss} />}
    </main>
  );
}
