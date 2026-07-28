import { useEffect } from "react";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

/**
 * 로딩 자리표시 사각형 — 투명도 펄스. Figma에 로딩 상태 정의가 없어 디자인 토큰
 * 배경색만 쓰는 최소 구현이다(BY-313). 크기·모서리는 호출부가 className으로 정한다.
 */
export function Skeleton({ className }: { className?: string }) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.4, { duration: 700 }), -1, true);
  }, [opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      accessibilityLabel="불러오는 중"
      className={`bg-bg-layer2 dark:bg-bg-layer2-dark ${className ?? ""}`}
      style={style}
    />
  );
}
