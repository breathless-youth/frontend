import { useEffect, useState, type CSSProperties } from "react";

/** 그림 판에서 소품이 그려진 자리이며 값은 판 한 변에 대한 비율이다. */
export type ItemBounds = { x: number; y: number; width: number; height: number };

// 1440 판을 160으로 줄여 읽어도 자리 오차는 판의 1% 안쪽이고, 한 장 읽는 데 1ms 남짓이다.
const SAMPLE = 160;
// 가장자리의 옅은 그림자까지 소품으로 치면 자리가 커져서 거의 투명한 점은 뺀다.
const ALPHA_MIN = 16;

const measured = new Map<string, ItemBounds | null>();
const pending = new Map<string, Promise<ItemBounds | null>>();

function scan(image: HTMLImageElement): ItemBounds | null {
  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE;
  canvas.height = SAMPLE;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (context === null) {
    return null;
  }
  context.drawImage(image, 0, 0, SAMPLE, SAMPLE);
  const { data } = context.getImageData(0, 0, SAMPLE, SAMPLE);
  let left = SAMPLE;
  let top = SAMPLE;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < SAMPLE; y += 1) {
    for (let x = 0; x < SAMPLE; x += 1) {
      if (data[(y * SAMPLE + x) * 4 + 3] > ALPHA_MIN) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }
  if (right < 0) {
    return null;
  }
  return {
    x: left / SAMPLE,
    y: top / SAMPLE,
    width: (right + 1 - left) / SAMPLE,
    height: (bottom + 1 - top) / SAMPLE,
  };
}

/**
 * 소품 그림에서 그려진 자리 측정
 *
 * 그림이 웹과 같은 출처라 캔버스로 투명한 부분을 읽을 수 있다.
 * 다른 출처로 옮겨 캔버스가 막히거나 그림을 받지 못하면 null이고, 받는 쪽은 판 전체를 그린다.
 * 한 번 측정한 값은 앱을 끌 때까지 주소마다 기억한다.
 */
export function measureImageBounds(url: string): Promise<ItemBounds | null> {
  const known = measured.get(url);
  if (known !== undefined) {
    return Promise.resolve(known);
  }
  const running = pending.get(url);
  if (running !== undefined) {
    return running;
  }
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  // 테스트의 jsdom처럼 decode가 없는 환경에서도 throw하지 않고 null로 끝나게 한 번 감싼다.
  const job = Promise.resolve()
    .then(() => image.decode())
    .then(() => scan(image))
    .catch(() => null)
    .then((bounds) => {
      measured.set(url, bounds);
      pending.delete(url);
      return bounds;
    });
  pending.set(url, job);
  return job;
}

/** 여러 그림의 자리를 하나로 합치며 하나라도 측정하지 못했으면 null이다. */
export function unionBounds(list: readonly (ItemBounds | null)[]): ItemBounds | null {
  if (list.length === 0 || list.some((bounds) => bounds === null)) {
    return null;
  }
  const boxes = list as readonly ItemBounds[];
  const left = Math.min(...boxes.map((b) => b.x));
  const top = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.width));
  const bottom = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function knownUnion(urls: readonly string[]): ItemBounds | null | undefined {
  const list = urls.map((url) => measured.get(url));
  return list.some((bounds) => bounds === undefined)
    ? undefined
    : unionBounds(list as (ItemBounds | null)[]);
}

/**
 * 그림 여러 장을 겹친 자리
 *
 * 측정하는 동안은 undefined, 측정하지 못했으면 null이다.
 * 이미 측정한 그림은 첫 그리기부터 값이 있어 칸이 깜빡이지 않는다.
 */
export function useItemBounds(urls: readonly string[]): ItemBounds | null | undefined {
  const key = urls.join("\n");
  const [state, setState] = useState(() => ({ key, value: knownUnion(urls) }));
  useEffect(() => {
    let alive = true;
    const list = key === "" ? [] : key.split("\n");
    void Promise.all(list.map(measureImageBounds)).then((all) => {
      if (alive) {
        setState({ key, value: unionBounds(all) });
      }
    });
    return () => {
      alive = false;
    };
  }, [key]);
  return state.key === key ? state.value : knownUnion(urls);
}

function percent(ratio: number) {
  return `${Number((ratio * 100).toFixed(3))}%`;
}

/**
 * 소품만 칸에 크게 보이게 그림 판을 놓을 자리
 *
 * 판을 키우고 밀어서 소품 자리가 칸 가운데에서 칸의 fill만큼 차게 한다.
 * 칸의 가로세로 비율이 1이 아니어도 소품이 칸 밖으로 나가지 않는다.
 * 자리를 모르면 판 전체를 칸에 맞춘다.
 */
export function cutoutFrame(bounds: ItemBounds | null, fill: number, aspect = 1): CSSProperties {
  if (bounds === null) {
    return aspect >= 1
      ? { top: 0, height: "100%", width: percent(1 / aspect), left: percent((1 - 1 / aspect) / 2) }
      : { left: 0, width: "100%", height: percent(aspect), top: percent((1 - aspect) / 2) };
  }
  // 판 한 변을 칸 가로에 대한 비율로 둔다.
  const side = Math.min(fill / bounds.width, fill / (bounds.height * aspect));
  return {
    left: percent(0.5 - (bounds.x + bounds.width / 2) * side),
    top: percent(0.5 - (bounds.y + bounds.height / 2) * side * aspect),
    width: percent(side),
    height: percent(side * aspect),
  };
}
