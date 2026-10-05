import { useIsFocused, useLocalSearchParams } from "expo-router";

import { RemoteScreen } from "../../components/RemoteScreen";
import { SocialTabSkeleton } from "../../components/RemoteSplashSkeletons";

/**
 * 소셜. 초대 딥링크가 code 파라미터를 실어 이 탭으로 리다이렉트한다
 *
 * - 탭 셸 안에서 열어야 흐름이 끝났을 때 탭 바가 정상 복귀한다.
 * - key로 재마운트하는 이유: RemoteScreen이 extraQuery를 마운트 시점 값으로 고정
 */
export default function SocialScreen() {
  const isFocused = useIsFocused();
  const { code, at } = useLocalSearchParams<{ code?: string; at?: string }>();
  const inviteCode = typeof code === "string" && code !== "" ? code : undefined;
  // 같은 코드로 다시 들어와도 다시 마운트되도록 일회용 값(at)을 key에 섞는다.
  const screenKey = inviteCode !== undefined ? `invite-${inviteCode}-${at ?? ""}` : "social-home";

  return (
    <RemoteScreen
      key={screenKey}
      suppressTabBarMessages={!isFocused}
      testID="social-webview"
      path={inviteCode !== undefined ? "/social/join" : "/social"}
      extraQuery={inviteCode !== undefined ? { code: inviteCode } : undefined}
      splash={<SocialTabSkeleton />}
    />
  );
}
