import { useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { ToastViewport } from "@/components/ui/toast";
import { IconSocialPeople } from "@/features/social-room/icons";
import { consumeSocialRoomNotice } from "@/features/social-room/socialRoomNotice";
import { createRoom } from "@/lib/roomApi";
import { parseUserId } from "@/lib/userId";
import { useToast } from "@/lib/useToast";

/**
 * 소셜 홈
 */
export function SocialHomePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { message: toastMessage, showToast } = useToast();

  const userId = parseUserId(searchParams.get("userId"));

  // 룸에서 밀려나며 남긴 사유를 여기서 알린다(BY-436). 플래그는 1회성이라 소비 결과를 ref에
  // 고정한다 — StrictMode가 이펙트를 두 번 돌려도 두 번째 소비가 null로 굳지 않는다
  // (`SettingsPage`의 프로필 저장 토스트와 같은 패턴).
  const noticeRef = useRef<string | null | undefined>(undefined);
  noticeRef.current ??= consumeSocialRoomNotice();
  useEffect(() => {
    if (noticeRef.current !== null && noticeRef.current !== undefined) {
      showToast(noticeRef.current);
    }
  }, [showToast]);

  const createMutation = useMutation({
    // 버튼이 userId 없이는 비활성이라 여기 도달하면 null이 아니다.
    mutationFn: () => createRoom(userId as number),
    onSuccess: (data) => {
      // 코드 공유 화면은 조회 API가 없어 router state로 전달한다 — 새로고침·딥링크로 state가
      // 없으면 그 화면이 소셜 홈으로 되돌린다. 쿼리(userId·appVersion)는 통째로 승계한다
      navigate(
        { pathname: "/social/code", search: location.search },
        { state: { roomId: data.roomId, inviteCode: data.inviteCode } },
      );
    },
    onError: () => {
      showToast("잠시 후 다시 시도해 주세요");
    },
  });

  return (
    <main
      data-testid="social-home-page"
      // 상단 안전영역 규칙은 홈·기록·설정과 동일 (SettingsPage 주석 참고).
      className="flex min-h-dvh flex-col bg-background pb-6 pt-[calc(env(safe-area-inset-top)+17px)] text-foreground"
    >
      <div className="px-5">
        <h1 className="text-[28px] leading-[34px] font-bold text-foreground">소셜</h1>
      </div>

      <div className="flex grow flex-col items-center justify-center gap-2 px-5">
        <div className="flex size-[88px] items-center justify-center rounded-full bg-brand-subtle text-primary">
          <IconSocialPeople size={40} />
        </div>
        <div className="size-2" aria-hidden="true" />
        <p className="text-lg font-bold text-foreground">친구와 함께 공부해요</p>
        <p className="text-center text-sm leading-5 text-muted-foreground">
          방을 만들어 초대코드를 공유하거나
          <br />
          받은 코드로 참여하세요
        </p>
        <div className="size-4" aria-hidden="true" />
        <div className="flex gap-2.5">
          <button
            type="button"
            disabled={userId === null || createMutation.isPending}
            onClick={() => {
              createMutation.mutate();
            }}
            className="flex h-12 items-center justify-center rounded-[14px] bg-primary px-5 text-[15px] font-semibold text-primary-foreground disabled:opacity-50"
          >
            방 만들기
          </button>
          <button
            type="button"
            onClick={() => {
              navigate({ pathname: "/social/join", search: location.search });
            }}
            className="flex h-12 items-center justify-center rounded-[14px] bg-bg-layer-2 px-5 text-[15px] font-semibold text-foreground"
          >
            초대코드로 참여
          </button>
        </div>
      </div>

      <ToastViewport message={toastMessage} />
    </main>
  );
}
