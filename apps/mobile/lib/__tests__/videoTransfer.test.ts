import { File, Paths } from "expo-file-system";
import { requestPermissionsAsync, saveToLibraryAsync } from "expo-media-library/legacy";
import Share from "react-native-share";

import { appendVideoChunk, saveVideo, shareVideo } from "../videoTransfer";

/**
 * 영상 전달 어댑터
 *
 * expo-file-system은 jest-expo가 붙이는 메모리 파일시스템을 그대로 써서 이어 쓴 결과를 바이트로 확인한다.
 * 사진 보관함과 공유 시트만 mock한다.
 */

jest.mock("expo-media-library/legacy", () => ({
  requestPermissionsAsync: jest.fn(),
  saveToLibraryAsync: jest.fn(),
}));

jest.mock("react-native-share", () => ({
  __esModule: true,
  default: { open: jest.fn() },
}));

const mockedRequestPermissions = requestPermissionsAsync as jest.MockedFunction<
  typeof requestPermissionsAsync
>;
const mockedSaveToLibrary = saveToLibraryAsync as jest.MockedFunction<typeof saveToLibraryAsync>;
const mockedOpen = Share.open as jest.MockedFunction<typeof Share.open>;

let idCounter = 0;

/** 테스트마다 다른 id. 어댑터가 id별 기록을 들고 있어 테스트끼리 섞이지 않게 한다. */
function nextId(): string {
  idCounter += 1;
  return `00000000-0000-4000-8000-${String(idCounter).padStart(12, "0")}`;
}

function cacheFile(id: string): File {
  return new File(Paths.cache, `timelapse-${id}.mp4`);
}

/** 어댑터 안의 await 체인이 다음 네이티브 호출에 닿을 때까지 기다린다. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** 어댑터는 `granted`만 본다. */
function permission(granted: boolean) {
  return {
    granted,
    status: granted ? "granted" : "denied",
    canAskAgain: true,
    expires: "never",
  } as unknown as Awaited<ReturnType<typeof requestPermissionsAsync>>;
}

beforeEach(() => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
  mockedRequestPermissions.mockResolvedValue(permission(true));
  mockedSaveToLibrary.mockResolvedValue(undefined);
  mockedOpen.mockResolvedValue({ success: true, message: "" });
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

describe("saveVideo", () => {
  it("조각을 순서대로 이어 쓴 파일을 사진 앱에 저장하고 임시 파일을 지운다", async () => {
    const id = nextId();
    let savedBase64 = "";
    mockedSaveToLibrary.mockImplementation(async (uri) => {
      savedBase64 = new File(uri).base64Sync();
    });

    appendVideoChunk(id, 0, "AAEC");
    appendVideoChunk(id, 1, "AwQF");

    await expect(saveVideo(id, 2)).resolves.toBe("saved");
    expect(mockedRequestPermissions).toHaveBeenCalledWith(true);
    expect(mockedSaveToLibrary).toHaveBeenCalledWith(cacheFile(id).uri);
    expect(savedBase64).toBe("AAECAwQF");
    expect(cacheFile(id).exists).toBe(false);
  });

  it("순서가 어긋난 조각이 있으면 저장하지 않고 failed다", async () => {
    const id = nextId();

    appendVideoChunk(id, 0, "AAEC");
    appendVideoChunk(id, 2, "AwQF");

    await expect(saveVideo(id, 2)).resolves.toBe("failed");
    expect(mockedRequestPermissions).not.toHaveBeenCalled();
    expect(mockedSaveToLibrary).not.toHaveBeenCalled();
    expect(cacheFile(id).exists).toBe(false);
  });

  it("어긋난 뒤 빠진 조각이 늦게 와도 failed를 유지한다", async () => {
    const id = nextId();

    appendVideoChunk(id, 0, "AAEC");
    appendVideoChunk(id, 2, "BgcI");
    appendVideoChunk(id, 1, "AwQF");

    await expect(saveVideo(id, 3)).resolves.toBe("failed");
    expect(mockedSaveToLibrary).not.toHaveBeenCalled();
  });

  it("받은 조각 수가 chunks와 다르면 failed다", async () => {
    const id = nextId();

    appendVideoChunk(id, 0, "AAEC");
    appendVideoChunk(id, 1, "AwQF");

    await expect(saveVideo(id, 3)).resolves.toBe("failed");
    expect(mockedSaveToLibrary).not.toHaveBeenCalled();
    expect(cacheFile(id).exists).toBe(false);
  });

  it("조각을 하나도 받지 못했으면 failed다", async () => {
    await expect(saveVideo(nextId(), 1)).resolves.toBe("failed");
  });

  it("사진 추가 권한을 거부하면 denied이고 저장하지 않는다", async () => {
    const id = nextId();
    mockedRequestPermissions.mockResolvedValue(permission(false));

    appendVideoChunk(id, 0, "AAEC");

    await expect(saveVideo(id, 1)).resolves.toBe("denied");
    expect(mockedSaveToLibrary).not.toHaveBeenCalled();
    expect(cacheFile(id).exists).toBe(false);
  });

  it("저장이 실패하면 failed이고 임시 파일을 지운다", async () => {
    const id = nextId();
    mockedSaveToLibrary.mockRejectedValue(new Error("disk full"));

    appendVideoChunk(id, 0, "AAEC");

    await expect(saveVideo(id, 1)).resolves.toBe("failed");
    expect(cacheFile(id).exists).toBe(false);
  });

  it("여러 id의 조각이 섞여 와도 id별로 따로 모은다", async () => {
    const first = nextId();
    const second = nextId();
    const saved: string[] = [];
    mockedSaveToLibrary.mockImplementation(async (uri) => {
      saved.push(new File(uri).base64Sync());
    });

    appendVideoChunk(first, 0, "AAEC");
    appendVideoChunk(second, 0, "CQoL");
    appendVideoChunk(first, 1, "AwQF");
    appendVideoChunk(second, 1, "DA0O");

    await expect(saveVideo(first, 2)).resolves.toBe("saved");
    await expect(saveVideo(second, 2)).resolves.toBe("saved");
    expect(saved).toEqual(["AAECAwQF", "CQoLDA0O"]);
  });
});

describe("shareVideo", () => {
  it("파일과 본문을 공유 시트에 넘기고 공유되면 shared다", async () => {
    const id = nextId();

    appendVideoChunk(id, 0, "AAEC");

    await expect(shareVideo(id, 1, "본문")).resolves.toBe("shared");
    expect(mockedOpen).toHaveBeenCalledWith({
      url: cacheFile(id).uri,
      type: "video/mp4",
      message: "본문",
      failOnCancel: false,
    });
  });

  it("제목이 있으면 함께 넘긴다", async () => {
    const id = nextId();

    appendVideoChunk(id, 0, "AAEC");

    await shareVideo(id, 1, "본문", "제목");
    expect(mockedOpen).toHaveBeenCalledWith(expect.objectContaining({ title: "제목" }));
  });

  it("사용자가 시트를 닫으면 dismissed다", async () => {
    const id = nextId();
    mockedOpen.mockResolvedValue({ success: false, message: "CANCELED", dismissedAction: true });

    appendVideoChunk(id, 0, "AAEC");

    await expect(shareVideo(id, 1, "본문")).resolves.toBe("dismissed");
  });

  it("시트를 열지 못하면 failed다", async () => {
    const id = nextId();
    mockedOpen.mockRejectedValue(new Error("not_available"));

    appendVideoChunk(id, 0, "AAEC");

    await expect(shareVideo(id, 1, "본문")).resolves.toBe("failed");
  });

  it("앞 공유가 시트를 열지 못해도 다음 공유는 시트를 연다", async () => {
    const first = nextId();
    const second = nextId();
    mockedOpen.mockRejectedValueOnce(new Error("not_available"));
    appendVideoChunk(first, 0, "AAEC");
    appendVideoChunk(second, 0, "AwQF");

    await expect(shareVideo(first, 1, "본문")).resolves.toBe("failed");
    await expect(shareVideo(second, 1, "본문")).resolves.toBe("shared");
    expect(mockedOpen).toHaveBeenCalledTimes(2);
  });

  it("조각 수가 맞지 않으면 시트를 열지 않고 failed다", async () => {
    const id = nextId();

    appendVideoChunk(id, 0, "AAEC");

    await expect(shareVideo(id, 2, "본문")).resolves.toBe("failed");
    expect(mockedOpen).not.toHaveBeenCalled();
  });

  it("공유 뒤에는 임시 파일을 바로 지우지 않는다 (대상 앱이 아직 읽는 중일 수 있다)", async () => {
    const id = nextId();

    appendVideoChunk(id, 0, "AAEC");

    await expect(shareVideo(id, 1, "본문")).resolves.toBe("shared");
    expect(cacheFile(id).exists).toBe(true);
  });

  it("앞 공유 시트가 닫히기 전에는 다음 시트를 열지 않고 둘 다 결과를 돌려준다", async () => {
    const first = nextId();
    const second = nextId();
    let closeFirst!: (result: Awaited<ReturnType<typeof Share.open>>) => void;
    mockedOpen.mockReturnValueOnce(
      new Promise((resolve) => {
        closeFirst = resolve;
      }),
    );
    appendVideoChunk(first, 0, "AAEC");
    appendVideoChunk(second, 0, "AwQF");

    const firstResult = shareVideo(first, 1, "본문");
    const secondResult = shareVideo(second, 1, "본문");
    await flush();
    expect(mockedOpen).toHaveBeenCalledTimes(1);

    closeFirst({ success: true, message: "" });
    await expect(firstResult).resolves.toBe("shared");
    await expect(secondResult).resolves.toBe("shared");
    expect(mockedOpen).toHaveBeenCalledTimes(2);
  });
});

describe("appendVideoChunk", () => {
  it("새 전달의 첫 조각이 오면 지난 전달이 남긴 파일만 지운다", async () => {
    const shared = nextId();
    const inProgress = nextId();
    const next = nextId();
    const unrelated = new File(Paths.cache, "other.txt");
    unrelated.write("keep");

    appendVideoChunk(inProgress, 0, "CQoL");
    appendVideoChunk(shared, 0, "AAEC");
    await shareVideo(shared, 1, "본문");

    appendVideoChunk(next, 0, "DA0O");

    expect(cacheFile(shared).exists).toBe(false);
    expect(cacheFile(inProgress).exists).toBe(true);
    expect(cacheFile(next).exists).toBe(true);
    expect(unrelated.exists).toBe(true);
  });

  it("조각만 오고 요청이 끝내 오지 않은 id는 다음 전달의 첫 조각에서 파일과 기록을 함께 지운다", async () => {
    const abandoned = nextId();
    const next = nextId();
    const startedAt = Date.now();
    const now = jest.spyOn(Date, "now").mockReturnValue(startedAt);

    appendVideoChunk(abandoned, 0, "AAEC");
    now.mockReturnValue(startedAt + 3 * 60_000);
    appendVideoChunk(next, 0, "AwQF");

    expect(cacheFile(abandoned).exists).toBe(false);
    expect(cacheFile(next).exists).toBe(true);
    await expect(saveVideo(abandoned, 1)).resolves.toBe("failed");
    expect(mockedSaveToLibrary).not.toHaveBeenCalled();
  });

  it("공유 시트가 오래 열려 있어도 그 id의 파일은 지우지 않는다", async () => {
    const sharing = nextId();
    const next = nextId();
    const startedAt = Date.now();
    const now = jest.spyOn(Date, "now").mockReturnValue(startedAt);
    let closeSheet!: (result: Awaited<ReturnType<typeof Share.open>>) => void;
    mockedOpen.mockReturnValueOnce(
      new Promise((resolve) => {
        closeSheet = resolve;
      }),
    );

    appendVideoChunk(sharing, 0, "AAEC");
    const pending = shareVideo(sharing, 1, "본문");
    await flush();
    now.mockReturnValue(startedAt + 3 * 60_000);
    appendVideoChunk(next, 0, "AwQF");
    expect(cacheFile(sharing).exists).toBe(true);

    closeSheet({ success: true, message: "" });
    await expect(pending).resolves.toBe("shared");
  });

  it("조각 쓰기가 실패해도 throw하지 않고 저장 요청에서 failed로 끝낸다", async () => {
    const id = nextId();
    appendVideoChunk(id, 0, "AAEC");
    jest.spyOn(File.prototype, "write").mockImplementationOnce(() => {
      throw new Error("ENOSPC");
    });

    expect(() => appendVideoChunk(id, 1, "AwQF")).not.toThrow();

    await expect(saveVideo(id, 2)).resolves.toBe("failed");
    expect(mockedSaveToLibrary).not.toHaveBeenCalled();
    expect(cacheFile(id).exists).toBe(false);
  });

  it("저장이 끝나기 전에 다른 전달이 시작돼도 저장 중인 파일은 지우지 않는다", async () => {
    const saving = nextId();
    const other = nextId();
    let finishSave!: () => void;
    mockedSaveToLibrary.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishSave = resolve;
      }),
    );
    appendVideoChunk(saving, 0, "AAEC");

    const pending = saveVideo(saving, 1);
    await flush();
    appendVideoChunk(other, 0, "AwQF");
    expect(cacheFile(saving).exists).toBe(true);

    finishSave();
    await expect(pending).resolves.toBe("saved");
    expect(cacheFile(saving).exists).toBe(false);
  });
});
