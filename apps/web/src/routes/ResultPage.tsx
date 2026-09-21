import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import type { StudySessionResponse } from "@focusmakers/types";

import { Button } from "@/components/ui/button";
import { ConfettiBurst } from "@/features/study-session/components/ConfettiBurst";
import { SessionSummaryCard } from "@/features/study-session/components/SessionSummaryCard";
import {
  type CompleteHeroPhase,
  StudyCompleteHero,
} from "@/features/study-session/components/StudyCompleteHero";
import { StudyTimelineCard } from "@/features/study-session/components/StudyTimelineCard";
import { RESULT_COPY } from "@/features/study-session/resultCopy";
import { toSessionResultView } from "@/features/study-session/sessionResult";
import { stageStudyResultExit, trackStudyResultConfirmed } from "@/lib/amplitude";
import { isNativeBridgeAvailable, postToNative } from "@/lib/bridge";
import { prefersReducedMotion } from "@/lib/prefersReducedMotion";
import { useUserId } from "@/lib/userId";

/**
 * 도장 연출이 끝나고 타임라인·통계 카드와 CTA를 드러내기까지의 시간(ms) — BY-557 시안
 * 프로토타입의 3500ms 그대로. 그 전에는 이탈 수단이 없다(프로토타입도 같다).
 */
export const RESULT_REVEAL_DELAY_MS = 3500;

/** 색종이가 터지는 시점(ms) — 도장이 종이에 닿는 순간(도장 모션 46% ≈ 0.92s)에 맞춘 프로토타입 값. */
const CONFETTI_AT_MS = 900;

/**
 * 공부 결과
 *
 * 표시 전용 — 여기서 세션을 측정하거나 제출하지 않는다
 *
 * 측정·상태 판정·서버 제출은 전부 `useStudyRoomSession`과 그 아래 순수 모듈의 책임이다.
 * 이 라우트는 이미 확정된 `StudySessionResponse`를 받아 그리기만 한다.
 *
 * ## 연출 순서 (BY-560, BY-557 시안 프로토타입 "1 · 완료")
 *
 * 1. `intro`: 도장이 찍히고 `오늘 공부 완료!`·순공시간·집중률 배지가 차례로 떠오른다. 카드와
 *    CTA는 없다.
 * 2. `RESULT_REVEAL_DELAY_MS` 뒤 `revealed`: 인주·타이틀이 접혀 올라가고 순공시간 아래로
 *    타임라인(최고 집중 시간 포함)·누적 요약 카드가, 하단에 CTA 둘(`홈으로`·`기록으로 가기`)이
 *    드러난다.
 *
 * 모션 축소(`prefers-reduced-motion`)에서는 연출 없이 처음부터 전부 보여준다(`static`).
 * 시안의 명언 인트로와 연속 공부(스트릭) 화면은 이 티켓 범위 밖이라 없다.
 *
 * ## S4가 **절대** 받지 않는 상태 — 방어 UI를 만들지 않는다
 *
 * `submitting`(제출 중) · `error`(제출 실패) · `unsaved`(userId 없어 미저장) · "저장 실패"는
 * 전부 S3 쪽 상태다. `RoomPage`는 **`phase === "done"`에서만** 여기로 보낸다(WG4와 상호 확인한
 * 계약). 그래서 이 화면에는 "저장 실패" 배너도 재시도 버튼도 없다 — 실패의 사용자 대면 처리는
 * 전적으로 S3의 책임이고, S3에 재시도 경로가 실제로 있다(`RoomPage`의 `다시 제출`).
 *
 * 세션 단건 조회 API(`GET /api/study-sessions/{id}`)는 서버에 있고 조회 함수도
 * `lib/studySessionApi.ts`에 있지만, 이 화면은 아직 쓰지 않는다. 세션은 라우터 state가 유일한
 * 입력이고, state가 없거나 형태가 다르면 **데이터를 지어내지 않고** 홈으로 되돌린다.
 *
 * 예외적으로 **누적 요약 카드**(`SessionSummaryCard`, BY-560)만 저장된 통계를 서버에서 읽는다 —
 * 세션이 아니라 오늘 합계·학습 일 수라 라우터 state에 실을 수 없는 값이다. `?userId`가 없는
 * 미저장 모드에서는 카드를 그리지 않는다.
 */
export function ResultPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const sessions = readSessions(location.state);
  // 목적지는 라우터 state가 아니라 현재 경로에서 판단한다. state는 새로고침·딥링크·렌더러
  // 사망 복원에서 사라질 수 있지만 경로는 남는다 — 소셜 결과 라우트인데 state가 없어 홈 탭으로
  // 튕기던 문제를 막는다.
  const home = resolveHome(location.pathname);
  const userId = useUserId();
  // 마운트 시 한 번만 판정한다 — 연출 도중 설정이 바뀌어도 단계가 섞이지 않게.
  const [reducedMotion] = useState(prefersReducedMotion);
  const [revealed, setRevealed] = useState(reducedMotion);

  /**
   * state 없는 진입(새로고침·딥링크·렌더러 사망 복원)에서도 네이티브에는 홈 복귀 신호를
   * 보낸다(BY-436). 아래 `<Navigate/>`는 웹 라우터 이동일 뿐이라 — `leave` 주석의
   * 이유 그대로 — 세션 `fullScreenModal` 안에 웹 홈이 열린 채 남고, 세션 화면은 Android
   * 뒤로가기까지 막고 있어(`blockHardwareBack`) 사용자가 갇힌다. 브라우저 단독 모드에서는
   * `postToNative`가 무동작이고 웹 폴백이 실제 복귀다.
   */
  useEffect(() => {
    // navigate-home은 솔로 세션의 fullScreenModal을 닫는 신호다. 소셜 결과는 탭 웹뷰라
    // 모달이 없어 보내면 홈 탭으로 튕기므로, 앱 홈으로 되돌릴 때만 보낸다.
    if (sessions === null && home === "/home") {
      postToNative({ type: "navigate-home", atMs: Date.now() });
    }
  }, [sessions, home]);

  // 도장 연출 → 공개. 언마운트(연출 중 이탈)되면 타이머를 걷어 사라진 화면에 setState하지 않는다.
  useEffect(() => {
    if (reducedMotion || sessions === null) {
      return;
    }
    const timer = window.setTimeout(() => setRevealed(true), RESULT_REVEAL_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [reducedMotion, sessions]);

  if (sessions === null) {
    /* TODO(미정: 리더/사용자 확인) state 없는 진입(새로고침·딥링크)의 정확한 처리가 디자인에
       없다. 스펙의 기본안대로 홈으로 리다이렉트한다 — 없는 세션을 지어내거나 빈 결과 화면을
       그리지 않는다(SCR-S4 Interaction Contract).
       `leave`와 같은 목적지·같은 쿼리 보존 규칙을 쓴다 — 두 경로가 갈리면 한쪽만
       고쳐지고 다른 쪽이 남는다. */
    return <Navigate to={{ pathname: home, search: location.search }} replace />;
  }

  /**
   * 이탈 경로는 하단 CTA **둘**뿐이다 — `홈으로`와 `기록으로 가기`. 시안에서 우상단 X가
   * 빠졌고, 둘 다 공개(`revealed`) 뒤에만 있다.
   *
   * **네이티브 앱 안에서는 웹 라우터 이동만으로 부족하다.** 이 화면이 WebView로 로드된
   * 것이라 `navigate("/home")`는 WebView 안의 웹 홈을 열 뿐, 그 WebView를 담고 있는 네이티브
   * `fullScreenModal`을 닫아 탭 화면으로 돌아가지는 못한다(ADR 0001). 그래서 네이티브에
   * `navigate-home`을 먼저 보낸다(`packages/types`의 `NavigateHomeMessage`) — 네이티브가
   * 모달을 닫으면 이 화면 전체가 사라지므로 아래 웹 라우터 이동은 브라우저 단독 모드
   * (ADR 0001)를 위한 폴백이다. 네이티브가 없으면 `postToNative`가 조용히 아무 일도 하지
   * 않는다.
   *
   * **기록으로 가기**는 탭 전환이라 네이티브 탭바 소유다 — 홈 연속 공부 카드와 같은
   * `navigate-tab` 브리지로 넘기고(`HomeTabPage.openRecords`), 발신처는 `study_result`로 실어
   * 네이티브 `tab_pressed.via`가 카드 터치와 섞이지 않게 한다. 솔로는 모달을 먼저 닫아야
   * 탭이 드러나므로 `navigate-home` 뒤에 보낸다. 웹뷰 안 문서는 홈으로 되돌려 둔다 — 소셜은
   * 탭 웹뷰라 결과 화면에 머문 채 남으면 다음에 소셜 탭을 열 때 끝난 결과가 다시 보인다.
   * 브라우저 단독 모드에서는 탭바가 없으니 웹 라우트 `/records`로 직접 간다.
   *
   * 홈 목적지는 `/`가 아니라 `/home`이다 — `/`는 개발용 데모 랜딩이고 앱 홈은 `/home`이다.
   * 쿼리를 함께 넘기지 않으면 `?userId=N`을 잃어 홈·기록이 미저장(브라우저 단독) 모드로 뜬다.
   *
   * `replace: true`: 세션은 이미 끝났다 — 뒤로 가기로 결과 화면에 다시 들어와도 state가 없어
   * 어차피 홈으로 튕긴다. 히스토리에 죽은 항목을 남기지 않는다.
   */
  // 함수 선언은 호이스팅되어 위 null 가드로 `sessions`가 좁혀지지 않는다 — 화살표로 둔다.
  const leave = (via: "home" | "records") => {
    const roomType = home === "/home" ? "single" : "social";
    trackStudyResultConfirmed({ roomType, via });
    /**
     * 설문 트리거(`study_result_exited`)는 여기서 보내지 않고 **예약**만 한다 — 이 화면은 곧
     * 닫힐 웹뷰라 이벤트를 보내도 설문이 열릴 자리가 없다(`lib/amplitude.ts` 핸드오프 주석).
     * 돌아갈 경로를 함께 못박아 그 탭 웹뷰만 가져가게 한다. 자정 분할 세션은 배열로 오므로
     * 합산해야 `study_session_ended`가 보낸 값과 같아진다.
     */
    stageStudyResultExit({
      roomType,
      focusSec: sessions.reduce((sum, session) => sum + session.focusSec, 0),
      consumeAt: via === "records" ? "/records" : home,
    });
    // navigate-home은 솔로 세션의 fullScreenModal을 닫아 네이티브 홈 탭을 드러내는 신호다.
    // 소셜룸은 소셜 탭 웹뷰 안에서 웹 라우팅으로 돌아 모달이 없으므로, 소셜 복귀에 이 신호를
    // 보내면 native가 홈 탭으로 튕긴다. 앱 홈으로 돌아갈 때만 보낸다.
    if (home === "/home") {
      postToNative({ type: "navigate-home", atMs: Date.now() });
    }
    if (via === "records") {
      if (!isNativeBridgeAvailable()) {
        navigate({ pathname: "/records", search: location.search }, { replace: true });
        return;
      }
      postToNative({ type: "navigate-tab", tab: "records", via: "study_result", atMs: Date.now() });
    }
    navigate({ pathname: home, search: location.search }, { replace: true });
  };

  /**
   * TODO(미정: 자정(KST) 분할 세션 표시 — 리더/사용자 확인). `submitStudySession`은
   * `StudySessionResponse[]`를 반환하고 자정을 넘긴 세션은 날짜별 2건으로 분할된다. 이때 S4가
   * 무엇을 보여줄지(합산 1화면 / 2개 카드 / 첫 세션만) 어느 문서에도 없다.
   *
   * **가장 보수적인 처리로 배열의 첫 항목만 렌더한다** — 합산하면 서버가 나눈 귀속 날짜
   * 기준을 화면이 임의로 뭉개게 되고, 2개 카드는 시안 없는 UI를 새로 짓는 일이 된다.
   * 처리 방식이 정해지면 이 한 줄과 아래 렌더만 바꾸면 된다.
   */
  const view = toSessionResultView(sessions[0]);
  const phase: CompleteHeroPhase = reducedMotion ? "static" : revealed ? "revealed" : "intro";

  return (
    <main className="relative flex h-svh w-full flex-col bg-background text-foreground">
      {/* 색종이는 화면 전체를 덮는 장식 캔버스 — 터치를 막지 않는다. */}
      <ConfettiBurst enabled={!reducedMotion} fireAfterMs={CONFETTI_AT_MS} />

      {/* 콘텐츠만 스크롤. 가로는 잠근다 — 히어로의 글로우(340px)·도장 모션이 좁은 화면 폭을 넘는다. */}
      <div className="flex-1 overflow-x-hidden overflow-y-auto px-5 pt-[calc(env(safe-area-inset-top)+44px)] pb-4">
        <StudyCompleteHero view={view} phase={phase} />
        {revealed && (
          <div className="mt-6 flex flex-col gap-3 animate-[result-fade-up_0.5s_cubic-bezier(0.22,1,0.36,1)_0.12s_both] motion-reduce:animate-none">
            <StudyTimelineCard view={view} />
            {userId !== null && <SessionSummaryCard userId={userId} />}
          </div>
        )}
      </div>

      {/* CTA는 하단 고정. OS 크롬(홈 인디케이터)은 그리지 않되 safe-area는 지킨다.
          비율 1 : 1.5 — 주 동선(기록)이 더 넓다(시안). */}
      {revealed && (
        <div className="flex shrink-0 gap-[10px] px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+24px)] animate-[result-fade-up_0.5s_cubic-bezier(0.22,1,0.36,1)_0.12s_both] motion-reduce:animate-none">
          <Button
            type="button"
            variant="secondary"
            size="xl"
            onClick={() => leave("home")}
            className="flex-1 transition-transform duration-150 active:scale-[0.97] motion-reduce:transition-none"
          >
            {RESULT_COPY.ctaHome}
          </Button>
          <Button
            type="button"
            size="xl"
            onClick={() => leave("records")}
            className="flex-[1.5] shadow-[0_6px_16px_color-mix(in_srgb,var(--color-primary)_22%,transparent)] transition-transform duration-150 active:scale-[0.97] motion-reduce:transition-none"
          >
            {RESULT_COPY.ctaRecords}
          </Button>
        </div>
      )}
    </main>
  );
}

/**
 * 라우터 state 검증
 *
 * `location.state`는 `unknown`이고 브라우저 히스토리에 남아 새로고침 후에도 살아 있을 수 있다
 * - 우리가 넣지 않은 값이 들어올 수 있는 구조이다.
 */
function readSessions(state: unknown): [StudySessionResponse, ...StudySessionResponse[]] | null {
  if (typeof state !== "object" || state === null || !("sessions" in state)) {
    return null;
  }
  const { sessions } = state as { sessions: unknown };
  if (!Array.isArray(sessions) || sessions.length === 0 || !sessions.every(isStudySession)) {
    return null;
  }
  return sessions as [StudySessionResponse, ...StudySessionResponse[]];
}

function isStudySession(value: unknown): value is StudySessionResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const session = value as Record<string, unknown>;
  return (
    typeof session.startedAt === "string" &&
    typeof session.endedAt === "string" &&
    typeof session.studySec === "number" &&
    typeof session.focusSec === "number" &&
    typeof session.focusRate === "number" &&
    Array.isArray(session.events)
  );
}

/**
 * CTA가 돌아갈 홈을 현재 경로에서 정한다. 목적지는 솔로의 `/home`과 소셜의 `/social`
 * 둘뿐이고, 소셜 결과 라우트(`/social/room/:id/result`)만 `/social`로 보낸다. 경로는 state와
 * 달리 새로고침·복원에서도 사라지지 않아 단일 원천으로 삼는다.
 */
function resolveHome(pathname: string): "/home" | "/social" {
  return pathname.startsWith("/social/") ? "/social" : "/home";
}
