export function formatLockedAppsSummary(appCount: number, categoryCount: number): string {
  const parts = [
    ...(appCount > 0 ? [`앱 ${appCount}개`] : []),
    ...(categoryCount > 0 ? [`카테고리 ${categoryCount}개`] : []),
  ];
  return parts.length > 0 ? parts.join(" · ") : "선택 안 함";
}

/** 카테고리는 앱 몇 개인지 셀 수 없어서 카테고리가 섞이면 개수를 말하지 않는다. */
export function formatLockStartedToast(appCount: number, categoryCount: number): string {
  return categoryCount === 0 ? `방해 앱 ${appCount}개를 잠갔어요` : "방해 앱을 잠갔어요";
}

export function formatAppLockRowValue(
  enabled: boolean,
  appCount: number,
  categoryCount: number,
): string {
  if (!enabled) return "꺼짐";
  return appCount + categoryCount > 0 ? formatLockedAppsSummary(appCount, categoryCount) : "켜짐";
}
