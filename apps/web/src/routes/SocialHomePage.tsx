import { useMutation } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { GraceEndDialog } from "@/features/social-room/GraceEndDialog";
import { IconSocialPeople } from "@/features/social-room/icons";
import { joinErrorReason } from "@/features/social-room/joinError";
import { useSocialRoomNoticeHandoff } from "@/features/social-room/useSocialRoomNoticeHandoff";
import { trackSocialRoomCreateFailed, trackSocialRoomCreated } from "@/lib/amplitude";
import { slideNavigate } from "@/lib/pageTransition";
import { createRoom } from "@/lib/roomApi";
import { showToast } from "@/lib/toast";
import { useUserId } from "@/lib/userId";

/**
 * 소셜 홈
 */
export function SocialHomePage() {
  const { t } = useTranslation(["social-room", "common"]);
  const navigate = useNavigate();
  const location = useLocation();

  const userId = useUserId();

  // 룸에서 밀려나며 남긴 사유를 여기서 알린다.
  const { graceMessage, dismissGrace } = useSocialRoomNoticeHandoff();

  const createMutation = useMutation({
    mutationFn: () => createRoom(),
    onSuccess: (data) => {
      trackSocialRoomCreated();
      // 코드 공유 화면은 조회 API가 없어 router state로 전달한다 — 새로고침·딥링크로 state가
      // 없으면 그 화면이 소셜 홈으로 되돌린다. 쿼리(userId·appVersion)는 통째로 승계한다
      slideNavigate("forward", () =>
        navigate(
          { pathname: "/social/code", search: location.search },
          { state: { roomId: data.roomId, inviteCode: data.inviteCode } },
        ),
      );
    },
    onError: (error: unknown) => {
      // 실패 사유는 토스트에 없다 — 입장 실패와 같은 규칙(코드/HTTP_n/NETWORK_OR_UNKNOWN)으로 남긴다.
      trackSocialRoomCreateFailed(joinErrorReason(error));
      showToast(t("common:errors.retryLater"));
    },
  });

  return (
    <main
      data-testid="social-home-page"
      // 상단 안전영역 규칙은 홈·기록·설정과 동일 (SettingsPage 주석 참고).
      className="theme-soft-blue bg-soft-blue page-column flex min-h-dvh flex-col pb-(--tab-bar-reserve) pt-[calc(env(safe-area-inset-top)+17px)] text-foreground"
    >
      <div className="px-5">
        <h1 className="text-[24px] leading-7.5 font-bold text-foreground">{t("home.title")}</h1>
      </div>

      <div className="flex grow flex-col items-center justify-center gap-2 px-5">
        <div className="flex size-24 items-center justify-center rounded-full bg-brand-subtle text-primary">
          <IconSocialPeople size={40} />
        </div>
        <div className="size-2" aria-hidden="true" />
        <p className="text-lg font-bold text-foreground">{t("home.headline")}</p>
        <p className="text-center text-sm leading-5 text-muted-foreground">
          <Trans t={t} i18nKey="home.description" components={{ br: <br /> }} />
        </p>
        <div className="size-4" aria-hidden="true" />
        <div className="flex w-full gap-2.5">
          <Button
            variant="default"
            size="xl"
            className="shadow-sb-cta flex-1"
            disabled={userId === null || createMutation.isPending}
            onClick={() => {
              createMutation.mutate();
            }}
          >
            {t("home.create")}
          </Button>
          <Button
            variant="subtle"
            size="xl"
            className="w-44"
            onClick={() => {
              // 이전 진입에서 URL에 남은 초대코드가 다시 프리필되지 않게 code만 뺀다 —
              // userId 등 나머지 쿼리는 유지한다. 외부 딥링크는 이 버튼을 거치지 않는다.
              const params = new URLSearchParams(location.search);
              params.delete("code");
              slideNavigate("forward", () =>
                navigate({ pathname: "/social/join", search: params.toString() }),
              );
            }}
          >
            {t("join.title")}
          </Button>
        </div>
      </div>

      <GraceEndDialog message={graceMessage} onClose={dismissGrace} />
    </main>
  );
}
