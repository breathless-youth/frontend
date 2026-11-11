import type { ShopData, ShopItemKind } from "../types";

/** 꾸미기 상점 탭이며 다음 작업에서 채운다. */
export function ShopTab(_props: {
  data: ShopData;
  balance: number;
  onOpen: (kind: ShopItemKind) => void;
  onOpenMascots: () => void;
}) {
  return null;
}
