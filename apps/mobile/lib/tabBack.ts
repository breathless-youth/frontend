/**
 * 보이는 탭 웹뷰가 시스템 뒤로 가기를 먼저 받는 통로
 *
 * 탭 첫 화면이 아닌 곳에서 누른 Android 뒤로 가기는 탭을 떠나지 않고 그 웹뷰의 기록에서 한 칸 돌아가야 한다.
 * 발신부(`app/(tabs)/_layout.tsx`의 BackHandler)와 수신부(`RemoteWebViewHost`)가 React 트리에서 조상과 자손이 아니라서 `tabReset`과 같은 모듈 스코프 통로를 쓴다.
 * 받을 웹뷰는 지금 보이는 하나라서 마지막에 붙은 처리기만 부른다.
 */

/** 웹뷰가 뒤로 가기를 처리했으면 true를 돌려준다. */
type TabBackHandler = () => boolean;

const handlers: TabBackHandler[] = [];

/**
 * 뒤로 가기 처리기 붙이기
 *
 * 반환값을 부르면 떼어진다.
 * 웹뷰 호스트는 보이는 동안에만 붙인다.
 */
export function attachTabBackHandler(handler: TabBackHandler): () => void {
  handlers.push(handler);
  return () => {
    const index = handlers.lastIndexOf(handler);
    if (index !== -1) {
      handlers.splice(index, 1);
    }
  };
}

/** 보이는 탭 웹뷰에 뒤로 가기를 넘기고 그 웹뷰가 처리했는지 돌려준다. */
export function handleTabBack(): boolean {
  return handlers[handlers.length - 1]?.() ?? false;
}
