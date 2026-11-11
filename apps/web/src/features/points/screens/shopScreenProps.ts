import type { AdResult, ChargePack, ChargeResult, EarnToday, ShopData } from "../types";

/**
 * 소품·타이머 배경 화면이 라우트에서 받는 값과 처리기
 *
 * 오늘 받기 정보는 모자람 창의 광고 줄에만 쓰여서 받기 전이면 그 줄을 그리지 않는다.
 * 광고와 충전 처리기는 앱 안이면서 경계가 지원할 때만 넘어온다.
 * `missions`는 포인트 받기 탭이 있는지이며 없으면 모자람 창에 미션 줄을 그리지 않는다.
 */
export type ShopScreenProps = {
  data: ShopData;
  balance: number;
  earn: EarnToday | undefined;
  packs: ChargePack[];
  onBack: () => void;
  missions: boolean;
  onWatchAd?: () => Promise<AdResult>;
  onCharge?: (productId: string) => Promise<ChargeResult>;
};
