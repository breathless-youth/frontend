import { useEffect } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import type { StudySessionResponse } from "@focusmakers/types";

import { DistractionStatsCard } from "@/features/study-session/components/DistractionStatsCard";
import { ResultHeader } from "@/features/study-session/components/ResultHeader";
import { StudyTimelineCard } from "@/features/study-session/components/StudyTimelineCard";
import { RESULT_COPY } from "@/features/study-session/resultCopy";
import { toSessionResultView } from "@/features/study-session/sessionResult";
import { postToNative } from "@/lib/bridge";

/**
 * 공부 결과
 *
 * 표시 전용 — 여기서 세션을 측정하거나 제출하지 않는다
 *
 * 측정·상태 판정·서버 제출은 전부 `useStudyRoomSession`과 그 아래 순수 모듈의 책임이다.
 * 이 라우트는 이미 확정된 `StudySessionResponse`를 받아 그리기만 한다.
 *
 * ## S4가 **절대** 받지 않는 상태 — 방어 UI를 만들지 않는다
 *
 * `submitting`(제출 중) · `error`(제출 실패) · `unsaved`(userId 없어 미저장) · "저장 실패"는
 * 전부 S3 쪽 상태다. `RoomPage`는 **`phase === "done"`에서만** 여기로 보낸다(WG4와 상호 확인한
 * 계약). 그래서 이 화면에는 "저장 실패" 배너도 재시도 버튼도 없다 — 실패의 사용자 대면 처리는
 * 전적으로 S3의 책임이고, S3에 재시도 경로가 실제로 있다(`RoomPage`의 `다시 제출`).
 *
 * 세션 단건 조회 API(`GET /api/study-sessions/{id}`)는 서버에 있고 조회 함수도
 * `lib/studySessionApi.ts`에 있지만, 이 화면은 아직 쓰지 않는다. 지금은 라우터 state가 유일한
 * 입력이고, state가 없거나 형태가 다르면 **데이터를 지어내지 않고** 홈으로 되돌린다.
 */
export function ResultPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const sessions = readSessions(location.state);
  const home = readHome(location.state);

  /**
   * state 없는 진입(새로고침·딥링크·렌더러 사망 복원)에서도 네이티브에는 홈 복귀 신호를
   * 보낸다(BY-436). 아래 `<Navigate/>`는 웹 라우터 이동일 뿐이라 — `handleConfirm` 주석의
   * 이유 그대로 — 세션 `fullScreenModal` 안에 웹 홈이 열린 채 남고, 세션 화면은 Android
   * 뒤로가기까지 막고 있어(`blockHardwareBack`) 사용자가 갇힌다. 브라우저 단독 모드에서는
   * `postToNative`가 무동작이고 웹 폴백이 실제 복귀다.
   */
  useEffect(() => {
    if (sessions === null) {
      postToNative({ type: "navigate-home", atMs: Date.now() });
    }
  }, [sessions]);

  /**
   * 이탈 경로는 **하나뿐**이다 — CTA `확인`과 우상단 `X`가 같은 콜백을 부른다.
   * Figma에 둘 다 있지만 `design.md` 6차 S4 헤더 행은 CTA만 규정한다: 서로 다른 동작을
   * 상상해 부여하지 않는다.
   *
   * **네이티브 앱 안에서는 웹 라우터 이동만으로 부족하다.** 이 화면이 WebView로 로드된
   * 것이라 `navigate("/home")`는 WebView 안의 웹 홈을 열 뿐, 그 WebView를 담고 있는 네이티브
   * `fullScreenModal`을 닫아 탭 화면으로 돌아가지는 못한다(ADR 0001). 그래서 네이티브에
   * `navigate-home`을 먼저 보낸다(`packages/types`의 `NavigateHomeMessage`) — 네이티브가
   * 모달을 닫으면 이 화면 전체가 사라지므로 아래 웹 라우터 이동은 브라우저 단독 모드
   * (ADR 0001)를 위한 폴백이다. 네이티브가 없으면 `postToNative`가 조용히 아무 일도 하지
   * 않는다. (2026-07-26에는 이 브리지가 없어 미정으로 남겨 뒀었다 — 2026-07-30 제출 대행
   * 브리지가 생기면서 같은 통로로 해결했다.)
   *
   * 목적지는 `/`가 아니라 `/home`이다 — `/`는 개발용 데모 랜딩이고 앱 홈은 `/home`이다.
   * 쿼리를 함께 넘기지 않으면 `?userId=N`을 잃어 홈이 미저장(브라우저 단독) 모드로 뜬다.
   * (셋을 합치기 전에는 `/`가 유일한 홈이라 드러나지 않던 경로다 — BY-327 통합에서 발견.)
   *
   * `replace: true`: 세션은 이미 끝났다 — 뒤로 가기로 결과 화면에 다시 들어와도 state가 없어
   * 어차피 홈으로 튕긴다. 히스토리에 죽은 항목을 남기지 않는다.
   */
  function handleConfirm() {
    // navigate-home은 솔로 세션의 fullScreenModal을 닫아 네이티브 홈 탭을 드러내는 신호다.
    // 소셜룸은 소셜 탭 웹뷰 안에서 웹 라우팅으로 돌아 모달이 없으므로, 소셜 복귀에 이 신호를
    // 보내면 native가 홈 탭으로 튕긴다. 앱 홈으로 돌아갈 때만 보낸다.
    if (home === "/home") {
      postToNative({ type: "navigate-home", atMs: Date.now() });
    }
    navigate({ pathname: home, search: location.search }, { replace: true });
  }

  if (sessions === null) {
    /* TODO(미정: 리더/사용자 확인) state 없는 진입(새로고침·딥링크)의 정확한 처리가 디자인에
       없다. 스펙의 기본안대로 홈으로 리다이렉트한다 — 없는 세션을 지어내거나 빈 결과 화면을
       그리지 않는다(SCR-S4 Interaction Contract).
       `handleConfirm`과 같은 목적지·같은 쿼리 보존 규칙을 쓴다 — 두 경로가 갈리면 한쪽만
       고쳐지고 다른 쪽이 남는다. */
    return <Navigate to={{ pathname: "/home", search: location.search }} replace />;
  }

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

  return (
    <main className="flex h-svh w-full flex-col bg-background text-foreground">
      {/* 콘텐츠만 스크롤 */}
      <div className="flex-1 overflow-y-auto px-5 pt-[calc(env(safe-area-inset-top)+5px)] pb-4">
        <ResultHeader view={view} onClose={handleConfirm} />
        <div className="mt-[21px] flex flex-col gap-4">
          <StudyTimelineCard view={view} />
          <DistractionStatsCard view={view} />
        </div>
      </div>

      {/* CTA는 하단 고정. OS 크롬(홈 인디케이터)은 그리지 않되 safe-area는 지킨다. */}
      <div className="shrink-0 px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+24px)]">
        <button
          type="button"
          onClick={handleConfirm}
          className="h-14 w-full rounded-2xl bg-primary text-[17px] leading-[20px] font-bold text-primary-foreground transition-opacity duration-200 active:opacity-90 motion-reduce:transition-none"
        >
          {RESULT_COPY.cta}
        </button>
      </div>
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
 * 확인·X이 돌아갈 홈을 라우터 state에서 읽는다. 목적지는 솔로의 `/home`과 소셜의 `/social`
 * 둘뿐이다. `location.state`는 우리가 넣지 않은 값이 들어올 수 있는 입구라(`readSessions`와
 * 같은 원칙) 아는 값만 통과시키고 나머지는 `/home`으로 돌려준다.
 */
function readHome(state: unknown): string {
  if (typeof state === "object" && state !== null && "home" in state) {
    const { home } = state as { home: unknown };
    if (home === "/social") {
      return "/social";
    }
  }
  return "/home";
}
