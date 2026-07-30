import * as FileSystem from "expo-file-system/legacy";

/**
 * 세션 체크포인트·미제출 큐가 쓰는 파일 I/O의 유일한 expo-file-system 진입점.
 *
 * ponytail: 어댑터는 로직 0줄 유지 — 단위 테스트 없음(로직은 스토어·큐에서 fake로 검증,
 * 실기기 검증은 브리지 연결 티켓의 E2E). expo-file-system API 변경 시 이 파일만 고친다.
 */

export interface SessionFileStore {
  /** 없으면 null. */
  read(path: string): Promise<string | null>;
  /** `{path}.tmp`에 쓴 뒤 rename으로 교체(덮어쓰기) — 쓰다 만 파일이 남지 않는다. */
  writeAtomic(path: string, contents: string): Promise<void>;
  /** 없어도 조용히 성공. */
  remove(path: string): Promise<void>;
  /** 파일명 배열. 디렉터리가 없으면 []. */
  list(dirPath: string): Promise<string[]>;
}

const ROOT_DIR = `${FileSystem.documentDirectory}focuson/`;

function toUri(path: string): string {
  return `${ROOT_DIR}${path}`;
}

async function ensureParentDir(uri: string): Promise<void> {
  const dir = uri.slice(0, uri.lastIndexOf("/") + 1);
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
}

export const sessionFileStore: SessionFileStore = {
  async read(path) {
    const uri = toUri(path);
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) {
      return null;
    }
    return FileSystem.readAsStringAsync(uri);
  },

  async writeAtomic(path, contents) {
    const uri = toUri(path);
    const tmpUri = `${uri}.tmp`;
    await ensureParentDir(uri);
    await FileSystem.writeAsStringAsync(tmpUri, contents);
    // moveAsync는 대상이 이미 있으면 덮어쓴다(iOS는 이동 전 대상을 제거, Android는 rename(2) 교체
    // 의미론) — 별도 삭제 불필요.
    await FileSystem.moveAsync({ from: tmpUri, to: uri });
  },

  async remove(path) {
    await FileSystem.deleteAsync(toUri(path), { idempotent: true });
  },

  async list(dirPath) {
    const uri = toUri(`${dirPath}/`);
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) {
      return [];
    }
    return FileSystem.readDirectoryAsync(uri);
  },
};
