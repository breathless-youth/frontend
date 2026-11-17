import pack1 from "@/assets/points/pack-1.png";
import pack2 from "@/assets/points/pack-2.png";
import pack3 from "@/assets/points/pack-3.png";

const PACK_IMAGES = [pack1, pack2, pack3];

/** 충전 묶음 순서에 맞는 그림이며 묶음이 셋보다 많으면 마지막 그림을 되풀이한다. */
export function packImage(index: number): string {
  return PACK_IMAGES[Math.min(index, PACK_IMAGES.length - 1)];
}
