import { requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

import type * as KakaoCore from "@react-native-kakao/core";
import type * as KakaoUser from "@react-native-kakao/user";
import type { SocialLoginProvider } from "@focusmakers/types";
import type * as AppleAuthentication from "expo-apple-authentication";
import type * as GoogleSignIn from "react-native-nitro-google-signin";

import { setSocialLoginAdapter, socialLoginConfig, socialLoginProvidersFor } from "./socialLogin";

/**
 * SDK가 사용자의 취소로 알리는 오류 코드
 *
 * 카카오는 네이티브 SDK의 원인 이름이 그대로 코드가 되고, 동의 화면의 거절도 사용자가 닫은 것으로 본다.
 */
const CANCEL_CODES = new Set([
  "SIGN_IN_CANCELLED",
  "Cancelled",
  "AccessDenied",
  "ERR_REQUEST_CANCELED",
]);

function isCancelError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    CANCEL_CODES.has(String((error as { code?: unknown }).code))
  );
}

type SignIn = (hashedNonce: string) => Promise<string | null>;

/** 사용자가 SDK 창을 닫았으면 null로 바꾼다. */
async function nullIfCancelled(run: () => Promise<string | null>): Promise<string | null> {
  try {
    return await run();
  } catch (error) {
    if (isCancelError(error)) {
      return null;
    }
    throw error;
  }
}

/* eslint-disable @typescript-eslint/no-require-imports -- 쓰는 공급자의 SDK만 조건부로 동기 로드하는 방법이 require뿐이다. */
/**
 * 공급자 하나의 로그인 함수
 *
 * 그 공급자의 SDK를 불러와 만들고, 네이티브 모듈이 없으면 throw한다.
 */
function createSignIn(
  provider: SocialLoginProvider,
  config: ReturnType<typeof socialLoginConfig>,
): SignIn {
  switch (provider) {
    case "GOOGLE": {
      const { GoogleOneTapSignIn } =
        require("react-native-nitro-google-signin") as typeof GoogleSignIn;
      return async (hashedNonce) => {
        // nonce를 설정으로만 받아서 로그인마다 다시 설정한다.
        GoogleOneTapSignIn.configure({
          webClientId: config.googleWebClientId ?? "",
          iosClientId: config.googleIosClientId || null,
          nonce: hashedNonce,
        });
        await GoogleOneTapSignIn.checkPlayServices();
        // 조용한 로그인은 iOS에서 이전 세션을 되살려 이번 nonce가 없는 토큰을 줄 수 있어 계정 선택 창을 연다.
        const response = await GoogleOneTapSignIn.presentExplicitSignIn();
        return response.type === "cancelled" ? null : (response.data?.idToken ?? "");
      };
    }
    case "KAKAO": {
      const { initializeKakaoSDK } = require("@react-native-kakao/core") as typeof KakaoCore;
      const { login } = require("@react-native-kakao/user") as typeof KakaoUser;
      const ready = initializeKakaoSDK(config.kakaoNativeAppKey ?? "");
      return async (hashedNonce) => {
        await ready;
        const token = await login({ nonce: hashedNonce });
        return token.idToken ?? "";
      };
    }
    case "APPLE": {
      // 이 SDK는 네이티브 모듈이 없어도 가짜 모듈로 불러와져서 실제 모듈이 있는지 따로 확인한다.
      if (requireOptionalNativeModule("ExpoAppleAuthentication") === null) {
        throw new Error("ExpoAppleAuthentication 네이티브 모듈이 없다");
      }
      const { signInAsync } = require("expo-apple-authentication") as typeof AppleAuthentication;
      return async (hashedNonce) => {
        const credential = await signInAsync({ nonce: hashedNonce });
        return credential.identityToken ?? "";
      };
    }
  }
}
/**
 * 탈퇴 전에 애플 로그인을 다시 띄워 인가 코드를 받는 함수
 *
 * 애플 SDK를 이미 불러온 바이너리에서만 부른다.
 */
function createAppleReauthorize(): () => Promise<string> {
  const { signInAsync } = require("expo-apple-authentication") as typeof AppleAuthentication;
  return async () => (await signInAsync()).authorizationCode ?? "";
}
/* eslint-enable @typescript-eslint/no-require-imports */

/**
 * 구글·카카오·애플 로그인 SDK 실구현 어댑터
 *
 * 이 파일만 SDK를 불러오고 다른 코드는 `lib/socialLogin.ts`의 공개 함수만 본다.
 * `app/_layout.tsx`가 모듈 스코프에서 `installSocialLoginSdk()`를 부른다.
 * 앱 종류별 키가 없는 공급자는 SDK를 불러오지도 초기화하지도 않는다.
 * Metro의 새 JS가 그 SDK 네이티브 모듈이 없는 이전 Dev Client에 실리면 그 공급자만 빼서 웹에 알리지 않는다.
 */
export function installSocialLoginSdk(): void {
  const config = socialLoginConfig();
  const signIns = new Map<SocialLoginProvider, SignIn>();
  for (const provider of socialLoginProvidersFor(Platform.OS, config)) {
    try {
      signIns.set(provider, createSignIn(provider, config));
    } catch (error) {
      console.warn("[social-login] SDK를 불러오지 못해 이 공급자를 끈다", provider, error);
    }
  }
  if (signIns.size === 0) {
    return;
  }
  setSocialLoginAdapter({
    providers: [...signIns.keys()],
    async signIn(provider, hashedNonce) {
      const signIn = signIns.get(provider);
      if (signIn === undefined) {
        throw new Error(`이 빌드에 없는 공급자: ${provider}`);
      }
      return nullIfCancelled(() => signIn(hashedNonce));
    },
    ...(signIns.has("APPLE")
      ? { reauthorizeApple: () => nullIfCancelled(createAppleReauthorize()) }
      : {}),
  });
}
