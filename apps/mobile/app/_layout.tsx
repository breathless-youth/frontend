import "../global.css";

import { colors } from "@focusmakers/design-tokens";
import { useFonts } from "expo-font";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { AppState, Platform, Pressable, useColorScheme } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { LaunchGoalOverlay } from "../components/LaunchGoalOverlay";
import { cleanupOnLaunch } from "../lib/appLock/appLock";
import { type ForceUpdateDecision, resolveForceUpdateOnLaunch } from "../lib/forceUpdate";
import { createAppStateTracker } from "../lib/appStateAnalytics";
import { installFirebaseAnalyticsSdk } from "../lib/firebaseAnalyticsSdk";
import { FORCE_UPDATE_TITLE, forceUpdateAlert } from "../lib/forceUpdateAlert";
import { startInstallAttribution } from "../lib/installAttribution";
import { consumePendingInviteRoute } from "../lib/installReferrerInvite";
import { type LaunchGoal, readLaunchGoal, refreshLaunchGoal } from "../lib/launchGoal";
import { initMetaAds } from "../lib/metaAds";
import { installMetaAdsSdk } from "../lib/metaAdsSdk";
import { lockPortrait } from "../lib/orientation";
import { ensurePushPermission, startPushMessaging } from "../lib/pushBootstrap";
import { openPushRoute } from "../lib/pushRouteOpener";
import { registerPushToken, watchAuthForPushToken } from "../lib/pushTokenRegistration";
import { recommendedUpdateAlert } from "../lib/recommendedUpdateAlert";
import { initSentry, wrapRoot } from "../lib/sentry";
import { runAfterSession } from "../lib/sessionPresence";
import { checkUpdateOnConnect, createReconnectListener } from "../lib/updateOnConnect";
import { ensureUserRegistered } from "../lib/userApi";
import { removeLeftoverVideoFiles } from "../lib/videoTransfer";

/**
 * **렌더 밖(모듈 스코프)에서 부른다.** effect로 미루면 그 사이에 나는 에러 — 특히 앱 시작
 * 직후 터지는 것들 — 을 놓친다. 초기화 자체는 DSN 유무만 보므로 부작용이 없다.
 */
initSentry();

// Meta 광고 SDK 어댑터 — Meta env가 주입된 빌드에서만 붙는다. 모듈 스코프인 이유는 위와 같다: 첫
// 실행의 가입 완료 이벤트가 등록 경로(`lib/auth.ts`)에서 나오는데, 그보다 먼저 통로가 있어야
// 큐에 들어간다. 실제 초기화·ATT 프롬프트는 홈이 그려진 뒤 `initMetaAds`가 한다.
installMetaAdsSdk();

// Firebase Analytics(GA4) 어댑터 — 웹뷰가 뜨자마자 브리지로 오는 이벤트를 받을 통로가 먼저 있어야 한다.
// GA user_id를 백엔드 userId로 맞추는 구독도 여기서 건다.
installFirebaseAnalyticsSdk();

// 지난 프로세스가 남긴 방해 앱 잠금과 안전 해제 예약을 지운다.
// 새 프로세스에는 진행 중인 공부가 없고, 웹뷰가 잠금을 요청하기 전에 끝나야 해서 모듈 스코프에서 한 번만 부른다.
void cleanupOnLaunch();

// Pretendard 로드가 끝날 때까지(아래 useFonts) 스플래시를 유지한다
// — 안 그러면 시스템 폰트로 한 프레임 그렸다가 Pretendard로 바뀌는 깜빡임(FOUT)이 보인다.
// 위 initSentry와 같은 이유로 모듈 스코프에서 부른다: effect까지 미루면 그 사이 자동으로 숨어버릴 수 있다.
// 이미 숨겨진 상태에서 또 불리는 등 실패해도 무해하므로 거부는 무시한다.
void SplashScreen.preventAutoHideAsync().catch(() => {});

// 모서리 20은 tailwind `rounded-xl`과 같다.
const APP_LOCK_SHEET_OPTIONS = {
  presentation: "formSheet",
  sheetAllowedDetents: "fitToContents",
  sheetCornerRadius: 20,
  contentStyle: { backgroundColor: "transparent" },
} as const;

function RootLayout() {
  const router = useRouter();
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const [fontsLoaded, fontError] = useFonts({
    Pretendard: require("pretendard/dist/public/static/Pretendard-Regular.otf") as number,
    PretendardLight: require("pretendard/dist/public/static/Pretendard-Light.otf") as number,
    PretendardBold: require("pretendard/dist/public/static/Pretendard-Bold.otf") as number,
  });
  // 앱을 켤 때 서버 값을 짧게 기다려 판정하고, 늦으면 지난 값으로 먼저 판정한다(`lib/forceUpdate.ts`).
  // "forced"면 라우터 스택 대신 빈 배경만 그리고 그 위에 OS 알림창(`lib/forceUpdateAlert.ts`)을 띄운다.
  // 30분 이상 백그라운드에 있다 돌아올 때도 서버 값을 새로 받아 다시 판정한다(`lib/updateOnConnect.ts`).
  // 판정이 나중에 forced로 바뀌면 홈 위에서 바로 막는다.
  const [updateGate, setUpdateGate] = useState<"pending" | "pass" | "forced">("pending");
  // 권장 업데이트는 마지막 판정에서 나온 `latest_version`이고, 권장 대상이 아니면 null이다.
  const [recommendedVersion, setRecommendedVersion] = useState<string | null>(null);
  // 스플래시 뒤에 덮을 목표 문구다.
  // undefined는 아직 읽는 중이고 null은 덮지 않는다는 뜻이다.
  const [launchGoal, setLaunchGoal] = useState<LaunchGoal | null | undefined>(undefined);
  const [launchGoalDone, setLaunchGoalDone] = useState(false);

  useEffect(() => {
    void readLaunchGoal().then(setLaunchGoal);
  }, []);

  useEffect(() => {
    let active = true;
    const apply = (decision: ForceUpdateDecision) => {
      if (!active) return;
      setUpdateGate(decision.forced ? "forced" : "pass");
      setRecommendedVersion(decision.recommended ? decision.latestVersion : null);
      // 오버레이는 스플래시 바로 뒤에만 의미가 있어서 막혔다가 풀린 홈 위에는 다시 띄우지 않는다.
      if (decision.forced) setLaunchGoalDone(true);
    };
    void resolveForceUpdateOnLaunch().then(
      ({ decision, late }) => {
        apply(decision);
        void late?.then((next) => runAfterSession(() => apply(next)));
      },
      () => {
        if (active) setUpdateGate("pass");
      },
    );
    const sub = AppState.addEventListener(
      "change",
      createReconnectListener(() => void checkUpdateOnConnect("resume", apply)),
    );
    return () => {
      active = false;
      sub.remove();
    };
  }, []);

  const fontsReady = fontsLoaded || fontError;
  const gateReady = updateGate !== "pending";
  const launchGoalReady = launchGoal !== undefined;
  // 오버레이를 그리지 않는 실행이거나 오버레이가 걷힌 뒤다.
  const launchGoalCleared = launchGoal === null || launchGoalDone;

  // forced인 동안 알림창을 띄우고 스토어 복귀 때 다시 띄운다. 게이트가 바뀌거나 언마운트되면 구독을 푼다.
  useEffect(() => {
    if (updateGate !== "forced") return;
    return forceUpdateAlert.start();
  }, [updateGate]);

  // 아래 권한 요청 effect보다 먼저 선언한다.
  // effect는 선언 순서로 돌아서 스플래시를 걷는 호출이 ATT 요청보다 앞에 나간다.
  useEffect(() => {
    // 실패해도 스플래시는 걷는다 — 시스템 폰트로라도 그려야지, 안 그려질 이유가 없다.
    // 게이트 판정도 같이 기다린다: 웹뷰가 잠깐 떴다가 안내 화면으로 바뀌는 깜빡임을 막는다.
    // 목표 문구 읽기도 기다린다.
    // 홈 스켈레톤이 한 프레임 보였다가 오버레이가 덮는 깜빡임을 막기 위해서다.
    if (fontsReady && gateReady && launchGoalReady) {
      void SplashScreen.hideAsync();
    }
  }, [fontsReady, gateReady, launchGoalReady]);

  // 시작 때 뜨는 OS 창 셋을 한 줄로 세운다 — Meta SDK 초기화 + iOS ATT 프롬프트 → 알림 권한 → 권장 업데이트
  // 알림창. 전부 OS 알림창이라 겹치면 나중 것이 묻히거나 순서가 뒤집히고, ATT는 다른 창이 떠 있으면 아예 뜨지
  // 않아 맨 앞이다. 홈이 그려진 뒤(폰트·게이트 통과)에 시작한다 — 스플래시 위에서는 OS가 프롬프트를 띄우지
  // 않고, 강제 업데이트로 막힌 실행에서는 물을 이유가 없다. Meta env 없는 빌드는 첫 단계가 즉시 끝난다.
  // 앱이 active가 되기 전이면 ATT 요청은 어댑터(`lib/metaAdsSdk.ts`)가 기다렸다 보낸다.
  // 권장 알림창을 최신 버전당 한 번만 묻는 판단은 `recommendedUpdateAlert`가 한다. 앞의 두 단계는 프라미스를
  // 붙잡아 두어, effect가 다시 돌아도 권한 요청이 겹쳐 나가지 않는다.
  // 실행 직후 목표 문구 오버레이가 있으면 문구를 읽는 동안 OS 창이 덮지 않도록 걷힌 뒤에 시작한다.
  const permissionPrompts = useRef<Promise<void> | null>(null);
  useEffect(() => {
    if (updateGate !== "pass" || !fontsReady || !launchGoalCleared) return;
    let active = true;
    if (permissionPrompts.current == null) {
      permissionPrompts.current = initMetaAds().then(() => ensurePushPermission());
      // 권한 응답까지 받은 뒤 실행마다 한 번 서버에 토큰을 등록한다. 알림창 순서를 붙잡지 않도록 따로 띄운다.
      void permissionPrompts.current.then(() => registerPushToken());
      // 설치 유입 정보는 추적 동의 응답 뒤에 메타 지연 딥링크를 물어야 해서 같은 초기화를 기다린다.
      void startInstallAttribution();
    }
    void permissionPrompts.current.then(() => {
      if (!active || recommendedVersion === null) return;
      runAfterSession(() => {
        if (active) void recommendedUpdateAlert.maybeShow(recommendedVersion);
      });
    });
    return () => {
      active = false;
    };
  }, [updateGate, fontsReady, launchGoalCleared, recommendedVersion]);

  useEffect(() => {
    // 프로필 조회에 토큰이 필요해서 등록이 끝난 뒤 다음 실행에 쓸 목표 문구를 받는다.
    void ensureUserRegistered().then(() => refreshLaunchGoal());
    // 공유 시트에 넘긴 타임랩스 사본은 공유 직후 지울 수 없어 다음 실행이 지운다.
    removeLeftoverVideoFiles();
    // 앱 전역 세로 잠금 — 세션(`room/[id]`)이 자기 마운트에서 풀고 언마운트에서 되잠근다.
    // 아래 rn-screens `orientation` 옵션은 iOS에서 무력해서(P0-3 정정, `lib/orientation.ts`)
    // 실제 잠금은 이 호출이 담당한다.
    lockPortrait();
  }, []);

  // 푸시 알림 배선(BY-586) — 포그라운드 로그, 알림 탭 → 딥링크 이동, 토큰 갱신 로그. 권한 요청은 위
  // 시작 알림창 순서에서 한다. 백그라운드 핸들러는 `index.ts`에서 컴포넌트 밖에 건다.
  useEffect(
    () =>
      startPushMessaging({
        // 초대 푸시는 세션 화면에 넘기고, 그 밖의 경로는 세션이 끝난 뒤 담당 탭으로 연다.
        navigate: (route) => openPushRoute(route, (target) => router.push(target)),
      }),
    [router],
  );

  useEffect(() => {
    // Install Referrer는 Android 전용이다 — iOS는 스토어가 값을 앱에 전달할 통로 자체가 없다.
    if (Platform.OS !== "android") return;
    void consumePendingInviteRoute().then((route) => {
      if (route !== null) router.push(route);
    });
  }, [router]);

  // 포/백그라운드 전환을 웹 Amplitude로 넘긴다(`lib/appStateAnalytics.ts`) — 네이티브만 한 번에
  // 판정할 수 있는 사용자 행동이다. 웹뷰 각각의 visibilitychange로 찍으면 탭 수만큼 중복된다.
  useEffect(() => {
    const sub = AppState.addEventListener("change", createAppStateTracker());
    return () => sub.remove();
  }, []);

  // 세션 중에 바꾼 목표 문구가 다음 콜드 스타트에 보이도록 백그라운드로 갈 때마다 받는다.
  // 돌아올 때는 설정에서 바꾼 알림 권한을 서버에 알린다 — 권한이 그대로면 등록 함수가 보내지 않는다.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background") void refreshLaunchGoal();
      if (state === "active") void registerPushToken();
    });
    return () => sub.remove();
  }, []);

  // 재등록으로 사용자가 바뀌면 그 사용자로 푸시 토큰을 다시 등록한다.
  useEffect(() => watchAuthForPushToken(), []);

  // Pretendard 로드 결과(성공/실패)가 나오기 전에는 아무것도 그리지 않는다 — 스플래시가 그
  // 자리를 대신 덮는다(위 preventAutoHideAsync). 실패까지 여기서 계속 막으면 스플래시가
  // 영영 안 걷혀 앱이 멎는다 — 실패 시엔 시스템 폰트로라도 그린다.
  if (!fontsReady || !gateReady || !launchGoalReady) {
    return null;
  }

  if (updateGate === "forced") {
    // 알림창 뒤에 깔리는 빈 배경. 갈 곳이 없는 하드 블록이고, 알림창이 어떤 이유로든 사라졌을 때 탭하면
    // 다시 띄운다 — 배경을 탭할 수 있다는 것 자체가 알림창이 없다는 뜻이다.
    return (
      <>
        <StatusBar style="auto" />
        <Pressable
          accessibilityLabel={FORCE_UPDATE_TITLE}
          accessibilityHint="업데이트 안내를 다시 표시합니다"
          className="bg-bg-base dark:bg-bg-base-dark flex-1"
          onPress={() => forceUpdateAlert.reshow()}
          testID="force-update-backdrop"
        />
      </>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      {/*
        방향은 **화면 단위로** 정한다 — 기본 세로, 세션(`room/[id]`)과 소셜룸(웹 브리지
        `set-orientation`)만 회전 허용.

        `app.json`의 `orientation`은 `"default"`(전 방향)여야 한다. 그건 "앱을 전부 회전
        가능하게" 만드는 설정이 아니라 **네이티브가 허용하는 방향의 상한**이다(iOS
        `UISupportedInterfaceOrientations`). 여기서 `"portrait"`로 조이면 상한이 세로로 닫혀
        세션이 landscape를 요청해도 회전하지 않는다.

        그래서 정책은: 상한은 전 방향으로 열어 두고, 기본값을 세로로 닫은 다음, 룸에서만
        다시 연다.

        ⚠️ **rn-screens `orientation` 옵션은 Android에서만 싣는다** (BY-444, 2026-08-26 —
        "iOS에서 무력하지만 무해"라던 P0-3 정정(2026-08-01)의 재정정). iOS에서 이 옵션은
        무해하지 않다: 화면 어딘가에 orientation이 실려 있으면 expo-screen-orientation의
        루트 VC(`ScreenOrientationViewController`)가 `shouldUseRNScreenOrientation()`으로
        **JS 잠금(`lockAsync`)을 통째로 무시하고 rn-screens에 양보**하는데, rn-screens의
        iOS 마스크 산출 경로는 우리 계층 구조에서 전 방향 허용으로 떨어진다. 그래서 8/1에
        도입한 iOS 세로 잠금이 한 번도 집행되지 못하고 전 화면이 회전됐다. iOS 방향의
        단일 소유자는 `lib/orientation.ts`(expo-screen-orientation)다: 위 effect의
        `lockPortrait()` + 룸의 해제/재잠금. Android는 이 옵션(`setRequestedOrientation`)이
        그대로 동작하므로 유지한다.
      */}
      <Stack
        screenOptions={{
          headerShown: false,
          // 화면 전환 사이 한 프레임 동안 내비게이션 기본 회색 배경이 비치지 않게 웹뷰와 같은 배경을 깐다.
          ...(Platform.OS === "android"
            ? {
                orientation: "portrait" as const,
                contentStyle: { backgroundColor: colors.bg.base[scheme] },
              }
            : null),
        }}
      >
        <Stack.Screen name="(tabs)" />
        {/* S2-3 권한 거부 안내 — 탭 위에 올라오는 전체 화면. 백 제스처를 막지 않는다(홈 복귀와 동일 결과). */}
        <Stack.Screen name="permission-denied" />
        {/*
          잠글 앱 고르기 — iOS 스크린타임 선택 화면이라 웹뷰 대신 네이티브 모달로 연다.
          Android는 설치된 앱 목록(`app-lock-picker.android.tsx`)이고, 앱 이름을 웹에 넘기지 않으려고 같은 모달로 연다.
          쓸어 닫아도 고른 결과는 저장된다.
        */}
        <Stack.Screen name="app-lock-picker" options={{ presentation: "modal" }} />
        {/*
          Android 방해 앱 잠금 권한 안내와 배터리 안내. 쓸어 닫기·배경 어둡게·배경 눌러 닫기를 시스템 시트에 맡긴다.
          시트 색은 화면이 토큰으로 칠해 라이트·다크를 따르게 하고, 네이티브 배경은 투명으로 둔다.
        */}
        <Stack.Screen name="app-lock-consent" options={APP_LOCK_SHEET_OPTIONS} />
        <Stack.Screen name="app-lock-battery" options={APP_LOCK_SHEET_OPTIONS} />
        {/*
          이용약관·개인정보처리방침·문의하기는 웹으로 이관됐다(BY-333) —
          네이티브 라우트를 더 이상 두지 않는다.
        */}
        {/*
          싱글룸 세션(S3) — 화면 구현체는 apps/web이고 WebView로 로드한다(ADR 0001).
          탭 바를 가리는 전체 화면으로 띄운다: 세션 중에는 탭 이동이 없다.
        */}
        {/*
          방향: 이 화면만 회전을 연다(S3-5·S3-6 가로 거치 모드). Android 전용인 이유는 위
          Stack 주석과 같다(BY-444) — iOS는 세션 화면의 `unlockForSession()`이 연다.
          `"all"`이 아니라 `"default"`인 이유는 iOS에서 `"all"`이 **거꾸로 세로**
          (portrait_down)까지 포함하기 때문이다 — 거치대에 눕히는 용도에 거꾸로는 필요 없고,
          Android에서는 `"default"`가 시스템 판단에 맡겨 사용자의 회전 잠금 설정을 존중한다.

          세로 세션 화면(S3-1~S3-4)도 그대로 살아 있다 — 가로는 강제가 아니라 선택지다.
        */}
        <Stack.Screen
          name="room/[id]"
          options={{
            presentation: "fullScreenModal",
            ...(Platform.OS === "android" ? { orientation: "default" as const } : null),
          }}
        />
      </Stack>
      {/* 판정이 나중에 forced로 바뀌면 위 분기가 대신 그려져 오버레이도 함께 사라진다. */}
      {launchGoal && !launchGoalDone && (
        <LaunchGoalOverlay launchGoal={launchGoal} onDone={() => setLaunchGoalDone(true)} />
      )}
    </SafeAreaProvider>
  );
}

// 렌더 트리에서 난 에러를 잡으려면 루트를 감싸야 한다 — `initSentry()`만으로는 부족하다.
export default wrapRoot(RootLayout);
