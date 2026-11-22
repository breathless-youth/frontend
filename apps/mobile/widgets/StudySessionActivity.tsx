import { HStack, Image, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import {
  clipShape,
  font,
  foregroundStyle,
  frame,
  monospacedDigit,
  padding,
  resizable,
} from "@expo/ui/swift-ui/modifiers";
import { createLiveActivity, type LiveActivityEnvironment } from "expo-widgets";

import type { StudySessionActivityProps } from "../lib/liveActivityModel";

/**
 * 잠금화면과 Dynamic Island의 공부 표시
 *
 * 이 함수는 문자열로 바뀌어 위젯 확장 안에서 돌아서 바깥 상수와 함수를 참조할 수 없다.
 * 시간은 OS가 직접 세므로 앱이 백그라운드에서 깨어 있지 않아도 흐른다.
 * 끝나는 시각이 지나면 OS가 isStale로 다시 그리고, 이때는 시간 없이 제목과 사유만 보인다.
 */
function StudySessionActivityLayout(
  props: StudySessionActivityProps,
  environment: LiveActivityEnvironment,
) {
  "widget";
  const ended = environment.isStale === true;
  const lower = new Date(props.startedAtMs);
  // 위 끝에 닿으면 세기가 멈추므로 하루 뒤로 둔다.
  const upper = new Date(props.startedAtMs + 24 * 60 * 60 * 1000);
  // 딴짓 상태는 일시정지 표시 없이 시계만 멈추므로 멈춤은 pausedAtMs로만 판단한다.
  const pauseTime = props.pausedAtMs !== null ? new Date(props.pausedAtMs) : undefined;
  const secondary = foregroundStyle({ type: "hierarchical", style: "secondary" });
  const empty = <Text> </Text>;
  // 섬의 펼친 화면은 좁아 두 줄 문구가 잘리므로 첫 줄만 쓴다.
  const islandStatusText = props.statusText.split("\n")[0];

  const icon = (size: number) =>
    props.iconUri !== null ? (
      <Image
        uiImage={props.iconUri}
        modifiers={[
          resizable(),
          frame({ width: size, height: size }),
          clipShape("roundedRectangle", size / 4.5),
        ]}
      />
    ) : null;
  const pauseMark = (size: number) =>
    props.paused ? <Image systemName="pause.fill" size={size} /> : null;
  const time = (size: number) => (
    <Text
      timerInterval={{ lower, upper }}
      countsDown={false}
      pauseTime={pauseTime}
      modifiers={[font({ size, weight: "semibold" }), monospacedDigit()]}
    />
  );
  const timeRow = (
    <HStack spacing={6}>
      {pauseMark(18)}
      {time(34)}
    </HStack>
  );
  const endedText = (
    <VStack alignment="leading" spacing={2}>
      <Text modifiers={[font({ textStyle: "headline" })]}>{props.endedTitle}</Text>
      <Text modifiers={[font({ textStyle: "footnote" }), secondary]}>{props.endedBody}</Text>
    </VStack>
  );
  const sessionText =
    props.subject !== null ? (
      <VStack alignment="leading" spacing={2}>
        <Text modifiers={[font({ textStyle: "subheadline", weight: "semibold" })]}>
          {props.subject}
        </Text>
        {timeRow}
        <Text modifiers={[font({ textStyle: "footnote" }), secondary]}>{props.statusText}</Text>
      </VStack>
    ) : (
      <VStack alignment="leading" spacing={2}>
        <Text modifiers={[font({ textStyle: "subheadline", weight: "semibold" })]}>
          {props.statusText}
        </Text>
        {timeRow}
      </VStack>
    );

  let minimal = icon(22) ?? empty;
  if (props.paused && !ended) {
    minimal = <Image systemName="pause.fill" size={12} />;
  }

  return {
    banner: (
      <HStack spacing={12} modifiers={[padding({ all: 16 })]}>
        {icon(52)}
        {ended ? endedText : sessionText}
        <Spacer />
      </HStack>
    ),
    compactLeading: (
      <HStack spacing={4}>
        {icon(22)}
        {ended ? null : pauseMark(11)}
      </HStack>
    ),
    compactTrailing: ended ? empty : time(14),
    minimal,
    expandedLeading: (
      <HStack spacing={8}>
        {icon(26)}
        {ended || props.subject === null ? null : <Text>{props.subject}</Text>}
      </HStack>
    ),
    expandedBottom: ended ? (
      endedText
    ) : (
      <VStack alignment="leading" spacing={2}>
        {timeRow}
        <Text modifiers={[font({ textStyle: "footnote" }), secondary]}>{islandStatusText}</Text>
      </VStack>
    ),
  };
}

export default createLiveActivity<StudySessionActivityProps>(
  "StudySessionActivity",
  StudySessionActivityLayout,
);
