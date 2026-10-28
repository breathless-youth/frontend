import { requireOptionalNativeModule } from "expo-modules-core";

export interface ProfilePhotoPickerNative {
  /** 고른 사진을 512px 정사각형 JPEG base64로 돌려준다. 닫거나 이미 열려 있으면 null이고, 읽지 못하면 reject한다. */
  pick(): Promise<string | null>;
}

/**
 * Android 프로필 사진 선택기 모듈
 *
 * iOS와 Jest, 이 모듈이 없는 옛 Dev Client에서는 null이라 웹이 파일 입력을 쓰게 된다.
 */
export const profilePhotoPickerNative =
  requireOptionalNativeModule<ProfilePhotoPickerNative>("ProfilePhotoPicker");
