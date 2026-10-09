import { File, Paths } from "expo-file-system";
import { requestPermissionsAsync, saveToLibraryAsync } from "expo-media-library/legacy";
import type RNShare from "react-native-share";

import type { VideoResultStatus } from "@focusmakers/types";

/**
 * 타임랩스 영상 전달 어댑터
 *
 * 웹이 보낸 base64 조각을 캐시 파일에 이어 쓰고, 다 모이면 사진 앱에 저장하거나 공유 시트로 보낸다.
 * 파일·사진 보관함·공유 시트 SDK는 이 파일에서만 불러온다.
 * 저장은 끝나면 결과와 관계없이 임시 파일을 바로 지운다.
 * 공유는 바로 지우지 않는다.
 * Android의 공유 시트는 사용자가 대상 앱을 고른 순간 결과를 돌려주는데, 그때 지우면 대상 앱이 파일을 읽지 못한다.
 * 그래서 공유가 남긴 파일은 다음 전달의 첫 조각이 올 때 지운다.
 */

/**
 * 순서가 어긋난 id의 표시
 *
 * 어떤 `chunks`와도 같지 않아 끝에서 `failed`가 된다.
 */
const BROKEN = -1;

/**
 * id마다 다음에 와야 할 조각 순번
 *
 * 동시에 여러 저장·공유가 진행돼도 서로 섞이지 않는다.
 */
const nextSeqById = new Map<string, number>();

/**
 * id마다 마지막 조각이 온 시각. 저장·공유 요청이 들어오면 지운다.
 *
 * 웹이 조각을 보내다 중간에 멈추면(읽기 실패, 문서 재로드) 요청이 영영 오지 않아 `nextSeqById`와 파일이 그대로 남는다.
 * 조각은 초 단위로 이어 오므로, 이보다 훨씬 오래 멈춘 id는 중단된 전달로 보고 다음 전달의 첫 조각에서 함께 지운다.
 */
const lastChunkAtById = new Map<string, number>();
const STALE_TRANSFER_MS = 2 * 60_000;

const VIDEO_FILE_PATTERN = /^timelapse-(.+)\.mp4$/;

/**
 * 공유 시트 차례
 *
 * 시트가 떠 있는 동안 `Share.open`을 다시 부르면 한쪽 호출이 끝나지 않아 웹이 그 id의 결과를 영영 못 받는다.
 * Android는 뒤 호출이 앞 호출의 콜백을 덮어쓰고, iOS는 이미 시트가 뜬 컨트롤러에 다시 표시하려다 거부된다.
 * 그래서 앞 시트가 닫힌 뒤에 다음 시트를 연다.
 */
let shareTurn: Promise<unknown> = Promise.resolve();

function videoFile(id: string): File {
  return new File(Paths.cache, `timelapse-${id}.mp4`);
}

function removeFile(file: File): void {
  try {
    if (file.exists) {
      file.delete();
    }
  } catch (error: unknown) {
    console.warn("[videoTransfer] 임시 영상 파일 삭제 실패", error);
  }
}

/**
 * 지난 전달이 남긴 임시 파일 정리
 *
 * 진행 중인 id의 파일은 남긴다.
 * 저장과 공유가 같은 다이얼로그에서 겹치면 조각이 섞여 들어오기 때문이다.
 * 공유 시트가 아직 열려 있는 id도 기록에 남아 있어 함께 보호된다.
 */
function removeLeftovers(): void {
  try {
    const now = Date.now();
    for (const [id, atMs] of lastChunkAtById) {
      if (now - atMs > STALE_TRANSFER_MS) {
        lastChunkAtById.delete(id);
        nextSeqById.delete(id);
      }
    }
    for (const entry of Paths.cache.list()) {
      const id = VIDEO_FILE_PATTERN.exec(entry.name)?.[1];
      if (id !== undefined && !nextSeqById.has(id)) {
        removeFile(new File(entry.uri));
      }
    }
  } catch (error: unknown) {
    console.warn("[videoTransfer] 남은 임시 영상 파일 정리 실패", error);
  }
}

export function appendVideoChunk(id: string, seq: number, data: string): void {
  lastChunkAtById.set(id, Date.now());
  const expected = seq === 0 ? 0 : nextSeqById.get(id);
  if (seq !== expected) {
    nextSeqById.set(id, BROKEN);
    return;
  }
  if (seq === 0) {
    removeLeftovers();
  }
  try {
    // 첫 조각은 덮어써서 같은 이름으로 남은 파일이 있어도 처음부터 다시 쓴다.
    // 조각마다 따로 base64를 풀어도 384KB가 3의 배수라 이어 붙인 바이트가 원본과 같다.
    videoFile(id).write(data, { encoding: "base64", append: seq > 0 });
    nextSeqById.set(id, seq + 1);
  } catch (error: unknown) {
    console.warn("[videoTransfer] 영상 조각 쓰기 실패", error);
    nextSeqById.set(id, BROKEN);
  }
}

/**
 * 모인 파일로 작업을 돌리고 뒷정리하는 공통 흐름
 *
 * 조각 수가 맞지 않으면 작업을 돌리지 않고 `failed`다.
 * 작업이 실패해도 웹이 기다리지 않게 `failed`로 답한다.
 * id 기록은 작업이 끝난 뒤에 지워서, 작업 중에 시작된 다른 전달의 정리가 이 파일을 건드리지 않는다.
 */
async function finish(
  id: string,
  chunks: number,
  keepFile: boolean,
  run: (uri: string) => Promise<VideoResultStatus>,
): Promise<VideoResultStatus> {
  const file = videoFile(id);
  // 요청이 들어온 id는 더 기다릴 조각이 없으므로 중단 판정 대상에서 뺀다.
  // 공유 시트가 몇 분 열려 있어도 파일이 지워지지 않는다.
  lastChunkAtById.delete(id);
  try {
    return nextSeqById.get(id) === chunks ? await run(file.uri) : "failed";
  } catch (error: unknown) {
    console.warn("[videoTransfer] 영상 저장·공유 실패", error);
    return "failed";
  } finally {
    nextSeqById.delete(id);
    if (!keepFile) {
      removeFile(file);
    }
  }
}

export function saveVideo(id: string, chunks: number): Promise<VideoResultStatus> {
  return finish(id, chunks, false, async (uri) => {
    // iOS는 사진 추가(write-only) 권한만 묻는다.
    // 거부 안내는 웹 다이얼로그가 맡는다.
    const permission = await requestPermissionsAsync(true);
    if (!permission.granted) {
      return "denied";
    }
    await saveToLibraryAsync(uri);
    return "saved";
  });
}

export function shareVideo(
  id: string,
  chunks: number,
  text: string,
  title?: string,
): Promise<VideoResultStatus> {
  return finish(id, chunks, true, async (uri) => {
    // 이 패키지는 불러오는 순간 네이티브 모듈을 찾고 없으면 throw한다.
    // 브리지 핸들러를 지나는 모든 화면과 테스트가 이 파일을 불러오므로 공유할 때만 불러온다.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- 필요할 때만 동기로 불러오는 방법이 require뿐이다.
    const Share = (require("react-native-share") as { default: typeof RNShare }).default;
    const turn = shareTurn.then(() =>
      Share.open({
        url: uri,
        type: "video/mp4",
        message: text,
        ...(title !== undefined ? { title } : {}),
        failOnCancel: false,
      }),
    );
    shareTurn = turn.catch(() => undefined);
    const result = await turn;
    return result.dismissedAction === true ? "dismissed" : "shared";
  });
}
