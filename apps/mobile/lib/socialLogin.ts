import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";

import type { SocialLoginProvider } from "@focusmakers/types";

import { type LinkSocialResult, linkSocial } from "./auth";

/**
 * 앱 종류별 소셜 로그인 설정 값
 *
 * `app.config.ts`가 앱 종류별 표의 값을 `extra.socialLogin`에 담는다.
 * 없는 값은 빈 문자열이다.
 */
export type SocialLoginConfig = {
  kakaoNativeAppKey: string;
  googleIosClientId: string;
  googleWebClientId: string;
};

export type SocialLoginResult = LinkSocialResult | { status: "cancelled" };

/**
 * SDK 로그인 어댑터
 *
 * 성공하면 ID 토큰을, 사용자가 닫았으면 null을 돌려준다.
 * SDK가 ID 토큰을 주지 않으면 빈 문자열이다.
 */
export type SocialLoginAdapter = {
  /** SDK 네이티브 모듈까지 불러온 공급자 */
  providers: SocialLoginProvider[];
  signIn(provider: SocialLoginProvider, hashedNonce: string): Promise<string | null>;
};

let adapter: SocialLoginAdapter | null = null;
let inFlight = false;

export function setSocialLoginAdapter(next: SocialLoginAdapter): void {
  adapter = next;
}

/**
 * 테스트 전용 어댑터·진행 중 표시 초기화
 *
 * 프로덕션 코드에서는 호출하지 않는다.
 */
export function __resetSocialLoginForTests(): void {
  adapter = null;
  inFlight = false;
}

export function socialLoginConfig(): Partial<SocialLoginConfig> {
  return (Constants.expoConfig?.extra?.socialLogin ?? {}) as Partial<SocialLoginConfig>;
}

/**
 * 앱 종류의 설정 값과 플랫폼으로 정한 공급자 목록
 *
 * 카카오는 앱 종류별 네이티브 앱 키가 있어야 하고, 구글 iOS는 앱 종류별 iOS 클라이언트 ID가 있어야 한다.
 * 구글 Android는 모든 앱 종류가 같은 웹 클라이언트 ID를 쓰고, 애플은 서버가 모든 앱 종류의 번들을 받는다.
 * SDK 초기화와 웹뷰 주소의 표시가 이 목록 하나를 본다.
 */
export function socialLoginProvidersFor(
  os: string,
  config: Partial<SocialLoginConfig>,
): SocialLoginProvider[] {
  const providers: SocialLoginProvider[] = [];
  if (os === "android" || (os === "ios" && config.googleIosClientId)) {
    providers.push("GOOGLE");
  }
  if ((os === "android" || os === "ios") && config.kakaoNativeAppKey) {
    providers.push("KAKAO");
  }
  if (os === "ios") {
    providers.push("APPLE");
  }
  return providers;
}

/** 이 바이너리에서 쓸 수 있는 공급자. SDK 네이티브 모듈이 없는 공급자는 빠진다. */
export function supportedSocialLoginProviders(): SocialLoginProvider[] {
  const loaded = adapter?.providers ?? [];
  return socialLoginProvidersFor(Platform.OS, socialLoginConfig()).filter((provider) =>
    loaded.includes(provider),
  );
}

/**
 * 소셜 로그인과 계정 연결
 *
 * 로그인마다 nonce를 새로 만들어 SDK에는 SHA-256 hex를, 서버에는 원문을 보낸다.
 * 서버가 원문을 해시해 ID 토큰의 nonce와 맞춰 보므로 가로챈 ID 토큰을 다시 쓸 수 없다.
 * ID 토큰과 nonce는 로그와 브리지로 내보내지 않는다.
 */
export async function socialLogin(provider: SocialLoginProvider): Promise<SocialLoginResult> {
  // 로그인 창은 하나만 뜨고 link가 겹치면 먼저 끝난 쪽이 다른 쪽의 토큰을 무효로 만든다.
  if (inFlight) {
    return { status: "cancelled" };
  }
  // 웹은 주소의 공급자 목록 밖을 보내지 않지만, 구버전 웹이나 잘못된 요청이 SDK까지 가지 않게 한 번 더 막는다.
  if (adapter === null || !supportedSocialLoginProviders().includes(provider)) {
    return { status: "failed", code: "UNKNOWN" };
  }
  const sdk = adapter;
  inFlight = true;
  try {
    const nonce = Crypto.randomUUID();
    const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
    const idToken = await sdk.signIn(provider, hashedNonce);
    if (idToken === null) {
      return { status: "cancelled" };
    }
    if (idToken === "") {
      return { status: "failed", code: "UNKNOWN" };
    }
    return await linkSocial(provider, idToken, nonce);
  } catch (error) {
    console.warn("[social-login] SDK 로그인 실패", provider, error);
    return { status: "failed", code: "UNKNOWN" };
  } finally {
    inFlight = false;
  }
}
