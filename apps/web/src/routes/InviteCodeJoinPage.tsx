import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { ScreenBackHeader } from "@/components/ScreenBackHeader";
import { InviteCodeInput } from "@/features/social-room/InviteCodeInput";
import { isCompleteInviteCode, sanitizeInviteCode } from "@/features/social-room/inviteCode";
import { joinErrorMessage } from "@/features/social-room/joinErrorCopy";
import { joinRoom } from "@/lib/roomApi";
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

  const userId = parseUserId(searchParams.get("userId"));

  const joinMutation = useMutation({
    // 제출 당시의 코드를 변수로 고정한다 — 응답이 오기 전에 입력을 고치면 화면의 code와
    // 실제 참여한 코드가 어긋날 수 있다.
    mutationFn: (submittedCode: string) => joinRoom(userId as number, submittedCode),
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
      setErrorMessage(joinErrorMessage(error));
    },
  });

  return (
    <main
      data-testid="invite-code-join-page"
      className="flex min-h-dvh flex-col bg-background text-foreground"
    >
      <ScreenBackHeader
        // 기본 폴백(/settings)은 설정 하위 화면 전제라 소셜 홈으로 재정의한다. 쿼리 승계 규칙은
        // ScreenBackHeader 기본 동작과 동일 — 스택이 있으면 뒤로, 딥링크면 소셜 홈으로.
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
            // 다시 입력하기 시작하면 이전 시도의 오류는 낡은 정보다.
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
            // 키보드가 열린 채 제출되면 결과(이동·에러 문구)를 키보드가 가린다 — 활성 입력을
            // 내린다. 4자리 완성 시 blur(InviteCodeInput)와 별개로, 완성 후 다시 입력칸을
            // 탭해 키보드를 올린 채 제출하는 경로를 막는 보강이다.
            if (document.activeElement instanceof HTMLElement) {
              document.activeElement.blur();
            }
            joinMutation.mutate(code);
          }}
          className="flex h-12 w-full items-center justify-center rounded-[14px] bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-50"
        >
          참여하기
        </button>
      </div>
    </main>
  );
}
