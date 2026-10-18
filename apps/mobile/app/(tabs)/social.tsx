import { useIsFocused, useLocalSearchParams } from "expo-router";

import { RemoteScreen } from "../../components/RemoteScreen";
import { SocialTabSkeleton } from "../../components/RemoteSplashSkeletons";
import { remoteScreenInput } from "../../lib/tabDeepLink";

/**
 * 소셜. 초대 딥링크가 code 파라미터를 실어 이 탭으로 리다이렉트한다
 *
 * - 탭 셸 안에서 열어야 흐름이 끝났을 때 탭 바가 정상 복귀한다.
 * - key로 재마운트하는 이유: RemoteScreen이 extraQuery를 마운트 시점 값으로 고정
 */
export default function SocialScreen() {
  const isFocused = useIsFocused();
  const params = useLocalSearchParams<{ code?: string; at?: string; path?: string }>();
  const { code, at } = params;
  const inviteCode = typeof code === "string" && code !== "" ? code : undefined;
  // 푸시 알림은 path 파라미터로 이 탭 안의 웹 경로(초대코드 공유 등)를 연다(`lib/tabDeepLink.ts`).
  const target = remoteScreenInput(params, "/social");
  // 같은 코드로 다시 들어와도 다시 마운트되도록 일회용 값(at)을 key에 섞는다.
  const screenKey = inviteCode !== undefined ? `invite-${inviteCode}-${at ?? ""}` : target.key;

  return (
    <RemoteScreen
      key={screenKey}
      suppressTabBarMessages={!isFocused}
      testID="social-webview"
      path={inviteCode !== undefined ? "/social/join" : target.path}
      // 초대 참여 화면은 예전처럼 뒤로가기 탭 초기화 대상이 아니다.
      resetPath={inviteCode !== undefined ? undefined : target.resetPath}
      extraQuery={inviteCode !== undefined ? { code: inviteCode } : target.extraQuery}
      splash={<SocialTabSkeleton />}
    />
  );
}
