import { useEffect, useRef } from "react";

const HISTORY_KEY = "sheetBack";

let nextId = 1;
const openIds = new Set<number>();
let skipperInstalled = false;

function currentId(): number | undefined {
  return (window.history.state as { [HISTORY_KEY]?: number } | null)?.[HISTORY_KEY];
}

/**
 * 주인이 없는 항목에 도착하면 한 칸 더 되돌린다.
 *
 * 창을 닫자마자 다른 화면으로 넘어가면 쌓아 둔 항목을 걷지 못하고 그 화면 아래에 남는다.
 * 돌아오는 길에 그 항목에서 멈추면 뒤로 가기가 한 번 헛돌아서 건너뛴다.
 */
function installStaleSkipper() {
  if (skipperInstalled) {
    return;
  }
  skipperInstalled = true;
  window.addEventListener("popstate", () => {
    const id = currentId();
    if (id !== undefined && !openIds.has(id)) {
      window.history.back();
    }
  });
}

/**
 * 뒤로 가기로 닫히는 창
 *
 * 앱의 Android 뒤로 가기와 가장자리 스와이프는 웹 기록을 한 칸 되돌리는데, 창은 기록에 없어서 창 대신 화면이 뒤로 갔다.
 * 열릴 때 같은 주소로 항목을 하나 쌓아 두고, 그 항목을 떠나는 뒤로 가기가 오면 화면은 그대로 둔 채 닫기만 부른다.
 * 화면에서 닫았으면 쌓아 둔 항목을 걷는다.
 * 닫자마자 다른 화면으로 넘어가는 버튼이 있어서 한 박자 뒤에 내 항목이 맨 위일 때만 걷고, 못 걷은 항목은 돌아올 때 건너뛴다.
 */
export function useBackDismiss(open: boolean, onClose: () => void): void {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) {
      return;
    }
    installStaleSkipper();
    const id = nextId++;
    openIds.add(id);
    // 라우터가 기록에 넣어 둔 값은 그대로 두어야 같은 화면으로 읽힌다.
    window.history.pushState({ ...(window.history.state ?? {}), [HISTORY_KEY]: id }, "");
    let leftByBack = false;
    const handlePopState = () => {
      // 내 항목으로 돌아온 것은 위에 열렸던 다른 창이 닫힌 것이다.
      if (currentId() === id) {
        return;
      }
      leftByBack = true;
      onCloseRef.current();
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      openIds.delete(id);
      if (leftByBack) {
        return;
      }
      window.setTimeout(() => {
        if (currentId() === id) {
          window.history.back();
        }
      }, 0);
    };
  }, [open]);
}
