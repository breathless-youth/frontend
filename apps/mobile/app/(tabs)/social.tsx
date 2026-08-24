import { useIsFocused } from "@react-navigation/native";

import { RemoteScreen } from "../../components/RemoteScreen";
import { SocialTabSkeleton } from "../../components/RemoteSplashSkeletons";

/**
 * 소셜
 */
export default function SocialScreen() {
  const isFocused = useIsFocused();
  return (
    <RemoteScreen
      suppressTabBarMessages={!isFocused}
      testID="social-webview"
      path="/social"
      splash={<SocialTabSkeleton />}
    />
  );
}
