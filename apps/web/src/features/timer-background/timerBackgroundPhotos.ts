import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import { DEFAULT_FIT, type PhotoFit } from "./photoFit";
import { MAX_BACKGROUND_PHOTOS } from "./timerBackground";

const DB_NAME = "focusmakers-timer-background";

/**
 * 배경으로 담은 사진 한 장
 *
 * 앨범 원본이 아니라 긴 변 1920px로 줄인 JPEG다.
 * 타임랩스 사진과 같은 이유로 Blob이 아니라 ArrayBuffer로 둔다(iOS 웹뷰 IndexedDB가 Blob을 믿을 만하게 보관하지 못한다).
 */
export interface TimerBackgroundPhoto {
  id: string;
  bytes: ArrayBuffer;
  width: number;
  height: number;
  addedAtMs: number;
  fit: PhotoFit;
}

export type NewTimerBackgroundPhoto = Pick<TimerBackgroundPhoto, "bytes" | "width" | "height">;

interface TimerBackgroundDb extends DBSchema {
  photos: { key: string; value: TimerBackgroundPhoto; indexes: { addedAtMs: number } };
}

/** 사진이 이미 최대 개수만큼 있을 때 */
export class PhotoLimitError extends Error {}

export interface TimerBackgroundPhotoStore {
  /** 담은 순서대로 준다. */
  list(): Promise<TimerBackgroundPhoto[]>;
  get(id: string): Promise<TimerBackgroundPhoto | null>;
  /** 최대 개수가 찼으면 PhotoLimitError로 거절한다. */
  add(photo: NewTimerBackgroundPhoto, nowMs: number): Promise<TimerBackgroundPhoto>;
  remove(id: string): Promise<void>;
  updateFit(id: string, fit: PhotoFit): Promise<void>;
}

// LAN 주소(http)로 연 개발 웹뷰는 비보안 문서라 randomUUID가 없다.
function newId(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createTimerBackgroundPhotoStore(): TimerBackgroundPhotoStore {
  let opening: Promise<IDBPDatabase<TimerBackgroundDb>> | null = null;

  function database(): Promise<IDBPDatabase<TimerBackgroundDb>> {
    // 실패한 promise를 들고 있으면 다음에도 열지 못한다.
    opening ??= openDB<TimerBackgroundDb>(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore("photos", { keyPath: "id" }).createIndex("addedAtMs", "addedAtMs");
      },
      // 다른 웹뷰가 새 버전으로 열 때 이 연결이 막지 않게 닫는다. 다음 호출이 다시 연다.
      blocking(_currentVersion, _blockedVersion, event) {
        (event.target as IDBDatabase | null)?.close();
        opening = null;
      },
    }).catch((error: unknown) => {
      opening = null;
      throw error;
    });
    return opening;
  }

  return {
    async list() {
      return (await database()).getAllFromIndex("photos", "addedAtMs");
    },
    async get(id) {
      return (await (await database()).get("photos", id)) ?? null;
    },
    async add(photo, nowMs) {
      // 개수 확인과 추가를 한 트랜잭션에 둬야 두 화면이 동시에 담아도 넘치지 않는다.
      const tx = (await database()).transaction("photos", "readwrite");
      if ((await tx.store.count()) >= MAX_BACKGROUND_PHOTOS) {
        await tx.done;
        throw new PhotoLimitError();
      }
      const record: TimerBackgroundPhoto = {
        ...photo,
        id: newId(),
        addedAtMs: nowMs,
        fit: DEFAULT_FIT,
      };
      await tx.store.add(record);
      await tx.done;
      return record;
    },
    async remove(id) {
      await (await database()).delete("photos", id);
    },
    async updateFit(id, fit) {
      const tx = (await database()).transaction("photos", "readwrite");
      const photo = await tx.store.get(id);
      if (photo !== undefined) {
        await tx.store.put({ ...photo, fit });
      }
      await tx.done;
    },
  };
}

let current = createTimerBackgroundPhotoStore();

/** 화면이 쓰는 사진 저장소 */
export function timerBackgroundPhotoStore(): TimerBackgroundPhotoStore {
  return current;
}

/** 테스트마다 새 IndexedDB에 연결하도록 저장소를 새로 만든다. */
export function __resetTimerBackgroundPhotoStoreForTests(): void {
  current = createTimerBackgroundPhotoStore();
}
