import { UnusablePhotoError } from "@/features/profile/prepareProfilePhoto";

import { isNativeBridgeAvailable, postToNative, subscribeToNativeMessages } from "./bridge";

// 앱 안 이동은 URL에서 쿼리를 없애므로 모듈을 읽는 시점에 한 번 판정해 보관한다.
// 표시는 바이너리마다 고정이라 다시 읽을 이유가 없다.
function readProfilePhotoPickerFlag(): boolean {
  return new URLSearchParams(window.location.search).get("profilePhotoPicker") === "1";
}

let pickerFlagCache: boolean | null = readProfilePhotoPickerFlag();

/**
 * 사진 고르기를 앱 선택기에 맡길 수 있는지
 *
 * 앱이 웹뷰 URL에 `profilePhotoPicker=1`을 붙인다(`apps/mobile/lib/remoteQueryParams.ts`).
 * 원격 웹은 구버전 앱에도 바로 배포되므로 브리지만 있고 표시가 없으면 이 메시지를 모르는 앱으로 본다.
 */
export function canUseNativeProfilePhoto(): boolean {
  pickerFlagCache ??= readProfilePhotoPickerFlag();
  return pickerFlagCache && isNativeBridgeAvailable();
}

/** 테스트마다 URL을 바꿔 판정하도록 캐시를 비운다. */
export function __resetNativeProfilePhotoForTests(): void {
  pickerFlagCache = null;
}

// 버전이 다른 앱이 빈 본문을 보내도 올리지 않도록 0바이트도 깨진 사진으로 본다.
function jpegFromBase64(data: string): Blob {
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
  } catch {
    throw new UnusablePhotoError();
  }
  if (bytes.length === 0) {
    throw new UnusablePhotoError();
  }
  return new Blob([bytes], { type: "image/jpeg" });
}

/**
 * 앱 사진 선택기로 사진 받기
 *
 * 앱이 시스템 사진 선택기를 열고 512px로 줄인 JPEG를 base64로 돌려준다.
 * 사용자가 고르는 시간을 정할 수 없어 시간 제한 없이 기다린다.
 * 앱은 사진을 읽지 못해도 `failed`로 답한다.
 * 사용자가 선택기를 닫으면 `null`이다.
 * 앱이 읽지 못한 사진, 본문이 비었거나 깨진 사진, 브리지에 넘기지 못한 요청은 `UnusablePhotoError`다.
 * 구독을 먼저 걸고 보내야 빠른 응답을 놓치지 않는다.
 */
export function pickNativeProfilePhoto(): Promise<Blob | null> {
  // LAN 주소(http)로 연 개발 웹뷰는 비보안 문서라 randomUUID가 없다.
  // 앱은 비지 않은 문자열이면 받으므로 그때는 난수 문자열로 대신한다.
  const id = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : String(Math.random());
  return new Promise((resolve, reject) => {
    const unsubscribe = subscribeToNativeMessages((message) => {
      if (message.type !== "profile-photo-result" || message.id !== id) {
        return;
      }
      unsubscribe();
      if (message.status === "picked") {
        try {
          resolve(jpegFromBase64(message.data));
        } catch (error) {
          reject(error);
        }
      } else if (message.status === "cancelled") {
        resolve(null);
      } else {
        reject(new UnusablePhotoError());
      }
    });
    if (!postToNative({ type: "pick-profile-photo", id, atMs: Date.now() })) {
      unsubscribe();
      reject(new UnusablePhotoError());
    }
  });
}
