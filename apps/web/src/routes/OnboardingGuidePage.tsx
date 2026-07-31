import { useCallback, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  continueAfterOnboardingGuide,
  exitOnboardingGuide,
} from "@/features/onboarding/focusStartFlow";
import { OnboardingGuideFlow } from "@/features/onboarding/OnboardingGuideFlow";
import { parseOnboardingGuideEntry } from "@/features/onboarding/onboardingGuideSteps";
import { requestSessionStart } from "@/lib/sessionStart";

/**
 * G1~G5 온보딩 가이드 — 스펙 `frontend/docs/screens/SCR-G1-G5-onboarding-guide.md`.
 * Figma `68:902`·`68:976`·`68:1057`·`68:1118`·`68:1285`.
 *
 * **라우트는 하나다.** 5개 스텝은 `OnboardingGuideFlow`의 상태이지 별도 화면이 아니다.
 * 진입 경로는 `?entry=` 쿼리로 구분한다:
 *   - `focus-start` — S1 홈 "집중 시작" 최초 탭(종료 후 세션 시작으로 이어짐)
 *   - `home-card` — S1 홈 "공부 측정 가이드" 카드(다시 보기)
 *   - `settings` — S6 설정 "측정 기준 안내"(다시 보기)
 *
 * `userId` 등 나머지 쿼리는 이 화면이 만들지 않은 값이라도 이탈할 때 그대로 승계한다 —
 * 빠뜨리면 홈이 미저장(브라우저 단독) 모드로 뜬다(BY-327 통합에서 발견된 쿼리 유실 버그,
 * `ResultPage`의 `location.search` 승계 패턴과 동일하게 처리한다).
 *
 * (`apps/mobile/app/onboarding-guide.tsx`에서 이식 — BY-334 온보딩 웹 이관.)
 *
 * ## 모바일판과의 차이 (이식 결정)
 *
 * - **`entry` 파라미터**: `expo-router`의 `useLocalSearchParams` 대신 `useLocation().search`를
 *   직접 읽는다(다른 라우트가 쓰는 `useSearchParams`도 동급이지만, 아래 `closeGuide`가 이미
 *   `location.search` 전체를 승계해야 해서 같은 훅으로 통일했다).
 * - **권한 게이트가 없다**: 카메라 권한 요청·거부 안내(S2-3)는 네이티브 소유라(ADR-0003)
 *   `continueAfterOnboardingGuide`의 웹 시그니처에 `showPermissionDeniedGuide`가 없다 —
 *   `focusStartFlow.ts`가 이미 그렇게 이식됐다(그 파일 주석 참고). 그래서 `router.push("/permission-denied")`
 *   분기도 이 파일에 없다.
 * - **상태 바 색 지정이 없다**: RN판은 `<StatusBar style="light" />`로 네이티브 상태 바 아이콘을
 *   강제로 밝게 유지했다. 웹 콘텐츠에는 그런 OS 상태 바 제어 API가 없고(원격 웹뷰 셸에서는
 *   상태 바를 네이티브가 소유), 같은 "항상 다크" 요구가 있는 세션 화면(`RoomPage`)도 별도 처리
 *   없이 다크 배경색만으로 만족시킨다 — 이 화면도 같은 방식(`OnboardingGuideFlow`의 다크
 *   배경)으로 충분해 이식하지 않는다.
 * - **시스템 뒤로가기 처리 TODO를 옮기지 않는다**: RN 주석은 Android 하드웨어 백 / iOS 스와이프
 *   백의 확정 여부를 다뤘는데 둘 다 RN 전용 제스처라 DOM에 대응 개념이 없다. 브라우저 뒤로가기는
 *   `closeGuide`의 "뒤로 갈 스택이 없으면 홈으로" 분기가 그대로 처리한다(별도 리스너 불필요).
 */
export function OnboardingGuidePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const entry = parseOnboardingGuideEntry(
    new URLSearchParams(location.search).get("entry") ?? undefined,
  );

  const closeGuide = useCallback(() => {
    // 실제 앱은 BrowserRouter라 window.history.state.idx로 스택 깊이를 판단한다
    // (`ScreenBackHeader`와 같은 판단). 새로고침·딥링크로 곧장 열렸을 때는 idx가 없다.
    const historyState = window.history.state as { idx?: number } | null;
    if (historyState?.idx) {
      navigate(-1);
      return;
    }
    // 뒤로 갈 스택이 없으면 홈으로 보낸다. `/`는 개발용 데모 랜딩이고 앱 홈은 `/home`이다 —
    // 쿼리를 함께 넘기지 않으면 `?userId=N`을 잃어 홈이 미저장 모드로 뜬다.
    navigate({ pathname: "/home", search: location.search }, { replace: true });
  }, [navigate, location.search]);

  /**
   * 종료 래치(리뷰 반영) — 완료·건너뛰기·X 중 **먼저 발화한 종료 핸들러만 유효**하고 나머지는
   * no-op이다. 이게 없으면 ① X 연타 시 뒤로가기가 두 번 실행돼 가이드 아래 화면까지 닫히고,
   * ② "건너뛰기 직후 X" 근접 클릭에서 명시적으로 나가려 했는데도 세션 시작 경로가 함께 도는
   * 경주가 생긴다(BY-151 "X는 세션으로 이어지지 않는다" 보장 위반).
   */
  const hasClosedRef = useRef(false);

  /**
   * 완료(G5 CTA)와 건너뛰기가 **여기서 갈라지지 않는다** — 2026-07-26 확정
   * "건너뛰어도 세션은 이어서 시작". 그래서 종료 이유를 보지 않는다.
   *
   * **종료당 히스토리 조작은 정확히 한 번**이어야 한다(BY-334 회귀 수정). `closeGuide()`의
   * `navigate(-1)`은 브라우저에서 `history.go(-1)`이 되는데 이건 **비동기**다(popstate가 다음
   * 태스크에 발화). `continueAfterOnboardingGuide()`의 `await`는 마이크로태스크라 그보다 먼저
   * 끝나므로, "닫고 나서 push"(RN 원본과 같은 구조)를 그대로 두면 push가 먼저 실행되고 뒤늦은
   * pop이 그걸 되돌려 사용자가 홈에 남는다(RN의 `router.back()`은 동기라 문제가 없었다 —
   * 플랫폼 차이를 무시한 이식이 원인).
   *
   * 그래서 `entry === "focus-start"`일 때는 가이드를 닫지 않는다 — 세션 라우트로 **대체 이동**
   * (`replace: true`, `requestSessionStart`의 브라우저 폴백)이 유일한 히스토리 조작이 되게 한다.
   * 재진입(`home-card`·`settings`)은 세션으로 이어지지 않으므로 지금처럼 `closeGuide()`만 돈다.
   */
  const handleFinish = useCallback(() => {
    if (hasClosedRef.current) {
      return;
    }
    hasClosedRef.current = true;
    if (entry !== "focus-start") {
      closeGuide();
    }
    void continueAfterOnboardingGuide(
      {
        startSession: () =>
          requestSessionStart(() =>
            navigate({ pathname: "/room/1", search: location.search }, { replace: true }),
          ),
      },
      entry,
    ).catch((error: unknown) => {
      // 여기까지 오면 화면 전환이 실패한 경우다. 어떤 경우에도 세션을 시작하지 않는다.
      console.warn("[onboarding-guide] 가이드 종료 후 처리 실패", error);
    });
  }, [closeGuide, entry, navigate, location.search]);

  /** X 나가기 — 봤음 저장 후 복귀만. 세션 플로우로 이어지지 않는다(2026-07-28 확정). */
  const handleExit = useCallback(() => {
    if (hasClosedRef.current) {
      return;
    }
    hasClosedRef.current = true;
    closeGuide();
    // catch를 붙이지 않는다 — 저장 실패는 store가 내부에서 삼키므로(onboardingGuideStore) 이
    // Promise는 reject하지 않는다. 실패해도 다음 진입 시 가이드가 한 번 더 뜨는 정도의 열화다.
    void exitOnboardingGuide();
  }, [closeGuide]);

  return (
    <OnboardingGuideFlow
      onFinish={handleFinish}
      onExit={handleExit}
      isReentry={entry !== "focus-start"}
    />
  );
}
