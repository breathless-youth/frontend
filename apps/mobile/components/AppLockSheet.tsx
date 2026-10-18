import { router } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrimaryCtaButton } from "./PrimaryCtaButton";

/**
 * 방해 앱 잠금 안내 시트
 *
 * 투명 모달 위에 어두운 배경과 아래 시트를 그린다.
 * 배경을 누르면 시스템 뒤로가기와 같이 닫혀서 닫기 처리는 각 화면의 언마운트가 맡는다.
 */
export function AppLockSheet({
  title,
  children,
  primary,
  secondaryLabel,
}: {
  title: string;
  children: ReactNode;
  primary: { label: string; onPress: () => void };
  secondaryLabel: string;
}) {
  const insets = useSafeAreaInsets();
  return (
    // Android는 react-native-screens가 투명 모달 아래 화면을 TalkBack에서 숨겨 이 값은 iOS만 쓴다.
    <View accessibilityViewIsModal className="flex-1 justify-end">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="닫기"
        onPress={() => router.back()}
        className="bg-bg-dim dark:bg-bg-dim-dark absolute inset-0"
      />
      <View
        className="bg-bg-layer1 dark:bg-bg-layer1-dark rounded-t-xl px-5 pt-3"
        style={{ paddingBottom: insets.bottom + 8 }}
      >
        <View className="bg-border-strong dark:bg-border-strong-dark mb-6 h-1 w-9 self-center rounded-full" />
        <Text
          accessibilityRole="header"
          className="text-text-primary dark:text-text-primary-dark mb-4 text-[20px] font-sans-bold leading-[28px]"
        >
          {title}
        </Text>
        {children}
        <View className="mt-5">
          <PrimaryCtaButton label={primary.label} onPress={primary.onPress} />
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          className="min-h-11 items-center justify-center"
        >
          <Text className="text-text-secondary dark:text-text-secondary-dark font-sans text-[14px]">
            {secondaryLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
