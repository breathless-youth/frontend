import Server from "@dr.pogodin/react-native-static-server";

import { createFakeWebAssetServer } from "../webAssetServer";
import {
  getWebAssetServer,
  resetWebAssetServer,
  setWebAssetServer,
} from "../webAssetServerRegistry";

const mockStart = jest.fn<Promise<string>, []>();
const mockStop = jest.fn<Promise<void>, []>();

jest.mock("@dr.pogodin/react-native-static-server", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({ start: mockStart, stop: mockStop })),
  resolveAssetsPath: jest.fn((path: string) =>
    path.startsWith("/") ? path : `/main-bundle/${path}`,
  ),
}));

jest.mock("@dr.pogodin/react-native-fs", () => ({
  __esModule: true,
  // 기본값 서빙 루트가 있는 상황 — 여기서 보는 것은 배선이지 루트 존재 여부가 아니다.
  exists: jest.fn(async () => true),
}));

describe("webAssetServerRegistry", () => {
  beforeEach(() => {
    mockStart.mockResolvedValue("http://127.0.0.1:12345");
    mockStop.mockResolvedValue(undefined);
  });

  it("주입 전 기본값은 실제 구현이다 — 서버 라이브러리를 실제로 기동한다", async () => {
    // 이 단언이 지키는 것은 배선이다. 기본값이 fake로 되돌아가면 `start()`가 라이브러리를
    // 건드리지 않고도 성공해, 앱은 존재하지 않는 서버를 로드하며 백지가 된다.
    await expect(getWebAssetServer().start()).resolves.toBe("http://127.0.0.1:12345");
    expect(Server).toHaveBeenCalledTimes(1);

    await getWebAssetServer().stop();
  });

  it("주입한 서버가 기본값을 대체하고, reset이 사용 불가로 되돌린다", async () => {
    setWebAssetServer(createFakeWebAssetServer({ origin: "http://localhost:9999" }));
    await expect(getWebAssetServer().start()).resolves.toBe("http://localhost:9999");

    resetWebAssetServer();

    // fake로 되돌리면 주입을 깜빡한 테스트가 조용히 통과한다 — 사용 불가여야 그 자리에서 드러난다.
    await expect(getWebAssetServer().start()).rejects.toThrow();
  });
});
