import { useNavigation } from "expo-router";
import { useLayoutEffect } from "react";

import { publishStartKey } from "../../lib/startTab";

/**
 * 탭 바 오른쪽 재생 버튼의 자리표시 라우트
 *
 * 트리거가 늘 `disabled`라 이 화면은 선택되지 않는다.
 * 누름은 `tabPress`의 막힌 누름으로만 받는다.
 * iOS 27이 이 탭을 떼어 그리려면(`prominentScreenKey`) 라우트 key가 필요해서 마운트 때 알린다.
 * 홈으로 돌아오며 라우트가 새 key로 다시 들어오면 첫 커밋에 옛 key가 넘어가지 않도록 레이아웃 효과로 알린다.
 */
export default function StartTabPlaceholder() {
  const navigation = useNavigation();
  useLayoutEffect(() => {
    const key = navigation.getState()?.routes.find((route) => route.name === "start")?.key;
    if (key !== undefined) publishStartKey(key);
  }, [navigation]);
  return null;
}
