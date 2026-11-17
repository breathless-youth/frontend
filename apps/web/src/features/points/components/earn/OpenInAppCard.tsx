import { useTranslation } from "react-i18next";

import { openAppStore } from "./openAppStore";

/** 앱 밖 브라우저에서 충전 칸 대신 보이는 안내 카드 */
export function OpenInAppCard() {
  const { t } = useTranslation("points-earn");
  return (
    <section className="flex flex-col gap-2.5 rounded-xl bg-brand-subtle p-4">
      <span className="text-[15px] font-bold break-keep">{t("openInApp.title")}</span>
      <span className="text-[13px] break-keep text-brand-subtle-text">{t("openInApp.body")}</span>
      <button
        type="button"
        onClick={openAppStore}
        className="min-h-11 rounded-md bg-primary text-[15px] font-bold text-primary-foreground"
      >
        {t("openInApp.action")}
      </button>
    </section>
  );
}
