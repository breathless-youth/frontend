import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import { WATCHER_ASSET_DIR, type WatcherClip, watcherDevice } from "./watcherClips";

const DB_NAME = "focusmakers-watcher-assets";

/** 받아 둔 감독관 소재 하나. 사진 배경과 같은 이유로 Blob이 아니라 ArrayBuffer로 둔다. */
interface WatcherAsset {
  url: string;
  bytes: ArrayBuffer;
  type: string;
}

interface WatcherAssetDb extends DBSchema {
  files: { key: string; value: WatcherAsset };
}

const CLIPS: readonly WatcherClip[] = ["enter", "loop-a", "loop-b", "exit"];
const SOUNDS = ["approach", "enter", "exit"] as const;

/** 이 기기가 쓰는 소재 전부. 돌려도 다시 받지 않게 세로·가로를 함께 담는다. */
export function watcherAssetUrls(viewport: { width: number; height: number }): string[] {
  const device = watcherDevice(viewport);
  const urls: string[] = [];
  for (const orientation of ["portrait", "landscape"]) {
    for (const clip of CLIPS)
      urls.push(`${WATCHER_ASSET_DIR}/${clip}/${device}_${orientation}.mp4`);
    urls.push(`${WATCHER_ASSET_DIR}/poster/${device}_${orientation}.jpg`);
  }
  for (const sound of SOUNDS) urls.push(`${WATCHER_ASSET_DIR}/sound/${sound}.m4a`);
  return urls;
}

let opening: Promise<IDBPDatabase<WatcherAssetDb>> | null = null;

function database(): Promise<IDBPDatabase<WatcherAssetDb>> {
  opening ??= openDB<WatcherAssetDb>(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore("files", { keyPath: "url" });
    },
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

// 지울 때마다 올린다. 지우기 전에 시작한 받기가 늦게 끝나도 지운 소재를 다시 저장하지 않게 한다.
let generation = 0;

/**
 * 감독관 소재를 기기에 받아 둔다
 *
 * 공부 화면이 그때 받으면 첫 등장이 늦거나 네트워크가 없을 때 빈 방만 보여서, 배경을 적용할 때 미리 받는다.
 * 소재 주소에 1년 캐시를 걸어 두었지만 웹뷰 HTTP 캐시는 언제 비워질지 몰라, 오프라인에서도 첫 등장을 보장하려고 사본을 둔다.
 * 이미 받은 파일은 건너뛰고, 소재 폴더가 바뀐 옛 파일은 지운다.
 * 받지 못한 파일은 공부 화면이 네트워크에서 받으므로 실패를 밖으로 내보내지 않는다.
 */
export async function saveWatcherAssets(
  urls: readonly string[],
  load: (url: string) => Promise<Response> = (url) => fetch(url),
): Promise<void> {
  const started = generation;
  try {
    const db = await database();
    const stored = new Set(await db.getAllKeys("files"));
    for (const url of stored) {
      if (!url.startsWith(`${WATCHER_ASSET_DIR}/`)) await db.delete("files", url);
    }
    await Promise.all(
      urls
        .filter((url) => !stored.has(url))
        .map(async (url) => {
          try {
            const response = await load(url);
            if (!response.ok) return;
            const type = response.headers.get("content-type") ?? "";
            const bytes = await response.arrayBuffer();
            if (started !== generation) return;
            await db.put("files", { url, bytes, type });
          } catch {
            // 이 파일은 공부 화면에서 네트워크로 받는다.
          }
        }),
    );
  } catch {
    // 저장소를 못 열면 지금처럼 공부 화면이 그때 받는다.
  }
}

/** 감독관이 아닌 배경을 고르면 받아 둔 소재를 지운다. */
export async function clearWatcherAssets(): Promise<void> {
  generation += 1;
  try {
    await (await database()).clear("files");
  } catch {
    // 못 지워도 다음에 감독관을 고를 때 옛 폴더 파일은 지워진다.
  }
}

/** 받아 둔 소재. 없거나 읽지 못하면 null이라 호출부는 네트워크 주소를 쓴다. */
export async function readWatcherAsset(url: string): Promise<Blob | null> {
  try {
    const asset = await (await database()).get("files", url);
    return asset ? new Blob([asset.bytes], { type: asset.type }) : null;
  } catch {
    return null;
  }
}

/** 테스트마다 새 IndexedDB를 쓰도록 열린 연결을 잊는다. */
export function __resetWatcherAssetsForTests(): void {
  opening = null;
}
