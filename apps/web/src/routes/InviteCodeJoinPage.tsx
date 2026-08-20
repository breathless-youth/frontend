import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { ScreenBackHeader } from "@/components/ScreenBackHeader";
import { InviteCodeInput } from "@/features/social-room/InviteCodeInput";
import { isCompleteInviteCode } from "@/features/social-room/inviteCode";
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
  const [code, setCode] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const userId = parseUserId(searchParams.get("userId"));

  const joinMutation = useMutation({
    mutationFn: () => joinRoom(userId as number, code),
    onSuccess: () => {
      // TODO(2단계 · 실시간 룸): 카메라 프리뷰(S7-19 고지 포함)로 이동 후 룸 입장.
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
            joinMutation.mutate();
          }}
          className="flex h-12 w-full items-center justify-center rounded-[14px] bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-50"
        >
          참여하기
        </button>
      </div>
    </main>
  );
}
