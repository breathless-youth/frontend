import type { StorePrice } from "../../model/useStorePrices";

/**
 * 스토어 결제 상품 칸의 가격 자리
 *
 * 포인트 가격 줄과 같은 자리에 두고 글자 모양은 감싼 줄을 따른다.
 * 받는 동안의 자리 표시는 줄 높이를 차지하는 빈칸이라 가격이 와도 칸 높이가 그대로다.
 * 가격을 끝내 모르면 결제 상품이라는 것만 fallback으로 보인다.
 */
export function StorePriceText({ price, fallback }: { price: StorePrice; fallback: string }) {
  if (price.status === "pending") {
    return (
      <span
        aria-hidden="true"
        data-slot="store-price-pending"
        className="inline-block w-10 rounded-sm bg-bg-layer-2 motion-safe:animate-pulse"
      >
        {" "}
      </span>
    );
  }
  return price.status === "known" ? price.label : fallback;
}
