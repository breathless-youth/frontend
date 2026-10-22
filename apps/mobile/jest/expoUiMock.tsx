import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

/**
 * `@expo/ui/swift-ui`를 RN 기본 요소로 바꾼 테스트용 대역
 *
 * SwiftUI 뷰는 jest에서 그려지지 않아 접근성 라벨과 누름만 RN 요소로 옮긴다.
 * 모양을 정하는 modifier는 무시하고 `accessibilityLabel`만 읽는다.
 */

type Modifier = { $type: string; value?: unknown };

function readModifier(modifiers: Modifier[] | undefined, type: string): unknown {
  return modifiers?.find((modifier) => modifier.$type === type)?.value;
}

function Container({ children }: { children?: ReactNode }) {
  return <View>{children}</View>;
}

export const swiftUi = {
  Host: Container,
  Image: () => null,
  Button: ({
    onPress,
    modifiers,
    children,
  }: {
    onPress?: () => void;
    modifiers?: Modifier[];
    children?: ReactNode;
  }) => {
    const accessibilityLabel = readModifier(modifiers, "accessibilityLabel");
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={typeof accessibilityLabel === "string" ? accessibilityLabel : undefined}
        onPress={onPress}
      >
        {children}
      </Pressable>
    );
  },
};

const modifier =
  (type: string) =>
  (value?: unknown): Modifier => ({ $type: type, value });

export const swiftUiModifiers = {
  accessibilityLabel: modifier("accessibilityLabel"),
  buttonBorderShape: modifier("buttonBorderShape"),
  buttonStyle: modifier("buttonStyle"),
  controlSize: modifier("controlSize"),
  frame: modifier("frame"),
};
