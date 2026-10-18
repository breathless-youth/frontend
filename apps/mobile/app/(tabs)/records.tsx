import { useIsFocused, useLocalSearchParams } from "expo-router";

import { RemoteScreen } from "../../components/RemoteScreen";
import { RecordsTabSkeleton } from "../../components/RemoteSplashSkeletons";
import { remoteScreenInput } from "../../lib/tabDeepLink";

/**
 * S5 · 기록 — 화면 구현체는 `apps/web`이고, 여기서는 `RemoteScreen`(BY-333)으로 `/records`를
 * 로드한다. 달력·통계 조회·리스트 로직은 전부 웹이 소유한다 — 여기에 화면 로직을 넣지 않는다.
 */
export default function RecordsScreen() {
  const isFocused = useIsFocused();
  // 푸시 알림이 path·at 파라미터로 이 탭 안의 웹 경로를 열 수 있다(`lib/tabDeepLink.ts`).
  const target = remoteScreenInput(
    useLocalSearchParams<{ path?: string; at?: string }>(),
    "/records",
  );
  return (
    <RemoteScreen
      key={target.key}
      suppressTabBarMessages={!isFocused}
      testID="records-webview"
      path={target.path}
      resetPath={target.resetPath}
      extraQuery={target.extraQuery}
      splash={<RecordsTabSkeleton />}
    />
  );
}
