import { Button, Host, Image, Menu } from "@expo/ui/swift-ui";
import {
  accessibilityLabel,
  contentShape,
  disabled as disabledModifier,
  frame,
  shapes,
} from "@expo/ui/swift-ui/modifiers";
import type { HomeMenuAction } from "@focusmakers/types";

/** 홈 날짜 줄의 과목 메뉴 버튼 */
export function HomeDateMenuButton({
  color,
  disabled,
  onAction,
}: {
  color: string;
  disabled: boolean;
  onAction: (action: HomeMenuAction) => void;
}) {
  return (
    <Host matchContents>
      <Menu
        label={<Image systemName="line.3.horizontal" size={20} color={color} />}
        // 아이콘만 그리면 누름 영역이 아이콘 크기라 44pt 칸 전체를 누름 영역으로 넓힌다.
        modifiers={[
          frame({ width: 44, height: 44 }),
          contentShape(shapes.rectangle()),
          accessibilityLabel("과목 메뉴"),
          disabledModifier(disabled),
        ]}
      >
        <Button
          label="과목 순서 변경"
          systemImage="arrow.up.arrow.down"
          onPress={() => onAction("reorder-subjects")}
        />
        <Button label="과목 편집" systemImage="pencil" onPress={() => onAction("edit-subjects")} />
      </Menu>
    </Host>
  );
}
