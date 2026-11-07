import { useTranslation } from "react-i18next";

/** 선택한 과목을 확인하기 전에는 세션을 열지 않는다. */
export function InitialSubjectError({
  onRetry,
  onBack,
}: {
  onRetry: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation(["study-session", "common"]);
  return (
    <div
      role="alert"
      className="flex grow flex-col items-center justify-center gap-3 px-6 text-center"
    >
      <p className="text-sm text-white/80">{t("subjectSheet.loadFailed")}</p>
      <button
        type="button"
        onClick={onRetry}
        className="min-h-11 rounded-full bg-white/12 px-5 text-sm font-semibold text-white"
      >
        {t("common:actions.retry")}
      </button>
      <button
        type="button"
        onClick={onBack}
        className="min-h-11 px-5 text-sm font-semibold text-white/80"
      >
        {t("common:actions.back")}
      </button>
    </div>
  );
}
