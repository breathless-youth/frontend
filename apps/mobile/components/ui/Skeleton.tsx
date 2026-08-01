import { useEffect } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

/**
 * 로딩 자리표시 사각형 — 투명도 펄스. Figma에 로딩 상태 정의가 없어 디자인 토큰
 * 배경색만 쓰는 최소 구현이다(BY-313). 크기·모서리는 호출부가 className으로 정한다.
 *
 * BY-333 리셋으로 삭제됐던 것을 웹뷰 스플래시 스켈레톤용으로 git 히스토리(`24a9278`)에서
 * 그대로 복원했다 — 웹판(`apps/web/src/components/ui/Skeleton.tsx`)이 이 파일의 이식이라
 * 시각 효과가 이미 양쪽에서 검증돼 있다.
 */
export function Skeleton({
  className,
  style,
}: {
  className?: string;
  /**
   * 계산된 치수용(예: 목록에서 행마다 다른 라벨 너비). 원본에는 없던 prop이다 —
   * className만으로는 값을 변수로 넘길 수 없어 자리표시 너비를 배열로 다루지 못한다.
   * 펄스 애니메이션 위에 얹히므로 `opacity`는 넘기지 않는다(덮어쓰면 펄스가 죽는다).
   */
  style?: StyleProp<ViewStyle>;
}) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.4, { duration: 700 }), -1, true);
  }, [opacity]);

  const pulse = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      accessibilityLabel="불러오는 중"
      className={`bg-bg-layer2 dark:bg-bg-layer2-dark ${className ?? ""}`}
      style={[style, pulse]}
    />
  );
}
