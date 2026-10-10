import { requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

interface DirectShareNative {
  shareToInstagramReels(uri: string, appId: string): Promise<boolean>;
  shareToKakaoTalk(uri: string, text: string): Promise<boolean>;
}

// 이 모듈이 없는 옛 Dev Client에서도 앱이 죽지 않고 공유 시트로 돌아가게 throw하지 않는 쪽으로 불러온다.
const native = requireOptionalNativeModule<DirectShareNative>("DirectShare");

/**
 * 인스타그램 릴스 편집 화면으로 영상 넘기기
 *
 * iOS는 file 주소, Android는 인스타그램이 읽을 수 있는 content 주소를 받는다.
 * 인스타그램이 없거나 영상이 3초보다 짧거나 모듈이 없으면 false다.
 */
export async function shareToInstagramReels(uri: string, appId: string): Promise<boolean> {
  return (await native?.shareToInstagramReels(uri, appId)) ?? false;
}

/**
 * 카카오톡 공유 대상 선택 화면으로 영상 넘기기
 *
 * iOS에는 카카오톡을 골라 영상을 보내는 공식 경로가 없어 Android만 연다.
 * 카카오톡은 파일과 함께 온 글을 버릴 수 있어 열기 직전에 본문을 클립보드에 복사한다.
 */
export async function shareToKakaoTalk(uri: string, text: string): Promise<boolean> {
  if (Platform.OS !== "android") {
    return false;
  }
  return (await native?.shareToKakaoTalk(uri, text)) ?? false;
}
