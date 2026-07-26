import { router } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import {
  AccessibilityInfo,
  AppState,
  findNodeHandle,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconCameraOff } from "../components/icons";
import { PrimaryCtaButton } from "../components/PrimaryCtaButton";
import { getCameraPermissionStatus, openAppSettings } from "../lib/cameraPermission";

/**
 * S2-3 · 권한 거부 안내 — Figma node `52:312`, 스펙 `frontend/docs/screens/SCR-S2-camera-permission.md`.
 *
 * 카메라 권한 없이는 측정이 불가능하다는 사실을 안내조로 전달하고 설정으로 되돌릴 길을 준다
 * (`policies.md` §3 카메라 필수 — "카메라 없이 시작하기" 같은 우회 경로를 만들지 않는다).
 * 탭 바가 없는 전체 화면 스택 라우트라 `app/(tabs)/` 밖에 둔다.
 *
 * 문구는 `ai-wiki/product/voice-tone.md` §4에서 그대로 가져온 확정 카피다 — 의역·개행·문장부호 변경 금지.
 * 프라이버시 캡션은 **싱글룸 문구**다(V1.0에 멀티룸 화면이 없다 — 멀티룸 표현을 가져오지 않는다).
 */
export default function PermissionDeniedScreen() {
  const insets = useSafeAreaInsets();
  const titleRef = useRef<Text>(null);

  const goHome = useCallback(() => {
    // 하드웨어 백·스와이프 백도 같은 결과(홈 복귀)를 낸다 — 백 제스처를 막지 않는다.
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/");
  }, []);

  // 화면 진입 시 스크린 리더 포커스를 타이틀로 보낸다.
  useEffect(() => {
    const handle = findNodeHandle(titleRef.current);
    if (handle != null) {
      AccessibilityInfo.setAccessibilityFocus(handle);
    }
  }, []);

  // 설정 앱에 다녀와 포그라운드로 돌아왔을 때 권한 상태를 재조회하는 자리.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        return;
      }
      void getCameraPermissionStatus()
        .then((status) => {
          if (status !== "granted") {
            return;
          }
          // TODO(SCR-S2-camera-permission.md): 설정 복귀 후 자동 세션 시작 여부 미확정 — 리더 확인 필요.
          // 잠정 동작으로 홈 복귀만 하고 세션은 자동 시작하지 않는다(사용자 액션 없이 카메라를
          // 켜지 않는 쪽이 프라이버시상 안전). 확정된 결정이 아니다.
          goHome();
        })
        // 조회에 실패하면 이 화면에 그대로 머문다 — 상태를 모르는 채 화면을 옮기지 않는다.
        // (실제 네이티브 모듈로 교체되면 조회가 throw할 수 있다.)
        .catch((error: unknown) => {
          console.warn("[camera-permission] 포그라운드 복귀 후 권한 재조회 실패", error);
        });
    });
    return () => subscription.remove();
  }, [goHome]);

  return (
    <View className="bg-bg-base dark:bg-bg-base-dark flex-1" style={{ paddingTop: insets.top }}>
      {/*
        시스템 폰트 확대 시 본문·캡션이 잘리거나 CTA가 밀려나지 않도록 내용 영역을 스크롤 가능하게 둔다.
        Figma는 내용 블록을 남는 영역의 정중앙이 아니라 27px 위(아이콘 원 top=261)에 둔다 —
        빈 상태 화면의 시각적 중심이다. 절대 좌표 대신 아래/위 패딩 차(54)로 그 편차를 재현한다.
      */}
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          paddingHorizontal: 20,
          paddingTop: 24,
          paddingBottom: 78,
        }}
      >
        <View className="items-center">
          {/* 장식 요소 — 의미는 아래 타이틀이 전달하므로 스크린 리더에서 제외한다.
              Figma는 #F2F4F6 하드코딩이지만 값이 bg/layer2와 일치해 토큰으로 바인딩한다(다크모드 대응). */}
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            className="bg-bg-layer2 dark:bg-bg-layer2-dark size-[66px] items-center justify-center rounded-full"
          >
            <IconCameraOff size={28} />
          </View>

          {/* 아래 타이포는 전부 Figma 실측값이다 — 표준 스케일에 억지로 근사하지 않는다(스펙 참고) */}
          <Text
            ref={titleRef}
            accessibilityRole="header"
            className="text-text-primary dark:text-text-primary-dark mt-[39px] text-center text-[20px] font-bold leading-[24px]"
          >
            카메라 권한이 필요해요
          </Text>

          <Text className="text-text-secondary dark:text-text-secondary-dark mt-[10px] text-center text-[14px] leading-[21px]">
            측정은 카메라로만 할 수 있어요.{"\n"}설정에서 허용하면 바로 시작할 수 있어요.
          </Text>

          <Text className="text-text-tertiary mt-[10px] text-center text-[12px] leading-[14px]">
            영상은 기기 안에서만 처리되고 저장되지 않아요
          </Text>
        </View>
      </ScrollView>

      <View className="px-5" style={{ paddingBottom: insets.bottom + 10 }}>
        <PrimaryCtaButton
          label="설정 열기"
          onPress={() => {
            // 설정 앱으로만 이동한다 — 앱 내부 화면 전환은 없다(S2-3 그대로 유지).
            void openAppSettings();
          }}
        />
        {/* 텍스트 높이는 16px뿐이라 상하 패딩 14px로 터치 영역을 44px까지 넓힌다(시각 위치는 Figma 유지) */}
        <Pressable
          onPress={goHome}
          accessibilityRole="button"
          className="mt-[12px] items-center justify-center py-[14px]"
        >
          <Text className="text-text-secondary dark:text-text-secondary-dark text-center text-[13px] font-medium leading-[16px]">
            홈으로 돌아가기
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
