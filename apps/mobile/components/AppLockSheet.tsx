import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrimaryCtaButton } from "./PrimaryCtaButton";

/**
 * 방해 앱 잠금 안내 시트의 내용
 *
 * 시트 자체와 닫기는 루트 스택의 formSheet가 맡고 여기서는 시트 안만 그린다.
 * 시트 높이를 내용에 맞추므로 flex-1을 주지 않는다.
 * react-native-screens 4.26은 Android 시트에 grabber를 그리지 않아 손잡이는 직접 그린다.
 */
export function AppLockSheet({
  title,
  children,
  primary,
}: {
  title: string;
  children: ReactNode;
  primary: { label: string; onPress: () => void };
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      className="bg-bg-layer1 dark:bg-bg-layer1-dark px-5 pt-3"
      style={{ paddingBottom: insets.bottom + 8 }}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="bg-border-strong dark:bg-border-strong-dark mb-6 h-1 w-9 self-center rounded-full"
      />
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
    </View>
  );
}
