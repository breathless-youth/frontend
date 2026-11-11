import { UnusablePhotoError } from "@/features/profile/prepareProfilePhoto";
import type { NewTimerBackgroundPhoto } from "@/features/timer-background/timerBackgroundPhotos";

import { isNativeBridgeAvailable, postToNative, subscribeToNativeMessages } from "./bridge";
import { photoBytesFromBase64 } from "./nativeProfilePhoto";

// 앱 안 이동은 URL에서 쿼리를 없애므로 모듈을 읽는 시점에 한 번 판정해 보관한다.
function readFlag(): boolean {
  return new URLSearchParams(window.location.search).get("backgroundPhotoPicker") === "1";
}

let flagCache: boolean | null = readFlag();

/**
 * 배경 사진 고르기를 앱 선택기에 맡길 수 있는지
 *
 * 앱이 웹뷰 URL에 `backgroundPhotoPicker=1`을 붙인다(`apps/mobile/lib/remoteQueryParams.ts`).
 * 프로필 선택기만 아는 앱도 있어서 `profilePhotoPicker` 표시와 따로 본다.
 */
export function canUseNativeBackgroundPhoto(): boolean {
  flagCache ??= readFlag();
  return flagCache && isNativeBridgeAvailable();
}

/** 테스트마다 URL을 바꿔 판정하도록 캐시를 비운다. */
export function __resetNativeBackgroundPhotoForTests(): void {
  flagCache = null;
}

/**
 * 앱 사진 선택기로 배경 사진 받기
 *
 * 앱이 시스템 사진 선택기를 열고 긴 변 1920px로 줄인 JPEG와 그 크기를 돌려준다.
 * 사용자가 고르는 시간을 정할 수 없어 시간 제한 없이 기다리고, 닫으면 `null`이다.
 * 앱이 읽지 못한 사진, 깨진 본문, 브리지에 넘기지 못한 요청은 `UnusablePhotoError`다.
 * 구독을 먼저 걸고 보내야 빠른 응답을 놓치지 않는다.
 */
export function pickNativeBackgroundPhoto(): Promise<NewTimerBackgroundPhoto | null> {
  const id = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : String(Math.random());
  return new Promise((resolve, reject) => {
    const unsubscribe = subscribeToNativeMessages((message) => {
      if (message.type !== "background-photo-result" || message.id !== id) {
        return;
      }
      unsubscribe();
      if (message.status === "picked") {
        try {
          resolve({
            bytes: photoBytesFromBase64(message.data).buffer,
            width: message.width,
            height: message.height,
          });
        } catch (error) {
          reject(error);
        }
      } else if (message.status === "cancelled") {
        resolve(null);
      } else {
        reject(new UnusablePhotoError());
      }
    });
    if (!postToNative({ type: "pick-background-photo", id, atMs: Date.now() })) {
      unsubscribe();
      reject(new UnusablePhotoError());
    }
  });
}
