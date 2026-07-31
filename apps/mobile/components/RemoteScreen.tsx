import { useCallback, useState } from "react";
import { ActivityIndicator, View } from "react-native";

import { handleBridgeMessage } from "../lib/nativeBridgeHandler";
import { useRemoteQueryParams } from "../lib/remoteQueryParams";
import { RemoteWebViewHost } from "./RemoteWebViewHost";

/**
 * 탭 3개(홈·기록·설정) + 세션이 공유하는 원격 웹뷰 화면 골격(BY-333 2단계).
 *
 * 세 가지를 한 곳에 모은다 — 화면마다 복붙하지 않기 위해서다:
 * 1. `useRemoteQueryParams`로 4개 화면이 같은 쿼리 파라미터 세트(userId·appVersion)를 붙인다.
 * 2. `handleBridgeMessage`로 브리지 수신(start-session·exit-session·open-settings)을 공용화한다.
 * 3. 파라미터 조립부터 첫 웹뷰 로드가 끝날 때까지 스플래시로 가려 흰 화면을 막는다.
 *
 * `RemoteWebViewHost`(URL 조립·오리진 제한·실패 폴백)는 그대로 소비만 한다.
 */
export type RemoteScreenProps = {
  /** `apps/web` 라우트 경로. 예: `/home`, `/room/1`. */
  path: string;
  /** WebView·스플래시에 강제할 배경색(세션 화면처럼 테마 무관 고정 배경이 필요할 때만). */
  backgroundColor?: string;
  testID?: string;
};

export function RemoteScreen({ path, backgroundColor, testID }: RemoteScreenProps) {
  const query = useRemoteQueryParams();
  const [loaded, setLoaded] = useState(false);
  const onLoadEnd = useCallback(() => setLoaded(true), []);

  // 파라미터가 준비되기 전엔 웹뷰를 아예 띄우지 않는다 — userId 없이 먼저 로드된 뒤 값이
  // 붙어 다시 로드되는 깜빡임·이중 로드(그리고 그 첫 로드의 "브라우저 단독 모드")를 막는다.
  const showSplash = query === null || !loaded;

  return (
    <View className="flex-1" style={backgroundColor ? { backgroundColor } : undefined}>
      {query !== null && (
        <RemoteWebViewHost
          testID={testID}
          path={path}
          query={query}
          backgroundColor={backgroundColor}
          onBridgeMessage={handleBridgeMessage}
          onLoadEnd={onLoadEnd}
        />
      )}
      {showSplash && (
        <View
          testID={testID ? `${testID}-splash` : "remote-screen-splash"}
          accessibilityLabel="화면을 불러오는 중"
          // 스플래시는 가리기만 해야 한다 — pointerEvents 없이 뜨면 밑에 있는 웹뷰(또는 실패
          // 폴백의 재시도 버튼)로 가는 모든 터치를 가로챈다(BY-333 실기기 확인: 탭 전환 중
          // 뒤로가기조차 눌리지 않았다).
          pointerEvents="none"
          className="bg-bg-base dark:bg-bg-base-dark absolute inset-0 items-center justify-center"
          style={backgroundColor ? { backgroundColor } : undefined}
        >
          <ActivityIndicator />
        </View>
      )}
    </View>
  );
}
