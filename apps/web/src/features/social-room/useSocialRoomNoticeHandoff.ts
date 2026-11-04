import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import { isNativeBridgeAvailable } from "@/lib/bridge";
import { showToast } from "@/lib/toast";

import { consumeSocialRoomNotice } from "./socialRoomNotice";
import type { SocialRoomNotice } from "./socialRoomNotice";

/**
 * 방이나 공부방에서 밀려나며 남긴 안내를 도착한 탭 화면에서 한 번 띄우기
 *
 * 안내는 1회성이라 소비 결과를 ref에 고정해 StrictMode가 effect를 두 번 돌려도 두 번째 소비가 null로 바뀌지 않는다.
 * 네이티브 셸에서 세션 웹뷰가 `noticeHandoff`로 잠깐 그리는 탭 화면은 곧 진짜 탭 웹뷰로 바뀌어서, 여기서 띄우면 토스트가 전환에 잘려 깜빡인다.
 * 그래서 그때는 소비하지 않고 저장소에 남겨 도착한 탭 웹뷰가 띄우게 한다.
 * 브라우저 단독 모드는 전환이 없어 여기가 곧 도착지다.
 * 자리비움 안내만 확인 창으로 띄우고 입장과 생성 실패 안내는 토스트로 띄운다.
 */
export function useSocialRoomNoticeHandoff(): {
  graceMessage: string | null;
  dismissGrace: () => void;
} {
  const location = useLocation();
  const handoff =
    isNativeBridgeAvailable() &&
    (location.state as { noticeHandoff?: boolean } | null)?.noticeHandoff === true;
  const noticeRef = useRef<SocialRoomNotice | null | undefined>(undefined);
  if (!handoff) {
    if (noticeRef.current == null) {
      noticeRef.current = consumeSocialRoomNotice();
    }
  }
  const [graceMessage, setGraceMessage] = useState<string | null>(null);
  useEffect(() => {
    const notice = noticeRef.current;
    if (notice == null) {
      return;
    }
    if (notice.kind === "grace-end") {
      setGraceMessage(notice.message);
    } else {
      showToast(notice.message);
    }
  }, []);
  return { graceMessage, dismissGrace: () => setGraceMessage(null) };
}
