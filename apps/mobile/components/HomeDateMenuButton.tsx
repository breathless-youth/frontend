import { DropdownMenu, DropdownMenuItem, Host, RNHostView, Text } from "@expo/ui/jetpack-compose";
import type { HomeMenuAction } from "@focusmakers/types";
import { useState } from "react";
import { Pressable, View } from "react-native";

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
    <Host matchContents>
      <DropdownMenu expanded={open} onDismissRequest={() => setOpen(false)}>
        <DropdownMenu.Trigger>
          <RNHostView matchContents>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="과목 메뉴"
              disabled={disabled}
              onPress={() => setOpen(true)}
              style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
            >
              <HamburgerIcon color={color} />
            </Pressable>
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
