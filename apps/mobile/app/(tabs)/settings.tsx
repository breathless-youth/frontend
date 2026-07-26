import { router } from "expo-router";
import { useEffect, useState } from "react";
import { AppState, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsSection } from "../../components/settings/SettingsSection";
import { getCameraPermissionStatus, openAppSettings } from "../../lib/cameraPermission";
import {
  appVersionLabel,
  cameraPermissionRowLabel,
  openExternalUrl,
  SETTINGS_LINKS,
} from "../../lib/settingsInfo";

/**
 * S6 · 설정 — Figma node `67:722`, 스펙 `frontend/docs/screens/SCR-S6-settings.md`.
 *
 * **이 화면에서 앱이 직접 바꾸는 상태는 하나도 없다.** 설정은 "기능을 켜고 끄는 곳"이 아니라
 * "측정 방식을 이해하고, 권한을 확인하러 가는 곳"이다 — 카메라 권한은 OS 설정 앱에서만 바뀌고,
 * 측정 기준 설명은 온보딩 가이드(G1~G5)가 소유한다.
 *
 * V1.0 인벤토리에 없는 항목을 추가하지 않는다: 로그인·계정 삭제(V1.2+, `policies.md` §2),
 * 알림 설정(푸시 알림 정책이 `design.md` 백로그에 미정), 랭킹·프로필.
 * 폐기된 정적 안내 화면 S6-1도 만들지 않는다(가이드로 통합됨).
 */

/**
 * 목적지가 확정된 링크만 눌리게 만든다. `null`이면 핸들러를 아예 만들지 않아 행이 버튼으로
 * 노출되지 않는다 — placeholder URL을 지어내는 것보다 "아직 못 누른다"가 정직하다.
 */
function externalLinkHandler(url: string | null): (() => void) | undefined {
  if (url === null) {
    return undefined;
  }
  return () => {
    void openExternalUrl(url);
  };
}

/**
 * OS 카메라 권한 상태를 조회해 표시용 값으로 돌려준다
 * (`SCR-S6-settings.md` Data Contract 2 · Interaction Contract §3).
 *
 * 마운트 시 1회, 그리고 사용자가 OS 설정에서 권한을 바꾸고 돌아올 때(`AppState` → `active`)
 * 재조회한다. 앱이 권한을 바꾸지는 않는다 — 읽기만 한다.
 *
 * `null`은 "아직 모른다"이며 조회 실패 시에도 그대로 남는다. 모르는 값을 `false`로 접으면
 * 실제로 허용한 사용자에게 "허용 안 됨"으로 보이고, 그건 낙관적 UI 금지 규칙의 반대편
 * 오류다 — 어느 쪽으로도 단정하지 않고 토글을 그리지 않는다.
 */
function useCameraPermissionGranted(): boolean | null {
  const [granted, setGranted] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;

    const sync = () => {
      getCameraPermissionStatus()
        .then((status) => {
          if (active) {
            setGranted(status === "granted");
          }
        })
        .catch((error: unknown) => {
          console.warn("[settings] 카메라 권한 조회 실패", error);
        });
    };

    sync();
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        sync();
      }
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return granted;
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const cameraPermissionGranted = useCameraPermissionGranted();

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
            trailing={
              cameraPermissionGranted === null
                ? undefined
                : { kind: "toggle", granted: cameraPermissionGranted }
            }
            accessibilityLabel={cameraPermissionRowLabel(cameraPermissionGranted)}
            onPress={() => {
              // `lib/cameraPermission.ts`의 구현을 그대로 쓴다 — S2-3과 중복 구현하지 않는다.
              void openAppSettings();
            }}
          />
          {/*
            MG5가 만든 온보딩 가이드(G1~G5) 플로우로 **재진입**시키는 링크다. 가이드의 단계·문구·
            전환은 이 화면이 전혀 알지 못한다 — 설명 문구를 여기 복제하면 두 곳이 갈라진다.
            `entry: "settings"`는 `lib/onboardingGuideSteps.ts`의 진입 출처 C.
            재진입 시 G5 CTA가 세션을 시작할지 닫기만 할지는 **미정**이라 여기서 확정하지 않는다 —
            분기는 `lib/focusStartFlow.ts`가 갖고 있고 현재는 닫기만 한다.
          */}
          <SettingsRow
            label="측정 기준 안내"
            sublabel="자리 이탈 · 휴대폰 사용 · 기기 조작을 기기 안에서만 측정해요"
            trailing={{ kind: "chevron" }}
            onPress={() => {
              router.push({ pathname: "/onboarding-guide", params: { entry: "settings" } });
            }}
          />
        </SettingsSection>

        <SettingsSection className="mt-5" label="지원">
          {/*
            여는 방식(외부 브라우저)은 확정이고 목적지만 미정이다 — URL이 `null`인 동안에는
            핸들러를 만들지 않아 행이 버튼으로 노출되지 않는다(없는 목적지를 있는 척하지 않는다).
            TODO(SCR-S6-settings.md): 문의 폼 URL 미확정 — 상상 URL을 커밋하지 말 것.
          */}
          <SettingsRow
            label="문의하기"
            trailing={{ kind: "external" }}
            accessibilityHint="외부 브라우저로 열려요"
            onPress={externalLinkHandler(SETTINGS_LINKS.contactFormUrl)}
          />
        </SettingsSection>

        <SettingsSection className="mt-6" label="약관 · 정보">
          {/*
            chevron 3종은 앱 내 이동을 뜻하지만 **대상 문서도 목적지 화면도 아직 없다**
            (`design.md` V1.0 화면 인벤토리에 미등재, 개인정보처리방침은 `policies.md`가 작성 TODO).
            존재하지 않는 라우트로 이동을 시도하지 않는다 — 핸들러 없이 표시만 한다.
            TODO(SCR-S6-settings.md Review Checklist): 이용약관·개인정보처리방침·오픈소스 라이선스의
            문서와 목적지(앱 내 WebView vs 외부 링크) 확정 필요.
          */}
          <SettingsRow label="이용약관" trailing={{ kind: "chevron" }} />
          <SettingsRow label="개인정보처리방침" trailing={{ kind: "chevron" }} />
          <SettingsRow label="오픈소스 라이선스" trailing={{ kind: "chevron" }} />
          {/* 트레일링이 값 텍스트뿐이라 탭 불가 — chevron이 없다는 것이 그 표시다. */}
          <SettingsRow label="버전 정보" trailing={{ kind: "value", value: appVersionLabel() }} />
        </SettingsSection>
      </View>
    </ScrollView>
  );
}
