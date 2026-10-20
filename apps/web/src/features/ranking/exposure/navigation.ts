import { useLocation, useNavigate } from "react-router-dom";

import { isNativeBridgeAvailable, postToNative } from "@/lib/bridge";

import { requestRecordsPage } from "../model/boardMemory";

/**
 * 홈 팝업에서 랭킹 탭으로 넘어가는 자리
 *
 * 셸이 `tab_pressed.via`로 남긴다.
 */
export type HomeRankingVia = "top3_modal";

/**
 * 홈에서 랭킹 탭 열기
 *
 * 탭 전환은 셸 탭 바 소유라 앱에서는 모두 보기 요청을 저장소에 적고 셸에 탭 전환만 맡긴다.
 * 웹 라우터로 가면 홈 탭 웹뷰 안 문서만 바뀌어 탭 바와 어긋난다.
 * 브라우저 단독 모드는 탭 바가 없어 쿼리를 이어받아 웹 라우트로 바로 간다.
 */
export function useOpenRanking(): {
  openRecords: (via: HomeRankingVia) => void;
} {
  const navigate = useNavigate();
  const location = useLocation();

  return {
    openRecords(via) {
      if (isNativeBridgeAvailable()) {
        requestRecordsPage();
        postToNative({ type: "navigate-tab", tab: "ranking", via, atMs: Date.now() });
        return;
      }
      navigate({ pathname: "/ranking/records", search: location.search });
    },
  };
}
