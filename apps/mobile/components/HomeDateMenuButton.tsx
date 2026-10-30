import { DropdownMenu, DropdownMenuItem, Host, RNHostView, Text } from "@expo/ui/jetpack-compose";
import type { HomeMenuAction } from "@focusmakers/types";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

const MENU_ITEMS: { action: HomeMenuAction; label: string }[] = [
  { action: "reorder-subjects", label: "과목 순서 변경" },
  { action: "edit-subjects", label: "과목 편집" },
];

/**
 * 홈 날짜 줄의 과목 메뉴 버튼
 *
 * iOS는 같은 이름의 `.ios.tsx`가 시스템 메뉴를 쓴다.
 */
export function HomeDateMenuButton({
  color,
  disabled,
  onAction,
}: {
  color: string;
  disabled: boolean;
  onAction: (action: HomeMenuAction) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.slot}>
      {/* Compose 안에 둔 RN 버튼은 Android가 터치를 Compose 조상 크기로 잘라 아이콘만 눌렸다. */}
      {/* 그래서 Compose는 메뉴가 붙을 자리만 그리고, 누름은 위에 겹친 RN 버튼이 받는다. */}
      <View pointerEvents="none">
        <Host matchContents>
          <DropdownMenu expanded={open} onDismissRequest={() => setOpen(false)}>
            <DropdownMenu.Trigger>
              <RNHostView matchContents>
                <View style={styles.slot}>
                  <HamburgerIcon color={color} />
                </View>
              </RNHostView>
            </DropdownMenu.Trigger>
            <DropdownMenu.Items>
              {MENU_ITEMS.map(({ action, label }) => (
                <DropdownMenuItem
                  key={action}
                  onClick={() => {
                    setOpen(false);
                    onAction(action);
                  }}
                >
                  <DropdownMenuItem.Text>
                    <Text>{label}</Text>
                  </DropdownMenuItem.Text>
                </DropdownMenuItem>
              ))}
            </DropdownMenu.Items>
          </DropdownMenu>
        </Host>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="과목 메뉴"
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={styles.hit}
      />
    </View>
  );
}

function HamburgerIcon({ color }: { color: string }) {
  const line = { width: 18, height: 2, borderRadius: 1, backgroundColor: color };
  return (
    <View style={{ gap: 4 }}>
      <View style={line} />
      <View style={line} />
      <View style={line} />
    </View>
  );
}

// 보이는 칸은 44로 두어 날짜 줄 배치를 그대로 두고, 누름 영역만 Android 권장 48로 사방 2씩 넓힌다.
const styles = StyleSheet.create({
  slot: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  hit: { position: "absolute", top: -2, left: -2, width: 48, height: 48 },
});
