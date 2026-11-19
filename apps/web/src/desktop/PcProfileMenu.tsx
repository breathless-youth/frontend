import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProfileAvatar } from "@/features/profile/ProfileAvatar";
import { resetAmplitudeUser } from "@/lib/amplitude";
import { logoutBrowserGuest } from "@/lib/auth/tokenSource";
import { isNativeBridgeAvailable } from "@/lib/bridge";
import i18n from "@/lib/i18n";
import { isSocialLoginProvider } from "@/lib/nativeSocialLogin";
import { profileQuery } from "@/lib/profileQueries";
import { showToast } from "@/lib/toast";
import { legacyQuery, useUserId } from "@/lib/userId";

const ITEM_CLASS = "min-h-11 gap-2.5 rounded-sm px-2.5 text-sm text-foreground";

/**
 * 상단 바 오른쪽 아바타와 프로필 메뉴
 *
 * 회원 여부는 설정 화면의 계정 섹션처럼 프로필의 로그인 공급자로 구분한다.
 * 신원이 없거나 프로필을 받지 못하면 비회원으로 보고 기본 아바타를 보인다.
 * 앱에서는 비회원에게 로그인을 보이고, 회원의 로그아웃은 설정 화면에서 앱이 맡는다.
 * 브라우저에는 아직 소셜 로그인이 없어 로그인을 숨기고, 회원에게는 쿠키 기반 로그아웃을 보인다.
 */
export function PcProfileMenu() {
  const { t } = useTranslation("desktop");
  const navigate = useNavigate();
  const userId = useUserId();
  const profile = useQuery({ ...profileQuery(userId ?? 0), enabled: userId !== null });

  const go = (pathname: string) => navigate({ pathname, search: legacyQuery("") });
  const isMember = isSocialLoginProvider(profile.data?.loginProvider);
  const inBrowser = !isNativeBridgeAvailable();

  // 새 비회원 번호가 오기 전의 이벤트에 이전 번호가 실리지 않도록 분석 신원부터 뗀다.
  const logout = async () => {
    resetAmplitudeUser();
    await logoutBrowserGuest();
    showToast(i18n.t("common:authSuccess.logout"));
  };

  const avatar = (className: string) => (
    <ProfileAvatar
      colorIndex={profile.data?.colorIndex ?? 0}
      imageUrl={profile.data?.profileImageUrl}
      className={className}
    />
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("profileMenu.open")}
        className="flex size-11 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none"
      >
        {avatar("size-8")}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        // 메뉴는 body로 나가서 상단 바의 Soft Blue 테마가 닿지 않으므로 메뉴에도 단다.
        className="theme-soft-blue flex w-65 flex-col gap-0.5 p-2"
      >
        {profile.data ? (
          <>
            <DropdownMenuLabel className="flex items-center gap-2.5 px-2.5 py-2 font-bold">
              {avatar("size-10 rounded-sm")}
              <span className="min-w-0 truncate">{profile.data.nickname}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="m-0" />
          </>
        ) : null}
        <DropdownMenuItem className={ITEM_CLASS} onSelect={() => go("/settings")}>
          <span className="flex-1">{t("profileMenu.myAccount")}</span>
          <ChevronRight aria-hidden="true" className="size-4 text-text-tertiary" />
        </DropdownMenuItem>
        {inBrowser && isMember ? (
          <DropdownMenuItem className={ITEM_CLASS} onSelect={() => void logout()}>
            {t("profileMenu.logout")}
          </DropdownMenuItem>
        ) : null}
        {inBrowser || isMember ? null : (
          <DropdownMenuItem className={ITEM_CLASS} onSelect={() => go("/settings/login")}>
            {t("profileMenu.login")}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
