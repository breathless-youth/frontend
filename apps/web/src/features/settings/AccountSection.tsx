import { SOCIAL_LOGIN_PROVIDERS } from "@focusmakers/types";
import type { SocialLoginProvider } from "@focusmakers/types";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { trackAccountDeletionFailed, trackSettingsRowPressed } from "@/lib/amplitude";
import {
  hasNativeAccountActions,
  requestNativeDeleteAccount,
  requestNativeLogout,
} from "@/lib/nativeAccount";
import { nativeSocialLoginProviders } from "@/lib/nativeSocialLogin";
import { profileQuery } from "@/lib/profileQueries";
import { showToast } from "@/lib/toast";
import { useUserId } from "@/lib/userId";

import { SettingsRow } from "./SettingsRow";
import { SettingsSection } from "./SettingsSection";

function isSocialLoginProvider(value: unknown): value is SocialLoginProvider {
  return (SOCIAL_LOGIN_PROVIDERS as readonly unknown[]).includes(value);
}

/**
 * 설정 맨 아래 계정 섹션
 *
 * 로그인 지원 앱의 비회원에게 로그인 입구를, 로그인한 사람에게 지원되는 계정 작업을 보인다.
 * 확인을 누르면 앱에 맡기고, 성공하면 앱이 완료 이벤트를 남기고 모든 탭 웹뷰를 새 비회원으로 다시 띄우므로 이 화면은 진행 중인 채로 둔다.
 * 애플 계정의 다시 로그인 창을 닫으면 아무것도 하지 않고 설정에 머문다.
 */
export function AccountSection() {
  const { t } = useTranslation("settings");
  const supported = hasNativeAccountActions();
  const canLogin = nativeSocialLoginProviders().length > 0;
  const navigate = useNavigate();
  const userId = useUserId();
  const profile = useQuery({
    ...profileQuery(userId ?? 0),
    enabled: (supported || canLogin) && userId !== null,
  });
  const [dialog, setDialog] = useState<"logout" | "delete" | null>(null);
  const [pending, setPending] = useState(false);
  // 버튼 비활성은 다음 렌더에 붙어서, 같은 순간의 두 번째 누름은 이 값으로 막는다.
  const inFlightRef = useRef(false);

  const loginProvider = profile.data?.loginProvider;
  if (canLogin && loginProvider === null) {
    return (
      <SettingsSection className="mt-6" label={t("sections.account")}>
        <SettingsRow
          label={t("rows.login")}
          trailing={{ kind: "chevron" }}
          onPress={() => navigate("/settings/login")}
        />
      </SettingsSection>
    );
  }
  if (!supported || !isSocialLoginProvider(loginProvider)) {
    return null;
  }
  const provider = loginProvider;

  async function confirm() {
    if (inFlightRef.current || dialog === null) {
      return;
    }
    inFlightRef.current = true;
    setPending(true);
    const result =
      dialog === "logout"
        ? await requestNativeLogout(provider)
        : await requestNativeDeleteAccount(provider);
    if (result.status === "success") {
      return;
    }
    inFlightRef.current = false;
    setPending(false);
    setDialog(null);
    if (result.status === "failed") {
      if (dialog === "delete") {
        trackAccountDeletionFailed({ provider, reason: result.code });
        showToast(t("account.delete.failed"));
      } else {
        showToast(t("errors.retryLater", { ns: "common" }));
      }
    }
  }

  return (
    <>
      <SettingsSection className="mt-6" label={t("sections.account")}>
        <SettingsRow
          label={t("rows.logout")}
          onPress={() => {
            trackSettingsRowPressed("logout");
            setDialog("logout");
          }}
        />
        <SettingsRow
          label={t("rows.deleteAccount")}
          onPress={() => {
            trackSettingsRowPressed("delete_account");
            setDialog("delete");
          }}
        />
      </SettingsSection>
      <ConfirmDialog
        open={dialog === "logout"}
        title={t("account.logout.title")}
        description={t("account.logout.description")}
        cancelLabel={t("actions.cancel", { ns: "common" })}
        confirmLabel={t("account.logout.confirm")}
        confirmTone="primary"
        pending={pending}
        onCancel={() => setDialog(null)}
        onConfirm={() => void confirm()}
      />
      <ConfirmDialog
        open={dialog === "delete"}
        title={t("account.delete.title")}
        description={t("account.delete.description")}
        cancelLabel={t("actions.cancel", { ns: "common" })}
        confirmLabel={t("account.delete.confirm")}
        pending={pending}
        onCancel={() => setDialog(null)}
        onConfirm={() => void confirm()}
      />
    </>
  );
}
