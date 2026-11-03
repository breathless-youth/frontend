import { useTranslation } from "react-i18next";

import { CONTACT_FORM_URL } from "@/features/settings/settingsInfo";

import { GoogleFormPage } from "./GoogleFormPage";

/** 문의하기 — 설정 지원 섹션에서 문서 단위로 들어온다. */
export function ContactPage() {
  const { t } = useTranslation("settings");
  return (
    <GoogleFormPage
      title={t("rows.contact")}
      formUrl={CONTACT_FORM_URL}
      loadingText={t("contact.loading")}
      failureTitle={t("contact.failure")}
      fallbackPath="/settings"
      retryScreen="contact"
    />
  );
}
