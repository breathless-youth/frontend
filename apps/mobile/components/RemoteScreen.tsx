import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, BackHandler, View } from "react-native";

import type { ToNativeMessage } from "@focusmakers/types";

import { handleBridgeMessage, type BridgeReply } from "../lib/nativeBridgeHandler";
import { useRemoteQueryParams } from "../lib/remoteQueryParams";
import { RemoteWebViewHost } from "./RemoteWebViewHost";

/**
 * 탭 3개(홈·기록·설정) + 세션이 공유하는 원격 웹뷰 화면 골격(BY-333 2단계).
 *
 * 세 가지를 한 곳에 모은다 — 화면마다 복붙하지 않기 위해서다:
 * 1. `useRemoteQueryParams`로 4개 화면이 같은 쿼리 파라미터 세트(userId·appVersion)를 붙인다.
 * 2. `handleBridgeMessage`로 브리지 수신(start-session·navigate-home·open-settings·
 *    submit-session 대행)을 공용화한다.
 * 3. 파라미터 조립부터 첫 웹뷰 로드가 끝날 때까지 스플래시로 가려 흰 화면을 막는다.
 *
 * `RemoteWebViewHost`(URL 조립·오리진 제한·실패 폴백)는 그대로 소비만 한다.
 */
export type RemoteScreenProps = {
  /** `apps/web` 라우트 경로. 예: `/home`, `/room/1`. */
  path: string;
  /**
   * 공용 파라미터(userId·appVersion)에 **더해** 붙일 화면별 쿼리. 딥링크 화면
   * (`app/social/join.tsx`)이 초대코드를 웹으로 넘길 때 쓴다. `path`에 `?`를 직접 붙이면
   * `buildRemoteWebViewUrl`이 쿼리를 `?`로 한 번 더 이어 URL이 깨지므로 반드시 이걸 쓴다.
   */
  extraQuery?: Record<string, string>;
  /** WebView·스플래시에 강제할 배경색(세션 화면처럼 테마 무관 고정 배경이 필요할 때만). */
  backgroundColor?: string;
  /**
   * 안드로이드 하드웨어 뒤로가기를 막는다 — **세션 화면 전용**(`app/room/[id].tsx`).
   *
   * 막지 않으면 뒤로가기가 네이티브 스택에서 화면을 팝하고 그때 WebView가 통째로 파괴된다.
   * 세션 로직은 전부 웹에 있으므로 종료·제출이 실행될 기회 자체가 없다 — 사용자는 뒤로가기를
   * 한 번 눌렀을 뿐인데 **공부한 시간이 서버에 하나도 남지 않는다.** SCR-S3-7도 하드웨어
   * 뒤로가기로 종료를 확정시키지 말 것을 명시한다. 세션은 화면 안의 종료 버튼으로만 끝난다.
   *
   * iOS에는 하드웨어 뒤로가기가 없어 이 핸들러가 불리지 않는다 — 실질적으로 Android 전용이다.
   */
  blockHardwareBack?: boolean;
  /**
   * 로드 동안 스플래시 자리에 그릴 페이지별 스켈레톤(`RemoteSplashSkeletons.tsx`).
   * 생략하면 기존 `ActivityIndicator` 중앙 배치 — 세션 화면(`room/[id]`)처럼 미러링할
   * 레이아웃이 없는 화면(카메라 전면 뷰)은 스켈레톤을 만들지 않고 이 폴백을 쓴다.
   */
  splash?: ReactNode;
  /**
   * 브리지 수신을 화면이 가로채야 할 때만 넘긴다 — 생략하면 공용 `handleBridgeMessage`다.
   * 세션 화면이 `motion-sensor`(BY-340)를 자기 수명에 묶기 위해 쓴다(`app/room/[id].tsx`).
   * 넘기는 쪽이 공용 동작(제출 대행·홈 복귀 등)을 유지하려면 나머지 메시지를 직접
   * `handleBridgeMessage`로 위임해야 한다.
   */
  onBridgeMessage?: (message: ToNativeMessage, reply: BridgeReply) => void;
  testID?: string;
};

export function RemoteScreen({
  path,
  extraQuery,
  backgroundColor,
  blockHardwareBack = false,
  splash,
  onBridgeMessage = handleBridgeMessage,
  testID,
}: RemoteScreenProps) {
  const sharedQuery = useRemoteQueryParams();
  // extraQuery는 마운트 시점 값으로 고정한다(딥링크 파라미터는 화면 수명 동안 불변) —
  // 렌더마다 리터럴로 새 객체가 넘어와도 identity가 흔들려 URL 메모가 깨지지 않게.
  const [frozenExtraQuery] = useState(extraQuery);
  const query = useMemo(
    () =>
      sharedQuery !== null && frozenExtraQuery
        ? { ...sharedQuery, ...frozenExtraQuery }
        : sharedQuery,
    [sharedQuery, frozenExtraQuery],
  );
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const onLoadEnd = useCallback((ok: boolean) => {
    setLoaded(true);
    setLoadFailed(!ok);
  }, []);

  // 파라미터가 준비되기 전엔 웹뷰를 아예 띄우지 않는다 — userId 없이 먼저 로드된 뒤 값이
  // 붙어 다시 로드되는 깜빡임·이중 로드(그리고 그 첫 로드의 "브라우저 단독 모드")를 막는다.
  const showSplash = query === null || !loaded;

  // ⚠️ **지킬 세션이 실제로 있을 때만 막는다.** 로딩 중(스플래시)과 실패 폴백 화면에는 지킬
  // 세션이 없는데 거기서까지 막으면 사용자가 "다시 시도" 말고는 나갈 방법이 없는 상태에
  // 갇힌다.
  //
  // 포커스가 아니라 **마운트** 기준으로 건다(`useFocusEffect`가 아닌 `useEffect`) — 이 화면은
  // 탭 위에 `fullScreenModal`로 뜨고 그 위로 다른 화면을 push하지 않으므로 "마운트된 동안"과
  // "포커스된 동안"이 같다. 훅을 낮추면 `RemoteScreen`이 expo-router에 의존하지 않는다.
  const shouldBlockBack = blockHardwareBack && !showSplash && !loadFailed;
  useEffect(() => {
    if (!shouldBlockBack) {
      return;
    }
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => subscription.remove();
  }, [shouldBlockBack]);

  return (
    <View className="flex-1" style={backgroundColor ? { backgroundColor } : undefined}>
      {query !== null && (
        <RemoteWebViewHost
          testID={testID}
          path={path}
          query={query}
          backgroundColor={backgroundColor}
          onBridgeMessage={onBridgeMessage}
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
          className="bg-bg-base dark:bg-bg-base-dark absolute inset-0"
          style={backgroundColor ? { backgroundColor } : undefined}
        >
          {/* 스켈레톤은 페이지 레이아웃을 그대로 그리므로 중앙 정렬 없이 전면에 편다. */}
          {splash ?? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator />
            </View>
          )}
        </View>
      )}
    </View>
  );
}
