import { Pressable, Text, View } from "react-native";

/**
 * 조회 실패 자리표시 — 메시지 + 다시 시도. Figma에 오류 상태 정의가 없어
 * 기존 카드 토큰만 쓰는 최소 구현이다(BY-313). 문구는 호출부가 정한다(voice-tone 준수).
 */
export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View className="bg-bg-layer1 dark:bg-bg-layer1-dark border-border-default dark:border-border-default-dark items-center gap-3 rounded-[20px] border px-5 py-8">
      <Text className="text-text-secondary dark:text-text-secondary-dark text-sm">{message}</Text>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="다시 시도"
        className="bg-brand-subtle dark:bg-brand-subtle-dark min-h-11 justify-center rounded-full px-5"
      >
        <Text className="text-brand-primary dark:text-brand-primary-dark text-sm font-semibold">
          다시 시도
        </Text>
      </Pressable>
    </View>
  );
}
