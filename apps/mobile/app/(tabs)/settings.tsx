import { router } from "expo-router";
import { useEffect, useState } from "react";
import { AppState, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsSection } from "../../components/settings/SettingsSection";
import { openAppSettings } from "../../lib/cameraPermission";
import { appVersionLabel, cameraPermissionRowLabel } from "../../lib/settingsInfo";

/**
 * S6 · 설정 — Figma node `67:722`, 스펙 `frontend/docs/screens/SCR-S6-settings.md`.
 *
 * **이 화면에서 앱이 직접 바꾸는 상태는 하나도 없다.** 설정은 "기능을 켜고 끄는 곳"이 아니라
 * "권한을 확인하고, 문서를 찾아보는 곳"이다 — 카메라 권한은 OS 설정 앱에서만 바뀐다.
 *
 * **모든 행이 앱 안에 머문다**(BY-257). 문의는 WebView(`/contact`), 약관·방침은 텍스트
 * 화면(`/terms`·`/privacy`)이다 — 외부 브라우저로 나가는 행이 하나도 없다.
 *
 * V1.0 인벤토리에 없는 항목을 추가하지 않는다: 로그인·계정 삭제(V1.2+, `policies.md` §2),
 * 알림 설정(푸시 알림 정책이 `design.md` 백로그에 미정), 랭킹·프로필.
 * 폐기된 정적 안내 화면 S6-1도 만들지 않는다(가이드로 통합됨).
 */

/**
 * 토글에 넣을 카메라 권한 상태.
 *
 * ⚠️ **실제 OS 권한이 아니라 Figma 예시 상태(On)다.** 지금 `apps/mobile`에는 권한 상태를 읽을
 * 수단이 없다 — `expo-camera`가 dependency에 없고(카메라는 `apps/web` WebView 소유),
 * `frontend/CLAUDE.md`가 "검증되지 않은 네이티브 라이브러리를 추측으로 설치하지 말 것"을 못박고 있다.
 * `lib/cameraPermission.ts`의 어댑터도 아직 mock이라(기본 `undetermined`) 실제 값이 아니다.
 *
 * 값 주입 지점을 이 상수 한 곳으로 모아 뒀다 — 조회 수단이 확정되면 아래 훅과 함께 한 번에 교체된다.
 * TODO(SCR-S6-settings.md Current Limitations): 권한 상태 조회 수단 확정 필요.
 *   **사용자 배포 빌드 전 반드시 해소해야 한다**(실제로 거부한 사용자에게 "허용됨"으로 보인다).
 */
const FIGMA_EXAMPLE_CAMERA_PERMISSION_GRANTED = true;

/**
 * 사용자가 OS 설정에서 권한을 바꾸고 돌아오면 표시가 따라와야 한다 — 그 재조회 지점
 * (`SCR-S6-settings.md` Interaction Contract §3)을 여기 만들어 둔다.
 *
 * 지금은 조회 함수가 없어 주입값을 그대로 유지한다. 값을 낙관적으로 뒤집지 않는 것이 중요하다 —
 * 실제 권한과 어긋난 화면을 보여주느니 바뀌지 않는 편이 낫다.
 */
function useCameraPermissionDisplayState(injectedGranted: boolean): boolean {
  const [granted, setGranted] = useState(injectedGranted);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") {
        return;
      }
      // TODO(SCR-S6-settings.md Data Contract 2): 조회 수단이 확정되면 여기서
      // `getCameraPermissionStatus()`를 호출해 결과로 setGranted 한다.
      setGranted(injectedGranted);
    });

    return () => {
      subscription.remove();
    };
  }, [injectedGranted]);

  return granted;
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const cameraPermissionGranted = useCameraPermissionDisplayState(
    FIGMA_EXAMPLE_CAMERA_PERMISSION_GRANTED,
  );

  return (
    // 402×874에서는 콘텐츠가 탭 바에 닿지 않지만, 폰트 확대·소형 기기에서는 넘친다 —
    // 마지막 행에 도달할 수 있도록 화면 전체를 스크롤 가능하게 둔다.
    <ScrollView
      className="bg-bg-base dark:bg-bg-base-dark flex-1"
      contentContainerStyle={{ paddingTop: insets.top + 17, paddingBottom: 24 }}
    >
      <View className="px-5">
        <Text
          accessibilityRole="header"
          className="text-text-primary dark:text-text-primary-dark text-2xl font-bold leading-[29px]"
        >
          설정
        </Text>

        {/*
          섹션 간 간격은 Figma 실측이 균일하지 않다(타이틀→측정 23 · 캡션→지원 20 · 지원 카드→약관 24).
          균일 `gap`으로 뭉개면 캡션이 있는 구간만 어긋나므로 구간별 마진으로 둔다(S5와 같은 처리).
        */}
        <SettingsSection
          className="mt-[23px]"
          label="측정"
          caption="권한은 시스템 설정에서 바꿀 수 있어요"
        >
          {/*
            토글이 아니라 **행 전체**가 시스템 설정을 여는 버튼이다(`user-flow.md` S6).
            권한이 꺼져 있어도 S2-3(권한 거부 안내)으로 보내지 않는다 — S2-3은 최초 세션 시작
            플로우의 화면이고, 설정 탭에서는 곧장 OS 설정으로 간다.
          */}
          <SettingsRow
            label="카메라 권한"
            trailing={{ kind: "toggle", granted: cameraPermissionGranted }}
            accessibilityLabel={cameraPermissionRowLabel(cameraPermissionGranted)}
            onPress={() => {
              // `lib/cameraPermission.ts`의 구현을 그대로 쓴다 — S2-3과 중복 구현하지 않는다.
              void openAppSettings();
            }}
          />
          {/*
            "측정 기준 안내" 행은 BY-257에서 제거했다. 온보딩 가이드(G1~G5) 자체는 그대로 살아 있고
            홈의 가이드 카드로 재진입한다 — 설정에서 가는 길만 없앤 것이다.
            `lib/onboardingGuideSteps.ts`의 진입 출처 `"settings"`는 MG5 소유라 건드리지 않았다
            (지금은 참조하는 곳이 없다).
          */}
        </SettingsSection>

        <SettingsSection className="mt-5" label="지원">
          {/*
            문의 폼은 **앱 안에서 WebView로 띄운다**(BY-257) — 외부 브라우저로 나가지 않으므로
            chevron(앱 내 이동)이고, "외부 브라우저로 열려요" 힌트를 붙이지 않는다.
            약관·방침과 달리 텍스트로 옮길 수 없다: 응답을 제출해야 하는 인터랙티브 폼이다.
          */}
          <SettingsRow
            label="문의하기"
            trailing={{ kind: "chevron" }}
            onPress={() => {
              router.push("/contact");
            }}
          />
        </SettingsSection>

        <SettingsSection className="mt-6" label="약관 · 정보">
          {/*
            이용약관·개인정보처리방침은 **앱 안에서 직접 보여준다**(BY-257) — 웹에도 같은 문서가
            있지만 외부 브라우저로 내보내지 않는다. chevron(앱 내 이동)이 그대로 맞는 표기다.
            본문은 `lib/legalDocuments.ts`가 소유하고 이 화면은 라우트만 안다.

            "오픈소스 라이선스" 행은 BY-257에서 제거했다(목적지도 문서도 없던 행이다).
          */}
          <SettingsRow
            label="이용약관"
            trailing={{ kind: "chevron" }}
            onPress={() => {
              router.push("/terms");
            }}
          />
          <SettingsRow
            label="개인정보처리방침"
            trailing={{ kind: "chevron" }}
            onPress={() => {
              router.push("/privacy");
            }}
          />
          {/* 트레일링이 값 텍스트뿐이라 탭 불가 — chevron이 없다는 것이 그 표시다. */}
          <SettingsRow label="버전 정보" trailing={{ kind: "value", value: appVersionLabel() }} />
        </SettingsSection>
      </View>
    </ScrollView>
  );
}
