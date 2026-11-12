import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { ScreenBackHeader } from "@/components/ScreenBackHeader";
import {
  buildChannelProfile,
  ChannelLoadError,
  startChannelTalk,
  toChannelAppearance,
  toChannelLanguage,
} from "@/features/contact-chat/channelTalk";
import type { ChannelAttempt, ChannelLoadFailure } from "@/features/contact-chat/channelTalk";
import { appVersionLabel } from "@/features/settings/settingsInfo";
import { detectStorePlatform } from "@/features/social-room/storeLink";
import {
  trackContactChatLoadFailed,
  trackContactChatOpened,
  trackErrorRetryPressed,
} from "@/lib/amplitude";
import { exitToPreviousDocument } from "@/lib/hardNavigation";
import { reportHandled } from "@/lib/sentry";
import { useIdentityPending, useUserId } from "@/lib/userId";

type ChatState =
  { kind: "loading" } | { kind: "open" } | { kind: "failed"; reason: ChannelLoadFailure };

const FALLBACK_PATH = "/home";

/**
 * 상담 화면 나가기
 *
 * 문서 이동은 컴포넌트 정리를 기다리지 않으므로 상담을 먼저 끄고 이전 문서로 간다.
 */
function leave(attempt: ChannelAttempt | null, search: string): void {
  attempt?.cancel();
  exitToPreviousDocument(FALLBACK_PATH, search);
}

/**
 * 채널톡 상담 화면
 *
 * 채널톡 스크립트가 COEP require-corp 문서에서 차단되어 COEP 예외인 /contact 아래 문서 단위 라우트로 둔다.
 * 그래서 진입과 이탈은 하드 내비게이션으로만 하고, 이 문서 안에서 SPA로 다른 라우트에 가지 않는다.
 * 상담창이 뜨면 화면 전체를 덮고, 상담창을 닫으면 이전 문서로 돌아간다.
 */
export function ContactChatPage() {
  const { t, i18n } = useTranslation(["settings", "interview", "common"]);
  const { search } = useLocation();
  const userId = useUserId();
  // 앱 셸은 신원을 브리지로 늦게 준다. 그 전의 null로 boot하면 상담원이 사용자 번호를 못 본다.
  const identityPending = useIdentityPending();
  const pluginKey = import.meta.env.VITE_CHANNEL_PLUGIN_KEY ?? "";
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const [retryCount, setRetryCount] = useState(0);
  const [state, setState] = useState<ChatState>({ kind: "loading" });
  const failure: ChannelLoadFailure | null =
    pluginKey === "" ? "no_key" : state.kind === "failed" ? state.reason : null;
  // StrictMode가 effect를 두 번 돌려도 같은 화면에서 키 없음은 한 번만 남긴다.
  const noKeyReported = useRef(false);
  const attemptRef = useRef<ChannelAttempt | null>(null);

  useEffect(() => {
    if (pluginKey !== "" || noKeyReported.current) return;
    noKeyReported.current = true;
    trackContactChatLoadFailed("no_key");
  }, [pluginKey]);

  useEffect(() => {
    if (pluginKey === "" || identityPending) return;

    // 정리된 effect의 결과는 화면에 반영하지 않는다.
    // 시도를 끄는 일은 cancel이 맡아 SDK에 넘긴 boot도 바로 끈다.
    let cancelled = false;
    const storePlatform = detectStorePlatform(navigator.userAgent, navigator.maxTouchPoints);
    const attempt = startChannelTalk({
      pluginKey,
      language: toChannelLanguage(locale),
      appearance: toChannelAppearance(document.documentElement.dataset.theme),
      profile: buildChannelProfile({
        appUserId: userId,
        appVersion: appVersionLabel(
          new URLSearchParams(search).get("appVersion"),
          __WEB_VERSION__,
          storePlatform,
        ),
        platform: storePlatform ?? "web",
        locale,
      }),
    });
    attemptRef.current = attempt;
    // 뒤로 가기 캐시에 들어가면 정리 없이 문서가 멈추므로 문서가 숨겨질 때도 시도를 놓는다.
    const onPageHide = () => attempt.cancel();
    window.addEventListener("pagehide", onPageHide);
    attempt.result.then(
      (started) => {
        if (cancelled) return;
        started.onShow(() => trackContactChatOpened());
        started.onHide(() => leave(attempt, search));
        started.openChat();
        setState({ kind: "open" });
      },
      (error: unknown) => {
        if (cancelled) return;
        const reason = error instanceof ChannelLoadError ? error.reason : "script";
        trackContactChatLoadFailed(reason);
        // 키 없음은 설정 상태라 보내지 않고, 상담 기능이 죽는 스크립트·boot 실패만 보낸다.
        reportHandled(error, "contact-chat-load");
        setState({ kind: "failed", reason });
      },
    );
    return () => {
      cancelled = true;
      window.removeEventListener("pagehide", onPageHide);
      attempt.cancel();
      attemptRef.current = null;
    };
  }, [retryCount, identityPending, locale, pluginKey, search, userId]);

  const retry = () => {
    trackErrorRetryPressed("contact_chat");
    setState({ kind: "loading" });
    setRetryCount((value) => value + 1);
  };

  return (
    <div className="flex h-dvh flex-col bg-background">
      <div className="page-column">
        <ScreenBackHeader
          title={t("rows.contact")}
          onBack={() => leave(attemptRef.current, search)}
        />
      </div>

      {failure !== null ? (
        <div className="flex flex-1 flex-col items-center justify-center px-5 pb-19.5 page-width">
          <h1 className="text-center text-[20px] leading-6 font-bold text-foreground">
            {t("contactChat.failure")}
          </h1>
          <p className="mt-2.5 text-center text-[14px] leading-5.25 text-muted-foreground">
            {t("interview:googleForm.failureBody")}
          </p>
          {/* 키가 없으면 다시 시도해도 같은 결과라 버튼을 숨긴다. */}
          {failure !== "no_key" && (
            <div className="mt-6 w-full">
              <Button className="w-full" onClick={retry}>
                {t("common:actions.retry")}
              </Button>
            </div>
          )}
        </div>
      ) : (
        state.kind === "loading" && (
          <div role="status" className="flex flex-1 items-center justify-center">
            <p className="text-[14px] text-muted-foreground">{t("contactChat.loading")}</p>
          </div>
        )
      )}
    </div>
  );
}
