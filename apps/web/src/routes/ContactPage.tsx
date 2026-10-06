import { CONTACT_FORM_URL } from "@/features/settings/settingsInfo";

import { GoogleFormPage } from "./GoogleFormPage";

/** 문의하기 — 설정 지원 섹션에서 문서 단위로 들어온다. */
export function ContactPage() {
  return (
    <GoogleFormPage
      title="문의하기"
      formUrl={CONTACT_FORM_URL}
      loadingText="문의 폼을 불러오는 중"
      failureTitle="문의 폼을 불러오지 못했어요"
      fallbackPath="/settings"
      retryScreen="contact"
    />
  );
}
