import { RemoteScreen } from "../../components/RemoteScreen";
import { SocialTabSkeleton } from "../../components/RemoteSplashSkeletons";

/**
 * 소셜
 */
export default function SocialScreen() {
  return <RemoteScreen testID="social-webview" path="/social" splash={<SocialTabSkeleton />} />;
}
