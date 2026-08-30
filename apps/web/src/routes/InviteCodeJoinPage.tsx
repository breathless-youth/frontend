import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { ScreenBackHeader } from "@/components/ScreenBackHeader";
import { openInApp, shouldAutoOpenInApp } from "@/features/social-room/appHandoff";
import { InviteCodeInput } from "@/features/social-room/InviteCodeInput";
import { isCompleteInviteCode, sanitizeInviteCode } from "@/features/social-room/inviteCode";
import { joinErrorMessage, joinErrorReason } from "@/features/social-room/joinErrorCopy";
import { detectStorePlatform } from "@/features/social-room/storeLink";
import {
  trackInviteLinkOpened,
  trackSocialRoomJoinFailed,
  trackStoreLinkRedirected,
} from "@/lib/amplitude";
import { isNativeBridgeAvailable } from "@/lib/bridge";
import { enterLiveRoom } from "@/lib/roomApi";
import { parseUserId } from "@/lib/userId";

const ERROR_ID = "invite-code-error";

/**
 * 초대코드 입력
 */
export function InviteCodeJoinPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  // 초대 링크(`inviteLink`)로 들어오면 `?code`가 붙어 있다 — 코드를 채운 채 시작한다.
  const [code, setCode] = useState(() => sanitizeInviteCode(searchParams.get("code") ?? ""));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 진입 계측(BY-472) — 공유→입장 전환율의 분모. `has_code`는 **진입 시점** 기준이라
  // 입력 중 상태가 아니라 마운트 1회 스냅샷으로 굳힌다(초대 링크 경유 여부의 의미).
  const [initialHasCode] = useState(() => searchParams.get("code") !== null);
  useEffect(() => {
    trackInviteLinkOpened(initialHasCode);
  }, [initialHasCode]);

  const userId = parseUserId(searchParams.get("userId"));

  // 앱 밖 모바일 브라우저에게만 스토어를 권한다.
  // 설치 여부는 웹이 알 수 없지만, 설치자는 링크 클릭 시 유니버설 링크·App Links로 앱이 직행하므로 이 화면에 오는 것은 대부분 미설치자다.
  const storePlatform = isNativeBridgeAvailable()
    ? null
    : detectStorePlatform(navigator.userAgent, navigator.maxTouchPoints);

  // 인앱 브라우저는 유니버설 링크가 발동하지 않아 앱으로 못 넘어간다.
  // 코드가 실린 링크로 들어왔고 앱 밖 모바일이면, 첫 로드에 한 번 스킴으로 앱 열기를 시도한다.
  const autoOpenTried = useRef(false);
  useEffect(() => {
    if (autoOpenTried.current) return;
    autoOpenTried.current = true;
    if (storePlatform !== null && shouldAutoOpenInApp(navigator.userAgent, code)) {
      openInApp(storePlatform, code);
    }
    // code·storePlatform은 초깃값으로 고정돼 의존성이 바뀌지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const joinMutation = useMutation({
    // 제출 당시의 코드를 변수로 고정한다 — 응답이 오기 전에 입력을 고치면 화면의 code와
    // 실제 참여한 코드가 어긋날 수 있다.
    mutationFn: (submittedCode: string) => enterLiveRoom(userId as number, submittedCode),
    onSuccess: (data, submittedCode) => {
      navigate(
        { pathname: `/social/room/${data.roomId}`, search: location.search },
        {
          state: {
            inviteCode: submittedCode,
            graceRejoin: data.graceRejoin,
            iceServers: data.iceServers,
          },
        },
      );
    },
    onError: (error) => {
      trackSocialRoomJoinFailed(joinErrorReason(error));
      setErrorMessage(joinErrorMessage(error));
    },
  });

  return (
    <main
      data-testid="invite-code-join-page"
      className="flex min-h-dvh flex-col bg-background text-foreground"
    >
      <ScreenBackHeader
        // 기본 폴백(/settings)은 설정 하위 화면 전제라 소셜 홈으로 재정의한다.
        // 쿼리 승계 규칙은 ScreenBackHeader 기본 동작과 동일
        // — 스택이 있으면 뒤로, 딥링크면 소셜 홈으로.
        onBack={() => {
          const historyState = window.history.state as { idx?: number } | null;
          if (historyState?.idx) {
            navigate(-1);
            return;
          }
          navigate({ pathname: "/social", search: location.search }, { replace: true });
        }}
      />

      <div className="flex grow flex-col items-center justify-center gap-2 px-5">
        <p className="text-lg font-bold text-foreground">초대코드를 입력해 주세요</p>
        <div className="size-2" aria-hidden="true" />
        <InviteCodeInput
          value={code}
          onChange={(next) => {
            setCode(next);
            // 다시 입력하기 시작하면 이전 시도의 오류는 오래된 정보다.
            setErrorMessage(null);
          }}
          errorId={errorMessage !== null ? ERROR_ID : undefined}
        />
        {errorMessage !== null ? (
          <p id={ERROR_ID} role="alert" className="text-sm leading-5 text-state-distract-text">
            {errorMessage}
          </p>
        ) : (
          <p className="text-sm leading-5 text-muted-foreground">
            친구에게 받은 4자리 코드로 참여할 수 있어요
          </p>
        )}
      </div>

      <div className="px-5 pb-[calc(env(safe-area-inset-bottom)+24px)]">
        <button
          type="button"
          disabled={userId === null || !isCompleteInviteCode(code) || joinMutation.isPending}
          onClick={() => {
            // 키보드가 열린 채 제출되면 결과(이동·에러 문구)를 키보드가 가린다
            // — 활성 입력을 내린다.
            // 4자리 완성 시 blur(InviteCodeInput)와 별개로, 완성 후 다시 입력칸을 탭해 키보드를 올린 채 제출하는 경로를 막는 보강이다.
            if (document.activeElement instanceof HTMLElement) {
              document.activeElement.blur();
            }
            joinMutation.mutate(code);
          }}
          className="flex h-12 w-full items-center justify-center rounded-[14px] bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-50"
        >
          참여하기
        </button>
        {storePlatform !== null && (
          <button
            type="button"
            onClick={() => {
              // 초대발 신규 설치 근사(BY-472) — 이동 전 전송이 베스트 에포트인 사유는
              // trackStoreLinkRedirected 주석 참고.
              trackStoreLinkRedirected(storePlatform);
              openInApp(storePlatform, isCompleteInviteCode(code) ? code : "");
            }}
            className="mt-2 flex h-12 w-full items-center justify-center rounded-[14px] text-[15px] font-semibold text-muted-foreground"
          >
            앱에서 참여하기
          </button>
        )}
      </div>
    </main>
  );
}
