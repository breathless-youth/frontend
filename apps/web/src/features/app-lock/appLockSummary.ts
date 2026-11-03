import i18n from "@/lib/i18n";

export function formatLockedAppsSummary(appCount: number, categoryCount: number): string {
  const parts = [
    ...(appCount > 0 ? [i18n.t("app-lock:summary.apps", { count: appCount })] : []),
    ...(categoryCount > 0 ? [i18n.t("app-lock:summary.categories", { count: categoryCount })] : []),
  ];
  return parts.length > 0 ? parts.join(" · ") : i18n.t("app-lock:summary.none");
}

/** 카테고리는 앱 몇 개인지 셀 수 없어서 카테고리가 섞이면 개수를 말하지 않는다. */
export function formatLockStartedToast(appCount: number, categoryCount: number): string {
  return categoryCount === 0
    ? i18n.t("app-lock:toast.lockedApps", { count: appCount })
    : i18n.t("app-lock:toast.locked");
}

export function formatAppLockRowValue(
  enabled: boolean,
  appCount: number,
  categoryCount: number,
): string {
  if (!enabled) return i18n.t("app-lock:rowValue.off");
  return appCount + categoryCount > 0
    ? formatLockedAppsSummary(appCount, categoryCount)
    : i18n.t("app-lock:rowValue.on");
}
