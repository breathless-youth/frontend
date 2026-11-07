import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";

import { appVersionLabel, CONTACT_FORM_URL } from "@/features/settings/settingsInfo";
import { detectStorePlatform } from "@/features/social-room/storeLink";

import { GoogleFormPage } from "./GoogleFormPage";

/** 문의하기 — 설정 지원 섹션에서 문서 단위로 들어온다. */
export function ContactPage() {
  const { t } = useTranslation("settings");
  const { search } = useLocation();
  const formUrl = new URL(CONTACT_FORM_URL);
  formUrl.searchParams.set(
    "entry.539461458",
    appVersionLabel(
      new URLSearchParams(search).get("appVersion"),
      __WEB_VERSION__,
      detectStorePlatform(navigator.userAgent, navigator.maxTouchPoints),
    ),
  );

  return (
    <GoogleFormPage
      title={t("rows.contact")}
      formUrl={formUrl.toString()}
      loadingText={t("contact.loading")}
      failureTitle={t("contact.failure")}
      fallbackPath="/settings"
      retryScreen="contact"
    />
  );
}
