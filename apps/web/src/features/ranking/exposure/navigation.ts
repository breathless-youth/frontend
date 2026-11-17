import { useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { isNativeBridgeAvailable, postToNative } from "@/lib/bridge";

import { requestRecordsPage } from "../model/boardMemory";

/**
 * 홈 팝업에서 랭킹 탭으로 넘어가는 자리
 *
 * 셸이 `tab_pressed.via`로 남긴다.
 */
export type HomeRankingVia = "top3_modal";

/** 빠른 이중 탭 무시 구간. 홈 초대 카드(`HomeTabPage`)처럼 탭 전환이 끝나기 전의 재시도만 걸러낸다. */
const TAP_GUARD_MS = 500;

/**
 * 다른 탭 화면에서 랭킹 탭 열기
 *
 * 탭 전환은 셸 탭 바 소유라 앱에서는 셸에 탭 전환만 맡긴다.
 * 웹 라우터로 가면 그 탭 웹뷰 안 문서만 바뀌어 탭 바와 어긋난다.
 * 브라우저 단독 모드는 탭 바가 없어 웹 라우트로 바로 간다.
 *
 * 빠른 이중 탭으로 `navigate-tab`이 두 번 가면 셸이 `tab_pressed`를 두 번 남긴다.
 * 탭을 옮겨도 보낸 문서는 살아 있어 돌아와 다시 누를 수 있어야 하므로 잠깐만 막는다.
 */
export function useOpenRanking(): {
  openBoard: () => void;
  openRecords: (via: HomeRankingVia) => void;
} {
  const navigate = useNavigate();
  const location = useLocation();
  const lastTapAtRef = useRef(0);

  const accept = (now: number) => {
    if (now - lastTapAtRef.current < TAP_GUARD_MS) {
      return false;
    }
    lastTapAtRef.current = now;
    return true;
  };

  return {
    /**
     * 랭킹 탭을 보던 판 그대로 연다(포인트 받기의 메달 카드)
     *
     * 26.47.0 셸이 아는 발신처에 이 자리가 없어 `via`를 싣지 않고, 셸은 `card`로 센다.
     * `card`는 옛 홈 연속 공부 카드가 기록 탭으로 갈 때만 썼으므로 `tab: ranking`과 함께 보면 이 자리다.
     * 브라우저에서는 바꾸기 전 링크처럼 쿼리 없이 간다. 포인트 화면의 `tab`은 랭킹에서 뜻이 없다.
     */
    openBoard() {
      const now = Date.now();
      if (!accept(now)) {
        return;
      }
      if (isNativeBridgeAvailable()) {
        postToNative({ type: "navigate-tab", tab: "ranking", atMs: now });
        return;
      }
      navigate("/ranking");
    },
    /** 모두 보기 요청을 저장소에 적고 랭킹 탭을 연다. 브라우저에서는 쿼리를 이어받는다. */
    openRecords(via) {
      const now = Date.now();
      if (!accept(now)) {
        return;
      }
      if (isNativeBridgeAvailable()) {
        requestRecordsPage();
        postToNative({ type: "navigate-tab", tab: "ranking", via, atMs: now });
        return;
      }
      navigate({ pathname: "/ranking/records", search: location.search });
    },
  };
}
