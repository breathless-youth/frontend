import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { ScreenBackHeader } from "@/components/ScreenBackHeader";
import { trackErrorRetryPressed } from "@/lib/amplitude";
import { canExitViaHistoryBack, hardReplace } from "@/lib/hardNavigation";

/**
 * 구글 폼을 앱 안에서 띄우는 화면 (문의하기·인터뷰 신청)
 *
 * 앱 밖으로 내보내지 않는다. 이용약관·개인정보처리방침과 달리 본문을 텍스트로 옮길 수 없다 —
 * 응답을 제출해야 하는 인터랙티브 폼이라 iframe으로 띄운다(RN 쪽은 WebView).
 *
 * ## 문서 단위 라우트다 (COEP 예외 — 다른 하위 화면과 다른 점)
 *
 * 이 화면을 쓰는 라우트는 SPA 라우팅이 아니라 **하드 내비게이션으로만 진입·이탈한다**(진입 쪽의
 * `hardNavigate`, 아래 뒤로 가기의 `history.back()`/`hardReplace`). 구글 폼 iframe은 CORP
 * 헤더가 없어 COEP `require-corp` 문서에서 네트워크 레벨로 차단되는데, COEP는 문서 요청의
 * 응답에서만 정해지므로 /contact·/interview를 제 문서로 열어야 `vercel.json`의 예외(COEP 미적용)가
 * 실제로 걸린다(`lib/hardNavigation.ts` 주석의 재현 근거 참고). 같은 이유로 이 문서 안에서
 * SPA `navigate`로 다른 라우트에 가면 "COEP 없음"이 그 라우트까지 승계되므로 금지 —
 * 세션(SharedArrayBuffer)이 필요로 하는 교차 출처 격리가 조용히 풀린다.
 *
 * 알려진 트레이드오프: 포워드 스와이프 되열림 방지(`lib/historyGuard.ts`)는
 * same-document POP 전제라 이 라우트를 잡지 못한다 — 닫은 폼 화면이 포워드
 * 제스처로 다시 열릴 수 있다. 폼이 아예 뜨지 않는 것과 맞바꾼 수용 가능한 퇴행이다.
 *
 * ## iframe의 한계
 *
 * RN `WebView`의 `onError`/`onHttpError`는 네트워크 실패와 HTTP 오류를 모두 잡지만, `<iframe>`은
 * 크로스오리진 응답의 상태 코드나 `X-Frame-Options` 거부를 스크립트로 관측할 방법이 없다 —
 * `onError`는 iframe 자체의 로드 실패(예: DNS 실패)에만 반응하고, 임베드가 거부돼도 `onLoad`가
 * 호출될 수 있다. 그래도 로딩 오버레이 + 실패 화면 구조는 유지한다 — 관측 가능한
 * 실패(네트워크 다운 등)는 여전히 잡히고, 나머지는 사용자가 "다시 시도"로 스스로 복구할 수 있다.
 */

const LOAD_FAILURE_BODY = "네트워크 상태를 확인하고 다시 시도해 주세요.";

type GoogleFormPageProps = {
  /** 헤더 제목이자 iframe title */
  title: string;
  /**
   * null이면 열 수 있는 폼이 없다는 뜻이라 바로 실패 화면을 보인다.
   * 빈 문자열이면 주소를 아직 정하는 중이라 iframe 없이 로딩 문구만 보인다.
   */
  formUrl: string | null;
  loadingText: string;
  failureTitle: string;
  /** 뒤로 갈 이전 문서가 없을 때 하드 내비게이션으로 갈 경로 (쿼리 제외) */
  fallbackPath: string;
  /** "다시 시도"를 누른 화면을 구분하는 분석 값 */
  retryScreen: "contact" | "interview_form";
};

export function GoogleFormPage({
  title,
  formUrl,
  loadingText,
  failureTitle,
  fallbackPath,
  retryScreen,
}: GoogleFormPageProps) {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  // iframe을 강제로 다시 마운트해 재로드하기 위한 키 — src를 그대로 두면 브라우저가 재요청하지 않을 수 있다.
  const [reloadKey, setReloadKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const location = useLocation();
  const showFailure = failed || formUrl === null;

  const retry = () => {
    trackErrorRetryPressed(retryScreen);
    setFailed(false);
    setLoading(true);
    setReloadKey((key) => key + 1);
  };

  // 문서 단위 라우트의 뒤로 가기(`lib/hardNavigation.ts`의 canExitViaHistoryBack 주석 참고).
  // 폴백도 SPA가 아니라 하드 내비게이션이어야 한다 — SPA로 가면 이 문서의
  // "COEP 없음"이 다음 화면까지 승계된다. 쿼리(userId·appVersion)는 진입 쪽이 승계해 준
  // 것을 그대로 되돌린다.
  const exitToPreviousDocument = () => {
    if (canExitViaHistoryBack(document.referrer, window.location.origin, window.history.length)) {
      window.history.back();
      return;
    }
    hardReplace(`${fallbackPath}${location.search}`);
  };

  // React-DOM은 <iframe>에 "load" 이벤트만 위임 등록하고 "error"는 등록하지 않는다
  // (react-dom-client.development.js의 `case "iframe": listenToNonDelegatedEvent("load", ...)`).
  // 즉 <iframe onError={...}>는 실제로 절대 호출되지 않는다 — 네이티브 리스너를 직접 붙여야 한다.
  // 대기 상태에서 iframe이 나중에 붙어도 리스너가 걸리도록 formUrl에도 의존한다.
  useEffect(() => {
    const el = iframeRef.current;
    if (!el) return;
    const handleError = () => {
      setLoading(false);
      setFailed(true);
    };
    el.addEventListener("error", handleError);
    return () => el.removeEventListener("error", handleError);
  }, [reloadKey, formUrl]);

  return (
    // `min-h-dvh`가 아니라 `h-dvh`여야 한다 — 최소 높이만 주면 컨테이너 높이가 확정되지
    // 않아 아래 `flex-1`과 iframe의 `height:100%`가 기댈 기준이 없어지고, iframe이 기본
    // 150px로 쪼그라든다(2026-08-01 웹뷰 실기기에서 화면 1/4만 차지하는 것으로 확인).
    <div className="flex h-dvh flex-col bg-background">
      <ScreenBackHeader title={title} onBack={exitToPreviousDocument} />

      {showFailure ? (
        <div className="flex flex-1 flex-col items-center justify-center px-5 pb-[78px]">
          <h1 className="text-center text-[20px] leading-[24px] font-bold text-foreground">
            {failureTitle}
          </h1>
          <p className="mt-[10px] text-center text-[14px] leading-[21px] text-muted-foreground">
            {LOAD_FAILURE_BODY}
          </p>
          {/* 열 수 있는 폼이 없으면 다시 시도해도 같은 결과라 버튼을 숨긴다. */}
          {formUrl !== null && (
            <div className="mt-6 w-full">
              <Button className="w-full" onClick={retry}>
                다시 시도
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="relative flex-1">
          {formUrl !== "" && (
            <iframe
              key={reloadKey}
              ref={iframeRef}
              title={title}
              src={formUrl}
              className="size-full border-0"
              // 폼 제출에 필요한 최소 권한만 켠다.
              sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
              onLoad={() => {
                setLoading(false);
              }}
            />
          )}
          {loading && (
            // 로딩 중에도 iframe을 마운트해 둔다 — 언마운트하면 로드가 처음부터 다시 시작된다.
            <div
              role="status"
              className="absolute inset-0 flex items-center justify-center bg-background"
            >
              <p className="text-[14px] text-muted-foreground">{loadingText}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
