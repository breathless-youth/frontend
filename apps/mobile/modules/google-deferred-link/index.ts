import { requireOptionalNativeModule } from "expo-modules-core";

export interface GoogleDeferredLinkNative {
  /** GA4 SDK가 받아 둔 구글 지연 딥링크 주소다. 아직 없으면 null이다. */
  readDeepLink(): string | null;
}

/**
 * Android 구글 지연 딥링크 모듈
 *
 * iOS와 Jest, 이 모듈이 없는 옛 Dev Client에서는 null이라 부르는 쪽이 지원하지 않는 기기로 처리한다.
 */
export const googleDeferredLinkNative =
  requireOptionalNativeModule<GoogleDeferredLinkNative>("GoogleDeferredLink");
