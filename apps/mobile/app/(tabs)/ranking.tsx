import { useIsFocused, useLocalSearchParams } from "expo-router";

import { RemoteScreen } from "../../components/RemoteScreen";
import { RankingTabSkeleton } from "../../components/RemoteSplashSkeletons";
import { remoteScreenInput } from "../../lib/tabDeepLink";

/**
 * 랭킹 탭
 *
 * 화면은 전부 웹이 그리고 여기서는 `RemoteScreen`으로 `/ranking`을 연다.
 */
export default function RankingScreen() {
  const isFocused = useIsFocused();
  // 푸시 알림이 path·at 파라미터로 이 탭 안의 웹 경로를 열 수 있다(`lib/tabDeepLink.ts`).
  const target = remoteScreenInput(
    useLocalSearchParams<{ path?: string; at?: string }>(),
    "/ranking",
  );
  return (
    <RemoteScreen
      key={target.key}
      suppressTabBarMessages={!isFocused}
      testID="ranking-webview"
      path={target.path}
      resetPath={target.resetPath}
      extraQuery={target.extraQuery}
      splash={<RankingTabSkeleton />}
    />
  );
}
