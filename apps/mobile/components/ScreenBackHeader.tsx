import { router } from "expo-router";
import { useCallback } from "react";
import { Pressable, Text, View } from "react-native";

import { IconChevronLeft } from "./icons";

/**
 * 탭 바 없는 전체 화면 라우트(`/terms`·`/privacy`·`/contact`)의 상단 바.
 *
 * 뒤로가기 처리를 한 곳에 모은다 — 화면마다 `canGoBack()` 분기를 복제하면 딥링크로 직행했을 때의
 * 동작이 화면별로 갈라진다.
 */

type ScreenBackHeaderProps = {
  /**
   * 상단 바에 표시할 제목. 본문이 자기 제목을 크게 그리는 화면(법적 문서)은 넘기지 않는다 —
   * 같은 제목이 두 번 읽히면 스크린리더에서 중복된다.
   */
  title?: string;
};

export function ScreenBackHeader({ title }: ScreenBackHeaderProps) {
  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    // 딥링크로 곧장 열렸을 때의 대비 — 스택이 비어 있으면 설정 탭으로 보낸다.
    router.replace("/settings");
  }, []);

  return (
    <View className="h-[52px] flex-row items-center px-[8px]">
      {/* 아이콘뿐이라 라벨을 반드시 붙인다 — 아이콘만으로는 스크린리더가 읽지 못한다. */}
      <Pressable
        onPress={goBack}
        accessibilityRole="button"
        accessibilityLabel="뒤로 가기"
        className="size-11 items-center justify-center"
      >
        <IconChevronLeft size={16} />
      </Pressable>

      {title !== undefined && (
        <Text
          accessibilityRole="header"
          className="text-text-primary dark:text-text-primary-dark shrink text-[17px] font-semibold leading-[21px]"
        >
          {title}
        </Text>
      )}
    </View>
  );
}
