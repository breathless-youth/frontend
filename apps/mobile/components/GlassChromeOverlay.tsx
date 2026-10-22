import { Button, Host, Image } from "@expo/ui/swift-ui";
import {
  accessibilityLabel,
  buttonBorderShape,
  buttonStyle,
  controlSize,
  frame,
} from "@expo/ui/swift-ui/modifiers";
import { Animated, StyleSheet, Text, useColorScheme, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors } from "@focusmakers/design-tokens";
import type { GlassChromeTop, SetGlassChromeMessage } from "@focusmakers/types";

type Scheme = "light" | "dark";
type GlassPress = (id: string, value: number) => void;

const TOP_ROW_OFFSET = 4;
const TOP_ROW_HEIGHT = 44;

/**
 * 안전 영역 아래에서 위쪽 줄과 그 아래 여백이 차지하는 높이
 *
 * 웹이 GlassChrome 자리로 비워 두는 높이와 같다.
 * 본문 부품은 멈춰 있을 때 이 선 아래에 있고, 스크롤로 올라가면 이 선에서 잘려 위쪽 줄 위에 그려지지 않는다.
 */
export const GLASS_TOP_ROW_CLIP = TOP_ROW_OFFSET + TOP_ROW_HEIGHT + 4;

// 위쪽 줄 높이가 44로 고정이라 제목이 줄 밖으로 넘치지 않게 시스템 글자 크기는 이 배율까지만 따른다.
const TITLE_MAX_FONT_SCALE = 1.3;

export type GlassChromeOverlayProps = {
  chrome: SetGlassChromeMessage | null;
  /**
   * 층 전체 투명도
   *
   * 뒤로 가기 스와이프를 따라 프레임마다 바뀌어서 다시 렌더하지 않도록 값 객체로 받는다.
   */
  opacity?: Animated.Value;
  onPress: GlassPress;
};

/**
 * 웹뷰 위 glass 고정 층
 *
 * 웹은 위쪽 줄 자리만 비워 두고 이 층이 네이티브 Liquid Glass로 그린다.
 * 네이티브 뷰는 웹 시트보다 위에 그려지므로 웹이 시트를 열었다고 알리면 통째로 숨긴다.
 */
export function GlassChromeOverlay({ chrome, opacity, onPress }: GlassChromeOverlayProps) {
  if (chrome === null || chrome.obscured) {
    return null;
  }
  return <GlassChromeLayer top={chrome.top} opacity={opacity} onPress={onPress} />;
}

function GlassChromeLayer({
  top,
  opacity,
  onPress,
}: {
  top: GlassChromeTop | null;
  opacity: Animated.Value | undefined;
  onPress: GlassPress;
}) {
  const insets = useSafeAreaInsets();
  const scheme: Scheme = useColorScheme() === "dark" ? "dark" : "light";

  return (
    <Animated.View
      testID="glass-chrome"
      pointerEvents="box-none"
      style={[StyleSheet.absoluteFill, { opacity }]}
    >
      {top !== null && (
        <View
          pointerEvents="box-none"
          style={[styles.topRow, { top: insets.top + TOP_ROW_OFFSET }]}
        >
          {/* VoiceOver가 그린 순서대로 읽어서 뒤로 버튼을 먼저 두고, 제목은 절대 위치라 배치는 그대로다. */}
          <Host matchContents colorScheme={scheme}>
            <Button
              onPress={() => onPress("chrome:leading", 0)}
              modifiers={[
                buttonStyle("glass"),
                buttonBorderShape("circle"),
                controlSize("large"),
                frame({ width: 44, height: 44 }),
                accessibilityLabel(top.leadingLabel),
              ]}
            >
              <Image
                systemName={top.leading === "back" ? "chevron.left" : "xmark"}
                size={20}
                color={colors.text.primary[scheme]}
              />
            </Button>
          </Host>
          {top.title !== null && (
            <View style={styles.titleSlot}>
              <Text
                accessibilityRole="header"
                numberOfLines={1}
                maxFontSizeMultiplier={TITLE_MAX_FONT_SCALE}
                style={[styles.title, { color: colors.text.primary[scheme] }]}
              >
                {top.title}
              </Text>
            </View>
          )}
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // 뒤로 버튼 Host가 줄 폭으로 늘어나 웹 누름을 가로채지 않게 왼쪽에 붙인다.
  topRow: {
    position: "absolute",
    left: 20,
    right: 20,
    height: TOP_ROW_HEIGHT,
    alignItems: "flex-start",
  },
  // 왼쪽 버튼 44와 간격 12만큼 양쪽을 비워야 제목이 화면 가운데에 온다.
  // 시스템 글자 크기를 따르면 줄 높이도 같은 배율로 커져서 줄 가운데에 맞춰 둔다.
  titleSlot: {
    position: "absolute",
    left: 56,
    right: 56,
    top: 0,
    height: TOP_ROW_HEIGHT,
    justifyContent: "center",
    pointerEvents: "none",
  },
  title: {
    lineHeight: TOP_ROW_HEIGHT,
    textAlign: "center",
    fontFamily: "PretendardBold",
    fontSize: 17,
  },
});
