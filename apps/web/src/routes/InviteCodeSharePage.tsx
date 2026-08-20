import { useMutation } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { Toast } from "@/components/ui/toast";
import { joinErrorMessage } from "@/features/social-room/joinErrorCopy";
import { copyInviteCode, shareInvite } from "@/features/social-room/shareInvite";
import { joinRoom } from "@/lib/roomApi";
import { parseUserId } from "@/lib/userId";
import { useToast } from "@/lib/useToast";

/**
 * 초대코드 공유
 *
 * 진입은 `방 만들기` 성공 직후뿐이다. 방 조회 API가 없어 코드가 **router state로만** 온다 —
 * 새로고침·딥링크로 state가 없으면 소셜 홈으로 되돌린다(닫은 뒤 재진입 화면이 없다는 명세 규칙과
 * 일치 — 빈 방 TTL 10분 안에 코드로 입장하면 방은 유지된다).
 */
type ShareState = { roomId: number; inviteCode: string };

function isShareState(state: unknown): state is ShareState {
  return (
    typeof state === "object" &&
    state !== null &&
    typeof (state as ShareState).roomId === "number" &&
    typeof (state as ShareState).inviteCode === "string"
  );
}

export function InviteCodeSharePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { message: toastMessage, showToast } = useToast();

  const userId = parseUserId(searchParams.get("userId"));
  const state: unknown = location.state;

  const joinMutation = useMutation({
    mutationFn: (inviteCode: string) => joinRoom(userId as number, inviteCode),
    onSuccess: () => {
      // TODO(2단계 · 실시간 룸): 카메라 프리뷰(S7-19 고지 포함)로 이동 후 룸 입장.
      // 자리 예약은 30초 TTL이라 STOMP 확정 없이는 자동 해제된다 — 스텁 상태에서 무해하다.
    },
    onError: (error) => {
      showToast(joinErrorMessage(error));
    },
  });

  if (!isShareState(state)) {
    return <Navigate to={{ pathname: "/social", search: location.search }} replace />;
  }

  return (
    <main
      data-testid="invite-code-share-page"
      className="flex min-h-dvh flex-col bg-background pt-[env(safe-area-inset-top)] text-foreground"
    >
      <div className="flex h-[52px] items-center px-2">
        <button
          type="button"
          aria-label="닫기"
          onClick={() => {
            navigate({ pathname: "/social", search: location.search });
          }}
          className="flex size-11 items-center justify-center"
        >
          <X size={22} aria-hidden="true" />
        </button>
      </div>

      <div className="flex grow flex-col items-center justify-center gap-2 px-5">
        <p className="text-lg font-bold text-foreground">방이 만들어졌어요</p>
        <div className="size-2" aria-hidden="true" />
        <div className="flex h-24 w-full items-center justify-center rounded-[20px] bg-invite-surface">
          <p className="text-[40px] font-bold tracking-[8px] text-invite-surface-text">
            {state.inviteCode}
          </p>
        </div>
        <p className="text-sm leading-5 text-muted-foreground">
          모두가 나가면 방과 코드가 사라져요
        </p>
        <div className="size-4" aria-hidden="true" />
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={() => {
              void copyInviteCode(state.inviteCode).then((copied) => {
                showToast(copied ? "복사했어요" : "잠시 후 다시 시도해 주세요");
              });
            }}
            className="flex h-12 items-center justify-center rounded-[14px] bg-bg-layer-2 px-5 text-[15px] font-semibold text-foreground"
          >
            코드 복사
          </button>
          <button
            type="button"
            onClick={() => {
              void shareInvite(state.inviteCode).then((result) => {
                // share 미지원 폴백(복사)만 토스트로 알린다 — 시트가 뜨거나 사용자가 닫은
                // 경우는 OS가 이미 피드백을 줬다.
                if (result === "copied") {
                  showToast("복사했어요");
                }
              });
            }}
            className="flex h-12 items-center justify-center rounded-[14px] bg-share-tonal px-5 text-[15px] font-semibold text-share-tonal-text"
          >
            공유하기
          </button>
        </div>
      </div>

      <div className="px-5 pb-[calc(env(safe-area-inset-bottom)+24px)]">
        <div className="relative flex justify-center">
          {toastMessage !== null && (
            <Toast
              message={toastMessage}
              className="absolute bottom-[calc(100%+12px)] whitespace-nowrap"
            />
          )}
        </div>
        <button
          type="button"
          disabled={userId === null || joinMutation.isPending}
          onClick={() => {
            joinMutation.mutate(state.inviteCode);
          }}
          className="flex h-12 w-full items-center justify-center rounded-[14px] bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-50"
        >
          입장하기
        </button>
      </div>
    </main>
  );
}
