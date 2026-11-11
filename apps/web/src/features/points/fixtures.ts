import type {
  ChargePack,
  EarnToday,
  ItemAcquire,
  Mascot,
  MascotId,
  PointsHistoryEntry,
  SessionReward,
  ShopItem,
  ShopItemKind,
} from "./types";
import type { PointsScene } from "./pointsScenes";

export { POINTS_SCENES, type PointsScene } from "./pointsScenes";

export type PointsFixture = {
  balance: number;
  items: ShopItem[];
  mascots: Mascot[];
  totalFocusSec: number;
  history: PointsHistoryEntry[];
  earn: EarnToday;
  packs: ChargePack[];
  sessionReward: SessionReward | null;
};

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY_MS = 24 * HOUR * 1000;

/** 해금 순서와 기준 누적 순공(시간) */
const MASCOT_UNLOCK_HOURS: [MascotId, number][] = [
  ["book", 0],
  ["planner", 5],
  ["stopwatch", 15],
  ["lamp", 30],
  ["pencil", 60],
  ["padlock", 100],
  ["camcorder", 150],
];

const price = (value: number): ItemAcquire => ({ type: "price", price: value });
const streak = (current: number, target: number): ItemAcquire => ({
  type: "reward",
  condition: "streakDays",
  current,
  target,
});

function shopItem(
  id: string,
  kind: ShopItemKind,
  name: string,
  acquire: ItemAcquire,
  extra: Partial<ShopItem> = {},
): ShopItem {
  return { id, kind, name, imageUrl: null, acquire, owned: false, inUse: false, ...extra };
}

function buildItems(totalFocusHours: number): ShopItem[] {
  const accessory = (
    mascotId: MascotId,
    key: string,
    name: string,
    acquire: ItemAcquire,
    extra: Partial<ShopItem> = {},
  ) =>
    shopItem(`acc-${mascotId}-${key}`, "accessory", name, acquire, {
      mascotId,
      slot: "head",
      ...extra,
    });
  return [
    accessory("stopwatch", "crown", "왕관", price(600)),
    accessory("stopwatch", "ribbon", "단추 리본", price(200), { slot: "body", owned: true }),
    accessory("stopwatch", "raincoat", "우비 모자", price(300)),
    accessory("stopwatch", "sprout", "새싹", price(120)),
    accessory("stopwatch", "gradcap", "학사모", {
      type: "reward",
      condition: "focusHours",
      current: Math.floor(totalFocusHours),
      target: 100,
    }),
    accessory("stopwatch", "partyhat", "고깔모자", price(150)),
    accessory("stopwatch", "headphones", "헤드폰", price(450)),
    accessory("stopwatch", "glasses", "동그란 안경", price(250), { slot: "face" }),
    accessory("book", "bookmark", "책갈피 핀", price(150)),
    accessory("book", "scarf", "목도리", price(300), { slot: "body" }),
    accessory("planner", "pen", "만년필", price(200)),
    accessory("lamp", "shade", "꽃무늬 갓", price(400)),
    accessory("lamp", "bulb", "전구 모자", price(250)),
    shopItem("bg-dawn-library", "timerBackground", "새벽 도서관", price(400), {
      category: "studySpace",
    }),
    shopItem("bg-rainy-window", "timerBackground", "비 오는 창가", price(400), {
      category: "nature",
    }),
    shopItem("bg-sunset-cafe", "timerBackground", "노을 카페", price(300), {
      category: "studySpace",
    }),
    shopItem("bg-forest-morning", "timerBackground", "숲속 아침", price(350), {
      category: "nature",
      owned: true,
    }),
    shopItem("bg-seaside", "timerBackground", "바닷가", price(350), { category: "nature" }),
    shopItem("bg-campfire", "timerBackground", "모닥불", streak(18, 30), { category: "season" }),
    shopItem("bg-galaxy-lake", "timerBackground", "은하수 호수", price(400), {
      category: "nightSky",
    }),
    shopItem("bg-snowy-mountain", "timerBackground", "눈 덮인 산", price(350), {
      category: "season",
    }),
  ];
}

function buildMascots(
  totalFocusSec: number,
  selected: MascotId,
  newlyUnlocked: MascotId[],
): Mascot[] {
  return MASCOT_UNLOCK_HOURS.map(([id, hours]) => ({
    id,
    unlockFocusSec: hours * HOUR,
    unlocked: totalFocusSec >= hours * HOUR,
    selected: id === selected,
    newlyUnlocked: newlyUnlocked.includes(id),
  }));
}

function buildEarn(scene: PointsScene): EarnToday {
  const allDone = scene === "allDone";
  return {
    earned: allDone ? 200 : 80,
    dailyMax: 400,
    study: {
      focusSec: allDone ? 2 * HOUR + 10 * MINUTE : HOUR + 24 * MINUTE,
      capSec: 12 * HOUR,
      unitSec: 30 * MINUTE,
      pointsPerUnit: 10,
    },
    attendance: { reward: 10, claimed: true },
    dailyGoal: {
      reward: 50,
      achieved: allDone,
      claimed: allDone,
      remainingSec: allDone ? 0 : 36 * MINUTE,
    },
    ad: { reward: 30, watched: allDone ? 3 : 0, limit: 3 },
    medals:
      allDone || scene === "noMedal"
        ? []
        : [
            { rank: 1, period: "DAILY", reward: 100 },
            { rank: 3, period: "WEEKLY", reward: 30 },
          ],
    medalRates: { gold: 100, silver: 60, bronze: 30 },
  };
}

function buildHistory(now: number): PointsHistoryEntry[] {
  const today = now - 10 * MINUTE * 1000;
  const entry = (
    id: string,
    daysAgo: number,
    amount: number,
    reason: PointsHistoryEntry["reason"],
    itemName?: string,
  ) => ({
    id,
    atMs: today - daysAgo * DAY_MS - Number(id.slice(1)) * MINUTE * 1000,
    amount,
    reason,
    ...(itemName === undefined ? {} : { itemName }),
  });
  return [
    entry("h1", 0, 10, "attendance"),
    entry("h2", 0, -200, "purchase", "단추 리본"),
    entry("h3", 0, 1300, "charge"),
    entry("h4", 2, 100, "medal"),
    entry("h5", 2, 50, "dailyGoal"),
    entry("h6", 2, 30, "ad"),
    entry("h7", 2, 40, "study"),
    entry("h8", 3, -350, "purchase", "숲속 아침"),
  ];
}

/**
 * 개발용 화면 모음과 테스트가 함께 쓰는 장면별 고정 데이터
 *
 * 숫자는 시안을 따른다.
 * 기록 시각은 받은 지금에서 거꾸로 세어 날짜 묶음이 시안처럼 오늘과 지난날로 나뉜다.
 */
export function buildPointsFixture(scene: PointsScene, now: number = Date.now()): PointsFixture {
  const totalFocusSec =
    scene === "allCollected"
      ? 152 * HOUR + 10 * MINUTE
      : scene === "firstDay"
        ? 2 * HOUR + 12 * MINUTE
        : 25 * HOUR + 48 * MINUTE;
  const fresh = scene === "empty" || scene === "firstDay";
  const items = buildItems(totalFocusSec / HOUR);
  return {
    balance: fresh ? 0 : 1240,
    items: fresh
      ? items.map((it) =>
          it.acquire.type === "price" && it.acquire.price === 0
            ? it
            : { ...it, owned: false, inUse: false },
        )
      : items,
    mascots: buildMascots(
      totalFocusSec,
      scene === "firstDay" || scene === "newMascot" ? "book" : "stopwatch",
      scene === "newMascot" ? ["planner", "stopwatch"] : [],
    ),
    totalFocusSec,
    history: fresh ? [] : buildHistory(now),
    earn: buildEarn(scene),
    packs: [
      { productId: "points_500", points: 500, bonus: 0, priceLabel: null, popular: false },
      { productId: "points_1200", points: 1200, bonus: 100, priceLabel: null, popular: true },
      { productId: "points_3000", points: 3000, bonus: 400, priceLabel: null, popular: false },
    ],
    sessionReward: {
      earned: 20,
      todayFocusSec: 2 * HOUR + 10 * MINUTE,
      capSec: 12 * HOUR,
      nextMascot:
        scene === "allCollected"
          ? null
          : {
              id: "lamp",
              remainingSec: 2 * HOUR + 48 * MINUTE,
              progress: (27 * HOUR + 12 * MINUTE) / (30 * HOUR),
            },
    },
  };
}
