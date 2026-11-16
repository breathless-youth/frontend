import coin from "@/assets/points/coin.png";

/** 포인트 코인 그림이며 옆의 숫자가 뜻을 전해 낭독기에서는 숨긴다. */
export function CoinIcon({ size }: { size: number }) {
  return (
    <img
      src={coin}
      alt=""
      aria-hidden
      draggable={false}
      className="shrink-0"
      style={{ width: size, height: size }}
    />
  );
}
