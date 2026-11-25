import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { signalLaunchReady } from "@/lib/launchReady";

/** 선택한 과목을 확인하기 전에는 세션을 열지 않는다. */
export function InitialSubjectError({
  onRetry,
  onBack,
}: {
  onRetry: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation(["study-session", "common"]);
  // 세션 화면을 그리지 못한 채 멈추므로, 앱이 상한까지 기다리지 않고 덮개를 걷어 이 안내가 바로 보이게 한다.
  useEffect(() => {
    signalLaunchReady();
  }, []);
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
