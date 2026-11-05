import { initializeKakaoSDK } from "@react-native-kakao/core";
import { login } from "@react-native-kakao/user";
import * as AppleAuthentication from "expo-apple-authentication";
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";
import { GoogleOneTapSignIn } from "react-native-nitro-google-signin";

import { linkSocial } from "../auth";
import {
  __resetSocialLoginForTests,
  socialLogin,
  supportedSocialLoginProviders,
} from "../socialLogin";
import { installSocialLoginSdk } from "../socialLoginSdk";

/**
 * 소셜 로그인 셸
 *
 * SDK 세 개는 `socialLoginSdk.ts`만 불러오므로 여기서 패키지째 mock하고, 서버 연결은 `linkSocial` mock으로 본다.
 */
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: {} } },
}));
jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  randomUUID: jest.fn(() => "raw-nonce"),
  digestStringAsync: jest.fn(async () => "hashed-nonce"),
}));
jest.mock("expo-apple-authentication", () => ({ signInAsync: jest.fn() }));
// 애플 SDK는 네이티브 모듈이 없어도 가짜 모듈로 불러와지므로 실제 모듈이 있는지는 따로 묻는다.
const mockNativeModules = { appleMissing: false, googleMissing: false };
jest.mock("expo-modules-core", () => {
  const actual = jest.requireActual("expo-modules-core");
  return {
    ...actual,
    requireOptionalNativeModule: (name: string) =>
      name === "ExpoAppleAuthentication"
        ? mockNativeModules.appleMissing
          ? null
          : {}
        : actual.requireOptionalNativeModule(name),
  };
});
jest.mock("@react-native-kakao/core", () => ({ initializeKakaoSDK: jest.fn(async () => {}) }));
jest.mock("@react-native-kakao/user", () => ({ login: jest.fn() }));
jest.mock("react-native-nitro-google-signin", () => {
  const google = {
    configure: jest.fn(),
    checkPlayServices: jest.fn(async () => {}),
    presentExplicitSignIn: jest.fn(),
  };
  return {
    // 이전 Dev Client에서는 Nitro가 HybridObject를 찾지 못해 불러오는 순간 예외가 난다.
    get GoogleOneTapSignIn() {
      if (mockNativeModules.googleMissing) {
        throw new Error("NitroGoogleSignin is not registered");
      }
      return google;
    },
  };
});
jest.mock("../auth", () => ({ linkSocial: jest.fn() }));

const mockedConstants = Constants as unknown as { expoConfig: { extra: Record<string, unknown> } };
const mockedLinkSocial = linkSocial as jest.Mock;
const mockedKakaoLogin = login as jest.Mock;
const mockedAppleSignIn = AppleAuthentication.signInAsync as jest.Mock;
const mockedGoogle = GoogleOneTapSignIn as unknown as Record<
  "configure" | "checkPlayServices" | "presentExplicitSignIn",
  jest.Mock
>;

const PROD_SOCIAL_LOGIN = {
  kakaoNativeAppKey: "kakao-key",
  googleIosClientId: "ios-client.apps.googleusercontent.com",
  googleWebClientId: "web-client.apps.googleusercontent.com",
};

/** 앱 종류의 설정 값과 플랫폼으로 붙인 셸 */
function install(os: "ios" | "android", socialLogin: Record<string, string>) {
  jest.replaceProperty(Platform, "OS", os);
  mockedConstants.expoConfig = { extra: { socialLogin } };
  installSocialLoginSdk();
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  __resetSocialLoginForTests();
  mockNativeModules.appleMissing = false;
  mockNativeModules.googleMissing = false;
  jest.spyOn(console, "warn").mockImplementation(() => {});
  mockedLinkSocial.mockResolvedValue({ status: "success", isNewUser: false });
  mockedGoogle.presentExplicitSignIn.mockResolvedValue({
    type: "success",
    data: { idToken: "google-id-token" },
  });
  mockedKakaoLogin.mockResolvedValue({ idToken: "kakao-id-token" });
  mockedAppleSignIn.mockResolvedValue({ identityToken: "apple-id-token" });
});

describe("socialLogin", () => {
  it.each([
    ["GOOGLE", "google-id-token", () => mockedGoogle.configure],
    ["KAKAO", "kakao-id-token", () => mockedKakaoLogin],
    ["APPLE", "apple-id-token", () => mockedAppleSignIn],
  ] as const)(
    "%s: SDK에는 nonce의 SHA-256 hex를, 서버에는 원문을 보낸다",
    async (provider, idToken, sdk) => {
      install("ios", PROD_SOCIAL_LOGIN);

      await expect(socialLogin(provider)).resolves.toEqual({ status: "success", isNewUser: false });

      expect(Crypto.digestStringAsync).toHaveBeenCalledWith("SHA-256", "raw-nonce");
      expect(sdk()).toHaveBeenCalledWith(expect.objectContaining({ nonce: "hashed-nonce" }));
      expect(mockedLinkSocial).toHaveBeenCalledWith(provider, idToken, "raw-nonce");
    },
  );

  it.each([
    [
      "GOOGLE 응답",
      "GOOGLE",
      () => mockedGoogle.presentExplicitSignIn.mockResolvedValue({ type: "cancelled", data: null }),
    ],
    [
      "GOOGLE 오류",
      "GOOGLE",
      () =>
        mockedGoogle.presentExplicitSignIn.mockRejectedValue(
          Object.assign(new Error("cancel"), { code: "SIGN_IN_CANCELLED" }),
        ),
    ],
    [
      "KAKAO",
      "KAKAO",
      () =>
        mockedKakaoLogin.mockRejectedValue(
          Object.assign(new Error("cancel"), { code: "Cancelled" }),
        ),
    ],
    [
      "KAKAO 동의 거절",
      "KAKAO",
      () =>
        mockedKakaoLogin.mockRejectedValue(
          Object.assign(new Error("denied"), { code: "AccessDenied" }),
        ),
    ],
    [
      "APPLE",
      "APPLE",
      () =>
        mockedAppleSignIn.mockRejectedValue(
          Object.assign(new Error("cancel"), { code: "ERR_REQUEST_CANCELED" }),
        ),
    ],
  ] as const)("%s 취소는 cancelled이고 서버에 보내지 않는다", async (_label, provider, arrange) => {
    install("ios", PROD_SOCIAL_LOGIN);
    arrange();

    await expect(socialLogin(provider)).resolves.toEqual({ status: "cancelled" });
    expect(mockedLinkSocial).not.toHaveBeenCalled();
  });

  it("SDK가 ID 토큰을 주지 않으면 failed이고 서버에 보내지 않는다", async () => {
    install("ios", PROD_SOCIAL_LOGIN);
    mockedKakaoLogin.mockResolvedValue({ accessToken: "kakao-access" });

    await expect(socialLogin("KAKAO")).resolves.toEqual({ status: "failed", code: "UNKNOWN" });
    expect(mockedLinkSocial).not.toHaveBeenCalled();
  });

  it("취소가 아닌 SDK 오류는 failed다", async () => {
    install("ios", PROD_SOCIAL_LOGIN);
    mockedGoogle.presentExplicitSignIn.mockRejectedValue(
      Object.assign(new Error("config"), { code: "DEVELOPER_ERROR" }),
    );

    await expect(socialLogin("GOOGLE")).resolves.toEqual({ status: "failed", code: "UNKNOWN" });
    expect(mockedLinkSocial).not.toHaveBeenCalled();
  });

  it("로그인마다 nonce 원문을 새로 만들고 SDK에는 그 원문의 hex를 보낸다", async () => {
    install("ios", PROD_SOCIAL_LOGIN);
    (Crypto.randomUUID as jest.Mock)
      .mockReturnValueOnce("raw-nonce-1")
      .mockReturnValueOnce("raw-nonce-2");
    const hexOf = async (_algorithm: string, raw: string) => `hex-of-${raw}`;
    (Crypto.digestStringAsync as jest.Mock)
      .mockImplementationOnce(hexOf)
      .mockImplementationOnce(hexOf);

    await socialLogin("KAKAO");
    await socialLogin("KAKAO");

    expect(mockedKakaoLogin.mock.calls.map(([options]) => options.nonce)).toEqual([
      "hex-of-raw-nonce-1",
      "hex-of-raw-nonce-2",
    ]);
    expect(mockedLinkSocial.mock.calls.map((call) => call[2])).toEqual([
      "raw-nonce-1",
      "raw-nonce-2",
    ]);
  });

  it("진행 중에 다시 요청하면 바로 cancelled이고 앞선 요청은 그대로 끝난다", async () => {
    install("ios", PROD_SOCIAL_LOGIN);
    let finish: (value: unknown) => void = () => {};
    mockedAppleSignIn.mockReturnValue(new Promise((resolve) => (finish = resolve)));

    const first = socialLogin("APPLE");
    await expect(socialLogin("KAKAO")).resolves.toEqual({ status: "cancelled" });
    expect(mockedKakaoLogin).not.toHaveBeenCalled();

    finish({ identityToken: "apple-id-token" });
    await expect(first).resolves.toEqual({ status: "success", isNewUser: false });
    // 끝난 뒤에는 다시 받는다.
    await expect(socialLogin("KAKAO")).resolves.toEqual({ status: "success", isNewUser: false });
  });
});

describe("installSocialLoginSdk", () => {
  /** 앱 종류별 키가 비어 있는 빌드. 구글 웹 클라이언트 ID는 모든 앱 종류가 같다. */
  const NO_KEYS = {
    kakaoNativeAppKey: "",
    googleIosClientId: "",
    googleWebClientId: PROD_SOCIAL_LOGIN.googleWebClientId,
  };

  it("키가 있으면 카카오 SDK를 앱 종류의 네이티브 앱 키로 초기화한다", () => {
    install("android", PROD_SOCIAL_LOGIN);

    expect(initializeKakaoSDK).toHaveBeenCalledWith("kakao-key");
  });

  it.each(["ios", "android"] as const)(
    "%s: 카카오 키가 없으면 초기화하지 않고 카카오 요청도 SDK에 닿지 않는다",
    async (os) => {
      install(os, NO_KEYS);

      expect(initializeKakaoSDK).not.toHaveBeenCalled();
      await expect(socialLogin("KAKAO")).resolves.toEqual({ status: "failed", code: "UNKNOWN" });
      expect(mockedKakaoLogin).not.toHaveBeenCalled();
    },
  );

  it("iOS 클라이언트 ID가 없으면 iOS에서 구글을 설정하지 않는다", async () => {
    install("ios", NO_KEYS);

    await expect(socialLogin("GOOGLE")).resolves.toEqual({ status: "failed", code: "UNKNOWN" });
    expect(mockedGoogle.configure).not.toHaveBeenCalled();
    // 애플은 키와 상관없이 쓴다.
    await expect(socialLogin("APPLE")).resolves.toEqual({ status: "success", isNewUser: false });
  });

  it("Android 구글은 iOS 클라이언트 ID 없이 웹 클라이언트 ID로 설정한다", async () => {
    install("android", NO_KEYS);

    await expect(socialLogin("GOOGLE")).resolves.toEqual({ status: "success", isNewUser: false });
    expect(mockedGoogle.configure).toHaveBeenCalledWith({
      webClientId: PROD_SOCIAL_LOGIN.googleWebClientId,
      iosClientId: null,
      nonce: "hashed-nonce",
    });
  });

  it("Android에서 애플 요청은 SDK에 닿지 않는다", async () => {
    install("android", PROD_SOCIAL_LOGIN);

    await expect(socialLogin("APPLE")).resolves.toEqual({ status: "failed", code: "UNKNOWN" });
    expect(mockedAppleSignIn).not.toHaveBeenCalled();
  });

  it("카카오 네이티브 모듈이 없는 바이너리면 카카오만 빼고 알린다", () => {
    // 이전 Dev Client에서는 TurboModule을 찾지 못해 SDK를 불러오는 순간 예외가 난다.
    (initializeKakaoSDK as jest.Mock).mockImplementationOnce(() => {
      throw new Error("TurboModuleRegistry.getEnforcing(...): 'RNCKakaoCore' could not be found");
    });

    install("ios", PROD_SOCIAL_LOGIN);

    expect(supportedSocialLoginProviders()).toEqual(["GOOGLE", "APPLE"]);
  });

  it("구글 네이티브 모듈이 없는 바이너리면 구글만 빼고 알리고 SDK도 부르지 않는다", async () => {
    mockNativeModules.googleMissing = true;

    install("android", PROD_SOCIAL_LOGIN);

    expect(supportedSocialLoginProviders()).toEqual(["KAKAO"]);
    await expect(socialLogin("GOOGLE")).resolves.toEqual({ status: "failed", code: "UNKNOWN" });
    expect(mockedGoogle.configure).not.toHaveBeenCalled();
  });

  it("애플 네이티브 모듈이 없는 iOS 바이너리면 애플을 알리지 않고 SDK도 부르지 않는다", async () => {
    mockNativeModules.appleMissing = true;

    install("ios", PROD_SOCIAL_LOGIN);

    expect(supportedSocialLoginProviders()).toEqual(["GOOGLE", "KAKAO"]);
    await expect(socialLogin("APPLE")).resolves.toEqual({ status: "failed", code: "UNKNOWN" });
    expect(mockedAppleSignIn).not.toHaveBeenCalled();
  });
});
