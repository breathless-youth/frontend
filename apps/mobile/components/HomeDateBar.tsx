import { colors, softBlue } from "@focusmakers/design-tokens";
import { useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";

import { HomeDateMenuButton } from "./HomeDateMenuButton";
import { triggerHaptic } from "../lib/haptics";
import {
  isViewingPastDate,
  pressHomeMenu,
  selectHomeDate,
  useHomeDateBar,
} from "../lib/homeDateBar";
import { useTabBarState } from "../lib/tabBarVisibility";

const CHIP_MAX_WIDTH = 104;

/**
 * 홈 날짜 줄
 *
 * 처음에는 오른쪽 끝의 오늘이 보이게 둔다.
 * 칩 폭은 스크롤 영역의 3분의 1이라 최소 3일이 보인다.
 * 칩 높이는 놓이는 자리의 높이에 맞춰 부르는 쪽이 정한다.
 */
export function HomeDateBar({ chipHeight }: { chipHeight: number }) {
  const bar = useHomeDateBar();
  // 웹 모달이나 코치마크가 떠 있는 동안 날짜를 바꾸면 그 뒤 홈이 바뀌어 안내가 어긋난다.
  const tabBarState = useTabBarState();
  const locked = tabBarState === "blocked" || tabBarState === "blocked-except-play";
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const scrollRef = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  // 선택이 바뀌어도 스크롤을 오늘로 되돌리지 않도록 처음 한 번만 끝으로 보낸다.
  const scrolledForRef = useRef<string | null>(null);
  // iOS 액세서리는 늘 마운트돼 있어서, 거둘 때 기억을 비워야 다시 받을 때 오늘로 간다.
  useEffect(() => {
    if (bar === null) {
      scrolledForRef.current = null;
    }
  }, [bar]);
  // 탭 바 버튼으로 오늘에 돌아오면 오늘 칩이 화면 밖일 수 있어 끝으로 데려간다.
  // 날짜 줄을 새로 받을 때는 위의 처음 한 번 로직이 맡으므로 다른 날을 보던 중일 때만 움직인다.
  const viewingPast = isViewingPastDate(bar);
  const viewingToday = bar !== null && !viewingPast;
  const wasViewingPastRef = useRef(viewingPast);
  useEffect(() => {
    if (viewingToday && wasViewingPastRef.current) {
      scrollRef.current?.scrollToEnd({ animated: true });
    }
    wasViewingPastRef.current = viewingPast;
  }, [viewingPast, viewingToday]);

  if (bar === null) {
    return null;
  }
  const chipWidth = Math.min(CHIP_MAX_WIDTH, width / 3);
  // 액세서리 높이는 시스템이 정해 칩이 44보다 낮으니 위아래로 터치 영역을 채운다.
  const slop = Math.max(0, (44 - chipHeight) / 2);
  const selectedBg =
    Platform.OS === "android" && scheme === "light"
      ? colors.bg.layer2.light
      : softBlue.glass.activePill[scheme];

  return (
    <View style={styles.row}>
      <HomeDateMenuButton
        color={softBlue.tab.labelInactive[scheme]}
        disabled={locked}
        onAction={pressHomeMenu}
      />
      <View style={[styles.divider, { backgroundColor: colors.border.default[scheme] }]} />
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityLabel="날짜"
        style={styles.scroller}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        onContentSizeChange={() => {
          if (width > 0 && scrolledForRef.current !== bar.todayKey) {
            scrolledForRef.current = bar.todayKey;
            scrollRef.current?.scrollToEnd({ animated: false });
          }
        }}
      >
        {width > 0 &&
          bar.dates.map((date) => {
            const selected = date.key === bar.selectedKey;
            const today = date.key === bar.todayKey;
            return (
              <Pressable
                key={date.key}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={date.accessibilityLabel}
                disabled={locked}
                hitSlop={{ top: slop, bottom: slop }}
                onPress={() => {
                  if (selected) {
                    return;
                  }
                  triggerHaptic("light");
                  selectHomeDate(date.key);
                }}
                style={[
                  styles.chip,
                  { width: chipWidth, height: chipHeight },
                  selected && { backgroundColor: selectedBg },
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={[
                    styles.label,
                    selected
                      ? { color: softBlue.tab.labelActive[scheme], fontFamily: "PretendardBold" }
                      : today
                        ? { color: colors.brand.primary[scheme], fontFamily: "PretendardBold" }
                        : { color: softBlue.tab.labelInactive[scheme] },
                  ]}
                >
                  {date.label}
                </Text>
              </Pressable>
            );
          })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: "row", alignItems: "center", paddingHorizontal: 4 },
  divider: { width: StyleSheet.hairlineWidth * 2, height: 20, marginHorizontal: 2 },
  scroller: { flex: 1 },
  chip: { borderRadius: 999, alignItems: "center", justifyContent: "center" },
  // 폰트 파일 속 이름이 아니라 app/_layout.tsx의 useFonts 등록 키를 쓴다.
  label: { fontSize: 15, lineHeight: 20, fontFamily: "Pretendard", fontVariant: ["tabular-nums"] },
});
