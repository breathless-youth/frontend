import { useEffect, useState, type CSSProperties } from "react";

/** 그림 판에서 소품이 그려진 자리이며 값은 판 한 변에 대한 비율이다. */
export type ItemBounds = { x: number; y: number; width: number; height: number };

// 1440 판을 160으로 줄여 읽어도 자리 오차는 판의 1% 안쪽이고, 한 장 읽는 데 1ms 남짓이다.
const SAMPLE = 160;
// 가장자리의 옅은 그림자까지 소품으로 치면 자리가 커져서 거의 투명한 점은 뺀다.
const ALPHA_MIN = 16;

// 측정 방식이 바뀌어 남은 값을 못 믿게 되면 키를 올린다.
const STORAGE_KEY = "points.itemBounds.v1";
// 지금 소품 그림이 약 420장이라 두 배 남짓 잡았다. 다 차도 저장소를 110KB 남짓 쓴다.
const STORED_MAX = 1000;

const measured = new Map<string, ItemBounds | null>();
const pending = new Map<string, Promise<ItemBounds | null>>();
// 앱을 켠 뒤 처음 쓸 때 저장소에서 한 번 읽고, 남긴 순서(오래된 것이 앞)를 지킨다.
let stored: Map<string, ItemBounds> | null = null;

function isRatio(value: unknown): value is number {
  return typeof value === "number" && value >= 0 && value <= 1;
}

/** 저장 형태 한 줄을 자리로 되살리며, 판 밖이거나 크기가 없으면 null이다. */
function parseStored(entry: unknown): [string, ItemBounds] | null {
  if (!Array.isArray(entry) || entry.length !== 5) {
    return null;
  }
  const [url, x, y, width, height] = entry as unknown[];
  if (typeof url !== "string" || ![x, y, width, height].every(isRatio)) {
    return null;
  }
  const bounds = { x, y, width, height } as ItemBounds;
  const inside = bounds.x + bounds.width <= 1 && bounds.y + bounds.height <= 1;
  return inside && bounds.width > 0 && bounds.height > 0 ? [url, bounds] : null;
}

function storedBounds(): Map<string, ItemBounds> {
  if (stored !== null) {
    return stored;
  }
  stored = new Map();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list: unknown = raw === null ? [] : JSON.parse(raw);
    for (const entry of Array.isArray(list) ? list : []) {
      const parsed = parseStored(entry);
      if (parsed !== null) {
        stored.set(...parsed);
      }
    }
  } catch {
    // 읽지 못하면 남은 값이 없는 것처럼 처음부터 잰다.
  }
  return stored;
}

/** 측정한 자리를 앱을 다시 켜도 쓰게 남기며, 상한을 넘으면 오래 전에 잰 것부터 버린다. */
function remember(url: string, bounds: ItemBounds) {
  const map = storedBounds();
  map.delete(url);
  map.set(url, bounds);
  for (const oldest of map.keys()) {
    if (map.size <= STORED_MAX) {
      break;
    }
    map.delete(oldest);
  }
  const list = [...map].map(([key, b]) => [key, b.x, b.y, b.width, b.height]);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // 저장소가 막혔거나 가득 차면 이번 실행 동안만 기억한다.
  }
}

/** 이번 실행에서 잰 값, 없으면 저장소에 남은 값이며 둘 다 없으면 undefined다. */
function knownBounds(url: string): ItemBounds | null | undefined {
  const value = measured.get(url);
  return value !== undefined ? value : storedBounds().get(url);
}

/** 앱을 다시 켠 것처럼 메모리의 측정값을 비운다. 저장소는 그대로다. */
export function __resetItemBoundsForTests() {
  measured.clear();
  pending.clear();
  stored = null;
}

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
 * 캔버스로 읽을 그림 주소
 *
 * 다른 출처의 그림을 그린 캔버스는 막혀서 투명한 부분을 읽지 못한다.
 * 로컬 개발 앱처럼 웹과 그림 서버의 출처가 다를 때를 위해 소품 그림(/avatars/)은 웹과 같은 출처의 같은 경로로 읽는다.
 * 로컬 개발 서버는 이 경로를 그림 서버로 넘겨 주고, 운영과 web-dev 배포는 처음부터 같은 출처라 주소가 그대로다.
 */
function readableUrl(url: string): string {
  const { origin } = window.location;
  let parsed: URL;
  try {
    parsed = new URL(url, origin);
  } catch {
    return url;
  }
  if (parsed.origin === origin || !parsed.pathname.startsWith("/avatars/")) {
    return url;
  }
  return `${origin}${parsed.pathname}${parsed.search}`;
}

/**
 * 소품 그림에서 그려진 자리 측정
 *
 * 그림을 웹과 같은 출처로 읽어 캔버스로 투명한 부분을 본다.
 * 그래도 캔버스가 막히거나 그림을 받지 못하면 null이고, 받는 쪽은 판 전체를 그린다.
 * 화면에 보이는 그림 주소는 바꾸지 않고, 측정한 값은 받은 주소마다 기억한다.
 * 잰 자리는 저장소에도 남겨 앱을 다시 켜도 그림을 다시 읽지 않는다. 그림이 바뀌면 주소가 바뀌어 새로 잰다.
 * 측정하지 못한 null은 이번 실행 동안만 기억해 다음에 켜면 다시 잰다.
 */
export function measureImageBounds(url: string): Promise<ItemBounds | null> {
  const known = knownBounds(url);
  if (known !== undefined) {
    return Promise.resolve(known);
  }
  const running = pending.get(url);
  if (running !== undefined) {
    return running;
  }
  const image = new Image();
  image.decoding = "async";
  image.src = readableUrl(url);
  // 테스트의 jsdom처럼 decode가 없는 환경에서도 throw하지 않고 null로 끝나게 한 번 감싼다.
  const job = Promise.resolve()
    .then(() => image.decode())
    .then(() => scan(image))
    .catch(() => null)
    .then((bounds) => {
      measured.set(url, bounds);
      pending.delete(url);
      if (bounds !== null) {
        remember(url, bounds);
      }
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
  const list = urls.map(knownBounds);
  return list.some((bounds) => bounds === undefined)
    ? undefined
    : unionBounds(list as (ItemBounds | null)[]);
}

/**
 * 그림 여러 장을 겹친 자리
 *
 * 측정하는 동안은 undefined, 측정하지 못했으면 null이다.
 * 이미 측정했거나 저장소에 남은 그림은 첫 그리기부터 값이 있어 칸이 깜빡이지 않는다.
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
