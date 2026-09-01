import { useIsFocused } from "@react-navigation/native";

import { RemoteScreen } from "../../components/RemoteScreen";
import { RecordsTabSkeleton } from "../../components/RemoteSplashSkeletons";

/**
 * S5 · 기록 — 화면 구현체는 `apps/web`이고, 여기서는 `RemoteScreen`(BY-333)으로 `/records`를
 * 로드한다. 달력·통계 조회·리스트 로직은 전부 웹이 소유한다 — 여기에 화면 로직을 넣지 않는다.
 */
export default function RecordsScreen() {
  const isFocused = useIsFocused();
  return (
    <RemoteScreen
      suppressTabBarMessages={!isFocused}
      testID="records-webview"
      path="/records"
      splash={<RecordsTabSkeleton />}
    />
  );
}
