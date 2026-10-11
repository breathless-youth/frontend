import { useIsFocused } from "expo-router";

import { RemoteScreen } from "../../components/RemoteScreen";
import { RankingTabSkeleton } from "../../components/RemoteSplashSkeletons";

/**
 * 랭킹 탭
 *
 * 화면은 전부 웹이 그리고 여기서는 `RemoteScreen`으로 `/ranking`을 연다.
 */
export default function RankingScreen() {
  const isFocused = useIsFocused();
  return (
    <RemoteScreen
      suppressTabBarMessages={!isFocused}
      testID="ranking-webview"
      path="/ranking"
      splash={<RankingTabSkeleton />}
    />
  );
}
