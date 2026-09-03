import { useEffect, useRef } from "react";
import { AccessibilityInfo, findNodeHandle, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrimaryCtaButton } from "./PrimaryCtaButton";

/**
 * 강제 업데이트 화면 (BY-586). 문구·구성은 BY-533 시안 — 웹 `features/force-update/copy.ts`와 같은
 * 확정 카피다(의역·줄임·문장부호 변경 금지).
 *
 * 닫기·나중에가 없는 하드 블록이다. `app/_layout.tsx`가 라우터 스택 대신 이 화면을 통째로 그리므로
 * 뒤로 갈 곳이 없고, Android 하드웨어 백은 앱을 내리는 기본 동작 그대로 둔다(우회 경로를 만들지 않는다).
 * 레이아웃은 `app/permission-denied.tsx`와 같은 전체 화면 관례를 따른다.
 */
export const FORCE_UPDATE_TITLE = "업데이트가 필요해요";
export const FORCE_UPDATE_DESCRIPTION = "원활한 이용을 위해 최신 버전으로 업데이트해 주세요.";
export const FORCE_UPDATE_CONFIRM_LABEL = "지금 업데이트";

export function ForceUpdateScreen({ onUpdate }: { onUpdate: () => void }) {
  const insets = useSafeAreaInsets();
  const titleRef = useRef<Text>(null);

  // 화면 진입 시 스크린 리더 포커스를 타이틀로 보낸다.
  useEffect(() => {
    const handle = findNodeHandle(titleRef.current);
    if (handle != null) {
      AccessibilityInfo.setAccessibilityFocus(handle);
    }
  }, []);

  return (
    <View
      className="bg-bg-base dark:bg-bg-base-dark flex-1"
      style={{ paddingTop: insets.top }}
      testID="force-update-screen"
    >
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
          <Text
            ref={titleRef}
            accessibilityRole="header"
            className="text-text-primary dark:text-text-primary-dark text-center text-[20px] font-bold font-sans leading-[24px]"
          >
            {FORCE_UPDATE_TITLE}
          </Text>
          <Text className="text-text-secondary dark:text-text-secondary-dark mt-[10px] text-center text-[14px] font-sans leading-[21px]">
            {FORCE_UPDATE_DESCRIPTION}
          </Text>
        </View>
      </ScrollView>

      <View className="px-5" style={{ paddingBottom: insets.bottom + 10 }}>
        <PrimaryCtaButton
          label={FORCE_UPDATE_CONFIRM_LABEL}
          onPress={onUpdate}
          testID="force-update-cta"
        />
      </View>
    </View>
  );
}
