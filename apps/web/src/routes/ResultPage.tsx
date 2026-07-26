import { Navigate, useLocation, useNavigate } from "react-router-dom";

import type { StudySessionResponse } from "@focuson/types";

import { DistractionStatsCard } from "@/features/study-session/components/DistractionStatsCard";
import { ResultHeader } from "@/features/study-session/components/ResultHeader";
import { StudyTimelineCard } from "@/features/study-session/components/StudyTimelineCard";
import { RESULT_COPY } from "@/features/study-session/resultCopy";
import { toSessionResultView } from "@/features/study-session/sessionResult";

/**
 * S4 공부 결과 (Figma `64:534`) — 세션 상태 머신(S3-1~S3-8)의 **종착점**.
 *
 * S3-7 종료 확인에서 직접 끝냈든 S3-8 자동 종료로 끝났든 결과는 이 화면 하나로 수렴하고,
 * CTA `확인`으로 홈으로 빠져나간다(`user-flow.md` `E → F`, `AE → F`, `F → A`).
 *
 * ## 표시 전용 — 여기서 세션을 측정하거나 제출하지 않는다
 *
 * 측정·상태 판정·서버 제출은 전부 `useStudyRoomSession`과 그 아래 순수 모듈의 책임이다.
 * 이 라우트는 이미 확정된 `StudySessionResponse`를 받아 그리기만 한다. 카메라·Vision·타이머
 * 코드가 이 파일에 들어오면 경계 위반이다(SCR-S4 Ownership Boundary).
 *
 * ## S4가 **절대** 받지 않는 상태 — 방어 UI를 만들지 않는다
 *
 * `submitting`(제출 중) · `error`(제출 실패) · `unsaved`(userId 없어 미저장) · "저장 실패"는
 * 전부 S3 쪽 상태다. `RoomPage`는 **`phase === "done"`에서만** 여기로 보낸다(WG4와 상호 확인한
 * 계약). 그래서 이 화면에는 "저장 실패" 배너도 재시도 버튼도 없다 — 실패의 사용자 대면 처리는
 * 전적으로 S3의 책임이고, S3에 재시도 경로가 실제로 있다(`RoomPage`의 `다시 제출`).
 *
 * ## 데이터는 `location.state`로만 온다
 *
 * **세션 단건 조회 API가 없다**(`GET /api/study-sessions/{id}` 계약이 `packages/types`에 없다).
 * 없는 엔드포인트를 상상해 만들지 않는다. 따라서 라우터 state가 유일한 입력이고, state가
 * 없거나 형태가 다르면 **데이터를 지어내지 않고** 홈으로 되돌린다.
 */
export function ResultPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const sessions = readSessions(location.state);

  /**
   * 이탈 경로는 **하나뿐**이다 — CTA `확인`과 우상단 `X`가 같은 콜백을 부른다.
   * Figma에 둘 다 있지만 `design.md` 6차 S4 헤더 행은 CTA만 규정한다: 서로 다른 동작을
   * 상상해 부여하지 않는다.
   *
   * TODO(미정: WebView 호스트 복귀 브리지 — 리더/사용자 확인). 모바일은 이 화면을 WebView로
   * 로드하므로 웹 라우터만으로는 모바일 홈 탭에 갈 수 없다. 그런데 `apps/mobile`에
   * `react-native-webview`도 `postMessage` 규약도 아직 없다(2026-07-26 확인) — 메시지 포맷을
   * 임의로 확정하면 모바일 수신부와 어긋난다. 그래서 복귀 동작을 이 **한 곳**에만 두고,
   * 브리지가 정해지면 이 함수 안에서 호스트 신호를 보낸 뒤 아래 폴백을 남긴다.
   *
   * `replace: true`: 세션은 이미 끝났다 — 뒤로 가기로 결과 화면에 다시 들어와도 state가 없어
   * 어차피 홈으로 튕긴다. 히스토리에 죽은 항목을 남기지 않는다.
   */
  function handleConfirm() {
    navigate("/", { replace: true });
  }

  if (sessions === null) {
    /* TODO(미정: 리더/사용자 확인) state 없는 진입(새로고침·딥링크)의 정확한 처리가 디자인에
       없다. 스펙의 기본안대로 홈으로 리다이렉트한다 — 없는 세션을 지어내거나 빈 결과 화면을
       그리지 않는다(SCR-S4 Interaction Contract). */
    return <Navigate to="/" replace />;
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
    // 세로 전용이다 — S3-5/S3-6의 가로(거치) 모드는 세션 화면 얘기고 S4에는 가로 시안이 없다.
    // 가로 레이아웃을 상상해 만들지 않는다.
    <main className="flex h-svh w-full flex-col bg-background text-foreground">
      {/* 콘텐츠만 스크롤한다. Figma는 CTA를 top 774에 절대 배치했지만 일시정지 행이 붙으면
          통계 카드가 길어져 절대 배치가 반드시 깨진다(SCR-S4 Interaction Contract). */}
      <div className="flex-1 overflow-y-auto px-5 pt-[calc(env(safe-area-inset-top)+5px)] pb-4">
        <ResultHeader view={view} onClose={handleConfirm} />
        {/* 간격은 Figma 실측 — 메타 라인 하단(205) → 타임라인 카드 상단(226) = 21px,
            카드 사이 16px(341 → 357). 절대 좌표 대신 이 관계만 옮긴다. */}
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
 * 라우터 state 검증.
 *
 * `location.state`는 `unknown`이고 브라우저 히스토리에 남아 새로고침 후에도 살아 있을 수 있다 —
 * 즉 **우리가 넣지 않은 값이 들어올 수 있는 입구**다. `as` 캐스팅으로 통과시키지 않고 렌더에
 * 실제로 쓰는 필드만 좁게 검증한다. 검증 실패는 "데이터 없음"과 같게 다룬다.
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
