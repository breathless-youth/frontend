import {
  RANKING_TYPES,
  TIME_SLOTS,
  type RankingPeriod,
  type RankingType,
  type TimeSlot,
} from "@focusmakers/types";

import {
  DEFAULT_HALL_BOARD,
  DEFAULT_RANKING_BOARD,
  isHallType,
  modeOf,
  periodsOf,
  sameSelection,
  selectPeriod,
  selectType,
  slotOf,
  type BoardMode,
  type BoardSelection,
} from "./board";

const STORAGE_KEY = "ranking.board.v1";

export interface BoardMemory {
  active: BoardMode;
  ranking: BoardSelection;
  hall: BoardSelection;
}

export const DEFAULT_BOARD_MEMORY: BoardMemory = {
  active: "ranking",
  ranking: DEFAULT_RANKING_BOARD,
  hall: DEFAULT_HALL_BOARD,
};

export interface BoardMemoryStore {
  read(): string | null;
  write(raw: string): void;
}

export const localStorageBoardMemoryStore: BoardMemoryStore = {
  read: () => localStorage.getItem(STORAGE_KEY),
  write: (raw) => localStorage.setItem(STORAGE_KEY, raw),
};

let store: BoardMemoryStore = localStorageBoardMemoryStore;

/**
 * 테스트용 메모리 저장소
 *
 * `raw`로 마지막으로 적힌 값을 볼 수 있다.
 */
export function createMemoryBoardMemoryStore(
  initial: string | null = null,
): BoardMemoryStore & { raw: string | null } {
  const memory = {
    raw: initial,
    read: () => memory.raw,
    write: (raw: string) => {
      memory.raw = raw;
    },
  };
  return memory;
}

export function setBoardMemoryStore(next: BoardMemoryStore): void {
  store = next;
}

export function resetBoardMemoryStore(): void {
  store = localStorageBoardMemoryStore;
}

export function activeSelection(memory: BoardMemory): BoardSelection {
  return memory.active === "hall" ? memory.hall : memory.ranking;
}

export function withSelection(memory: BoardMemory, selection: BoardSelection): BoardMemory {
  return modeOf(selection) === "hall"
    ? { ...memory, active: "hall", hall: selection }
    : { ...memory, active: "ranking", ranking: selection };
}

/**
 * 저장된 판 되살리기
 *
 * 저장 형태에서 판 하나를 되살린다.
 * 그 쪽에 맞지 않거나 없는 조합이면 null이다.
 */
function parseSelection(raw: unknown, mode: BoardMode): BoardSelection | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const { type, period } = raw as Record<string, unknown>;
  if (!(RANKING_TYPES as readonly unknown[]).includes(type)) {
    return null;
  }
  const rankingType = type as RankingType;
  if (isHallType(rankingType) !== (mode === "hall")) {
    return null;
  }
  if (isHallType(rankingType)) {
    return { type: rankingType };
  }
  if (!periodsOf(rankingType).some((allowed) => allowed === period)) {
    return null;
  }
  return selectPeriod(selectType(DEFAULT_RANKING_BOARD, rankingType), period as RankingPeriod);
}

function serialize(memory: BoardMemory, requestedSlot: TimeSlot | null = null) {
  const strip = (selection: BoardSelection) =>
    "period" in selection
      ? { type: selection.type, period: selection.period }
      : { type: selection.type };
  return JSON.stringify({
    active: memory.active,
    ranking: strip(memory.ranking),
    hall: strip(memory.hall),
    ...(requestedSlot === null ? {} : { requestedSlot }),
  });
}

function save(raw: string): void {
  try {
    store.write(raw);
  } catch (error) {
    console.warn("[ranking] 마지막 판을 저장하지 못했다", error);
  }
}

/**
 * 마지막 판 읽기
 *
 * 다른 화면이 넘겨준 구간(`requestedSlot`)이 있으면 그 구간으로 연다.
 * 넘겨준 구간은 랭킹 탭이 판을 다시 적을 때(`writeBoardMemory`) 지워진다.
 * 읽기는 저장소를 바꾸지 않아 StrictMode가 초기화를 두 번 불러도 같은 값이 나온다.
 * 그 밖의 구간은 적지 않으므로 시간대 판은 지금 구간으로 열린다.
 */
export function readBoardMemory(): BoardMemory {
  let raw: string | null;
  try {
    raw = store.read();
  } catch (error) {
    console.warn("[ranking] 마지막 판을 읽지 못해 기본 판으로 연다", error);
    return DEFAULT_BOARD_MEMORY;
  }
  if (raw === null) {
    return DEFAULT_BOARD_MEMORY;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_BOARD_MEMORY;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return DEFAULT_BOARD_MEMORY;
  }
  const record = parsed as Record<string, unknown>;
  const ranking = parseSelection(record.ranking, "ranking") ?? DEFAULT_RANKING_BOARD;
  const requested = (TIME_SLOTS as readonly unknown[]).includes(record.requestedSlot)
    ? (record.requestedSlot as TimeSlot)
    : null;
  const memory: BoardMemory = {
    active: record.active === "hall" ? "hall" : "ranking",
    ranking:
      requested !== null && ranking.type === "TIME_SLOT"
        ? { ...ranking, slot: requested }
        : ranking,
    hall: parseSelection(record.hall, "hall") ?? DEFAULT_HALL_BOARD,
  };
  return memory;
}

export function writeBoardMemory(memory: BoardMemory): void {
  save(serialize(memory));
}

/**
 * 다른 화면의 판 열기 요청
 *
 * 다른 화면에서 랭킹 탭의 특정 판을 열게 적는다.
 * 탭 전환은 호출부가 한다.
 */
export function requestBoard(selection: BoardSelection): void {
  save(serialize(withSelection(readBoardMemory(), selection), slotOf(selection)));
}

/**
 * 포커스 복귀 시 기억 병합
 *
 * 포커스를 되찾았을 때 저장된 기억을 반영한다.
 * 저장된 판에 구간이 없고 지금과 같은 판이면 지금 고른 구간을 그대로 둔다.
 * 바뀐 게 없으면 같은 객체를 돌려줘 다시 그리지 않는다.
 */
export function mergeOnFocus(current: BoardMemory, stored: BoardMemory): BoardMemory {
  const keepSlot =
    stored.ranking.type === "TIME_SLOT" &&
    current.ranking.type === "TIME_SLOT" &&
    stored.ranking.slot === null &&
    stored.ranking.period === current.ranking.period;
  const ranking = keepSlot ? current.ranking : stored.ranking;
  if (
    current.active === stored.active &&
    sameSelection(current.ranking, ranking) &&
    sameSelection(current.hall, stored.hall)
  ) {
    return current;
  }
  return { active: stored.active, ranking, hall: stored.hall };
}
