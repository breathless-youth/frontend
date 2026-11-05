import type { SocialLoginProvider } from "@focusmakers/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate } from "react-router-dom";

import appleIcon from "@/assets/icons/login-apple.svg";
import googleIcon from "@/assets/icons/login-google.svg";
import kakaoIcon from "@/assets/icons/login-kakao.svg";
import { ScreenBackHeader } from "@/components/ScreenBackHeader";
import { Button } from "@/components/ui/button";
import { baseSearch } from "@/features/group-room/groupTabSearch";
import { useBackTo } from "@/features/group-room/useBackTo";
import {
  trackLoginScreenViewed,
  trackSocialLoginFailed,
  trackSocialLoginSucceeded,
} from "@/lib/amplitude";
import type { LoginEntry } from "@/lib/amplitude";
import i18n from "@/lib/i18n";
import { nativeSocialLoginProviders, requestNativeSocialLogin } from "@/lib/nativeSocialLogin";
import { profileKeys } from "@/lib/profileQueries";
import { studyDaysQuery } from "@/lib/statsQueries";
import { showToast } from "@/lib/toast";
import { useUserId } from "@/lib/userId";
import { cn } from "@/lib/utils";

/**
 * 공급자 버튼의 모양
 *
 * 각 회사의 로그인 버튼 지침을 따르는 브랜드 색이라 테마 토큰을 쓰지 않고 다크 화면에서도 그대로 둔다.
 * 순서는 앱이 알린 순서가 아니라 이 표의 순서다.
 */
const PROVIDER_BUTTONS: { provider: SocialLoginProvider; icon: string; className: string }[] = [
  {
    provider: "GOOGLE",
    icon: googleIcon,
    className: "border border-[#e5e8eb] bg-white text-[#191f28]",
  },
  { provider: "APPLE", icon: appleIcon, className: "bg-black text-white" },
  { provider: "KAKAO", icon: kakaoIcon, className: "bg-[#fee500] text-black/85" },
];

/**
 * 동의 문구 안 약관 링크
 *
 * 12px 글자만으로는 누르기 어려워 흐름 안에서 44px 상자로 키운다.
 * 바깥으로 덧댄 영역은 두 링크가 위아래 줄로 나뉘면 겹치므로 쓰지 않는다.
 */
const LEGAL_LINK_CLASS =
  "inline-flex min-h-11 min-w-11 items-center justify-center whitespace-nowrap underline underline-offset-2";

/**
 * 비회원에게 그룹 탭 대신 보이는 로그인 화면
 *
 * 앱이 알린 공급자 버튼만 보이고, 로그인은 앱에 맡긴 뒤 결과만 받아 처리한다.
 * 로그인에 성공하면 앱이 모든 조회를 다시 불러와 게이트가 회원으로 바뀌고, 같은 주소가 그대로 그룹 화면을 그린다.
 * 새로 가입한 사람만 프로필을 정하러 보낸다.
 * 이 기기에 공부 기록이 있을 때만 그 기록이 계정으로 이어진다는 안내를 보인다.
 */
export function GroupLoginScreen({ entry }: { entry: LoginEntry }) {
  const { t } = useTranslation("login");
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const back = useBackTo("/social");
  const userId = useUserId();
  const studyDays = useQuery({ ...studyDaysQuery(userId ?? 0), enabled: userId !== null });
  const [busy, setBusy] = useState(false);
  const viewedRef = useRef(false);
  // 버튼 비활성은 다음 렌더에 붙어서, 같은 순간의 두 번째 누름은 이 값으로 막는다.
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (viewedRef.current) {
      return;
    }
    viewedRef.current = true;
    trackLoginScreenViewed(entry);
  }, [entry]);

  const available = nativeSocialLoginProviders();
  const isTabRoot = location.pathname === "/social";
  const search = baseSearch(location.search);

  async function login(provider: SocialLoginProvider) {
    if (inFlightRef.current) {
      return;
    }
    inFlightRef.current = true;
    setBusy(true);
    const result = await requestNativeSocialLogin(provider);
    inFlightRef.current = false;
    // 로그인으로 신원이 바뀌면 게이트가 이 화면을 먼저 내릴 수 있어 성공 처리는 화면이 남았는지와 상관없이 한다.
    if (result.status === "success") {
      trackSocialLoginSucceeded({ provider, isNewUser: result.isNewUser });
      if (result.isNewUser) {
        navigate({ pathname: "/profile", search }, { replace: true });
      }
    } else if (result.status === "failed") {
      trackSocialLoginFailed({ provider, reason: result.code });
    }
    if (!mountedRef.current) {
      return;
    }
    setBusy(false);
    if (result.status !== "failed") {
      return;
    }
    if (result.code === "ALREADY_LINKED") {
      // 이미 회원인데 오래된 프로필로 이 화면이 열린 경우라 다시 받아 게이트가 고치게 한다.
      void queryClient.invalidateQueries({ queryKey: profileKeys.all });
    } else if (result.code === "SOCIAL_PROVIDER_UNAVAILABLE") {
      showToast(i18n.t("common:errors.retryLater"));
    } else {
      showToast(t("errors.failed"));
    }
  }

  return (
    <main
      className={cn(
        "page-column flex min-h-dvh flex-col bg-background text-foreground",
        isTabRoot
          ? "pt-[env(safe-area-inset-top)] pb-(--tab-bar-reserve)"
          : "pb-[env(safe-area-inset-bottom)]",
      )}
    >
      {!isTabRoot && <ScreenBackHeader onBack={back} />}
      <div className="flex flex-1 flex-col px-5 pb-6">
        <div className="flex flex-1 items-center justify-center py-10">
          <div role="img" aria-label={t("logo")} className="splash-logo size-42" />
        </div>
        {(studyDays.data?.totalDays ?? 0) > 0 && (
          <div className="mb-5 rounded-lg bg-muted px-4 py-3.5 text-center break-keep">
            <p className="text-[15px] leading-5.5 font-semibold">{t("carryOver.title")}</p>
            <p className="mt-1 text-[13px] leading-4.5 text-muted-foreground">
              {t("carryOver.body")}
            </p>
          </div>
        )}
        <div className="flex flex-col gap-3">
          {PROVIDER_BUTTONS.filter(({ provider }) => available.includes(provider)).map(
            ({ provider, icon, className }) => (
              <Button
                key={provider}
                variant="unstyled"
                size="xl"
                className={cn("relative w-full", className)}
                disabled={busy}
                onClick={() => void login(provider)}
              >
                <img src={icon} alt="" className="absolute left-5" />
                {t(`providers.${provider}`)}
              </Button>
            ),
          )}
        </div>
        <p className="mt-4 text-center text-xs leading-4.5 break-keep text-muted-foreground">
          <Trans
            t={t}
            i18nKey="consent"
            components={{
              terms: <Link to={{ pathname: "/terms", search }} className={LEGAL_LINK_CLASS} />,
              privacy: <Link to={{ pathname: "/privacy", search }} className={LEGAL_LINK_CLASS} />,
            }}
          />
        </p>
      </div>
    </main>
  );
}
