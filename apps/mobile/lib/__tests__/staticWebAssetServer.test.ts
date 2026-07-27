import Server from "@dr.pogodin/react-native-static-server";
import { exists } from "@dr.pogodin/react-native-fs";

import {
  WEB_ASSET_DIR,
  WEB_ASSET_ROOT_MISSING_MESSAGE,
  createStaticWebAssetServer,
  SPA_FALLBACK_EXTRA_CONFIG,
} from "../staticWebAssetServer";

const mockStart = jest.fn<Promise<string>, []>();
const mockStop = jest.fn<Promise<void>, []>();

jest.mock("@dr.pogodin/react-native-static-server", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({ start: mockStart, stop: mockStop })),
  // 실제 라이브러리와 같은 규칙: 절대 경로는 그대로, 상대 경로는 번들 루트 기준으로 푼다.
  resolveAssetsPath: jest.fn((path: string) =>
    path.startsWith("/") ? path : `/main-bundle/${path}`,
  ),
}));

jest.mock("@dr.pogodin/react-native-fs", () => ({
  __esModule: true,
  exists: jest.fn(),
}));

const ServerMock = Server as unknown as jest.Mock;
const existsMock = exists as jest.MockedFunction<typeof exists>;

/** 생성자에 실제로 넘어간 옵션. 라이브러리 계약을 테스트가 직접 확인한다. */
function constructorOptions(): Record<string, unknown> {
  return ServerMock.mock.calls[0][0] as Record<string, unknown>;
}

describe("createStaticWebAssetServer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStart.mockResolvedValue("http://localhost:12345");
    mockStop.mockResolvedValue(undefined);
    existsMock.mockResolvedValue(true);
  });

  it("start가 라이브러리를 기동하고 오리진을 돌려준다", async () => {
    const server = createStaticWebAssetServer({ fileDir: "/data/web-dist" });

    await expect(server.start()).resolves.toBe("http://127.0.0.1:12345");
    expect(server.origin).toBe("http://127.0.0.1:12345");
    expect(mockStart).toHaveBeenCalledTimes(1);
  });

  it("이미 떠 있으면 라이브러리를 다시 기동하지 않는다", async () => {
    const server = createStaticWebAssetServer({ fileDir: "/data/web-dist" });

    await server.start();
    await server.start();

    expect(mockStart).toHaveBeenCalledTimes(1);
  });

  it("stop 후 origin이 null이 되고 다시 start할 수 있다", async () => {
    const server = createStaticWebAssetServer({ fileDir: "/data/web-dist" });

    await server.start();
    await server.stop();
    expect(server.origin).toBeNull();

    await server.start();
    expect(mockStart).toHaveBeenCalledTimes(2);
  });

  it("라이브러리 기동이 실패하면 origin이 null로 남는다", async () => {
    mockStart.mockRejectedValue(new Error("port in use"));
    const server = createStaticWebAssetServer({ fileDir: "/data/web-dist" });

    await expect(server.start()).rejects.toThrow("port in use");
    expect(server.origin).toBeNull();
  });

  it("동적 포트로 서빙 루트에 바인딩하고, 외부 접근은 열지 않는다", async () => {
    const server = createStaticWebAssetServer({ fileDir: "/data/web-dist" });

    await server.start();

    expect(constructorOptions().fileDir).toBe("/data/web-dist");
    expect(constructorOptions().port).toBe(0);
    expect(constructorOptions().hostname).toBe("127.0.0.1");
    // `nonLocal`은 라이브러리 0.27에서 deprecated다 — `hostname`으로 바인딩을 정한다.
    expect(constructorOptions()).not.toHaveProperty("nonLocal");
  });

  it("stop 후 다시 start하면 새 인스턴스를 만든다 — 포트를 재사용하지 않는다", async () => {
    const server = createStaticWebAssetServer({ fileDir: "/data/web-dist" });

    await server.start();
    await server.stop();
    await server.start();

    // 인스턴스를 재사용하면 라이브러리가 첫 기동 때 고른 포트를 그대로 다시 쓴다
    // (`_port`는 첫 start에서만 정해진다). 그 포트가 그새 점유되면 고정 포트와
    // 같은 충돌이 된다 — 이슈 #26이 Android 크래시로 짚은 그 상황이다.
    expect(ServerMock).toHaveBeenCalledTimes(2);
  });

  it("SPA 폴백 rewrite 규칙을 lighttpd 설정으로 넘긴다", async () => {
    const server = createStaticWebAssetServer({ fileDir: "/data/web-dist" });

    await server.start();

    expect(constructorOptions().extraConfig).toBe(SPA_FALLBACK_EXTRA_CONFIG);
    expect(SPA_FALLBACK_EXTRA_CONFIG).toContain('server.modules += ("mod_rewrite")');
    expect(SPA_FALLBACK_EXTRA_CONFIG).toContain(
      'url.rewrite-if-not-file = ( "^/(.*)" => "/index.html" )',
    );
  });

  it("라이브러리가 어떤 호스트로 보고하든 오리진 호스트를 127.0.0.1로 통일한다", async () => {
    mockStart.mockResolvedValue("http://[::1]:5000/");
    const server = createStaticWebAssetServer({ fileDir: "/data/web-dist" });

    await expect(server.start()).resolves.toBe("http://127.0.0.1:5000");
  });

  it("오리진을 해석하지 못하면 띄운 서버를 도로 내린다 — 포트를 문 채로 남기지 않는다", async () => {
    mockStart.mockResolvedValue("unix:///tmp/socket");
    const server = createStaticWebAssetServer({ fileDir: "/data/web-dist" });

    await expect(server.start()).rejects.toThrow("unusable origin");
    expect(mockStop).toHaveBeenCalledTimes(1);
    expect(server.origin).toBeNull();
  });

  it("stop은 기동한 적이 없으면 라이브러리를 건드리지 않는다", async () => {
    const server = createStaticWebAssetServer({ fileDir: "/data/web-dist" });

    await server.stop();

    expect(mockStop).not.toHaveBeenCalled();
    expect(server.origin).toBeNull();
  });

  describe("서빙 루트 확인", () => {
    it("서빙 루트가 없으면 서버를 띄우지 않고 거부한다 — lighttpd는 없어도 떠서 404만 낸다", async () => {
      existsMock.mockResolvedValue(false);
      const server = createStaticWebAssetServer({ fileDir: "/data/web-dist" });

      await expect(server.start()).rejects.toThrow(WEB_ASSET_ROOT_MISSING_MESSAGE);
      expect(ServerMock).not.toHaveBeenCalled();
      expect(mockStart).not.toHaveBeenCalled();
      expect(server.origin).toBeNull();
    });

    it("거부 메시지가 없는 경로와 번들링 미정을 함께 알린다", async () => {
      existsMock.mockResolvedValue(false);
      const server = createStaticWebAssetServer();

      // 기본값은 상대 경로다 — 라이브러리와 같은 규칙으로 푼 절대 경로가 메시지에 나와야
      // 기기에서 그 경로를 바로 확인할 수 있다.
      await expect(server.start()).rejects.toThrow(`/main-bundle/${WEB_ASSET_DIR}`);
      await expect(server.start()).rejects.toThrow("번들링 방식");
    });

    it("라이브러리와 같은 규칙으로 푼 경로를 검사한다 — 검사 경로와 서빙 경로가 어긋나면 안 된다", async () => {
      const server = createStaticWebAssetServer();

      await server.start();

      expect(existsMock).toHaveBeenCalledWith(`/main-bundle/${WEB_ASSET_DIR}`);
      expect(constructorOptions().fileDir).toBe(WEB_ASSET_DIR);
    });
  });

  describe("동시 호출", () => {
    it("겹쳐 들어온 start는 서버를 하나만 띄우고 같은 오리진을 받는다", async () => {
      let release: (origin: string) => void = () => undefined;
      mockStart.mockReturnValue(
        new Promise<string>((resolve) => {
          release = resolve;
        }),
      );
      const server = createStaticWebAssetServer({ fileDir: "/data/web-dist" });

      // 첫 기동이 끝나기 전에 두 번째가 들어온다 — 마운트/언마운트/재마운트에서 실제로 난다.
      const first = server.start();
      const second = server.start();
      release("http://localhost:12345");

      await expect(first).resolves.toBe("http://127.0.0.1:12345");
      await expect(second).resolves.toBe("http://127.0.0.1:12345");
      // 네이티브 서버는 싱글턴이라 두 번 띄우면 한쪽이 포트를 문 채 고아가 된다.
      expect(ServerMock).toHaveBeenCalledTimes(1);
      expect(mockStart).toHaveBeenCalledTimes(1);
    });

    it("겹쳐 들어온 start가 함께 실패하고, 그 뒤 재시도할 수 있다", async () => {
      mockStart.mockRejectedValueOnce(new Error("port in use"));
      const server = createStaticWebAssetServer({ fileDir: "/data/web-dist" });

      const first = server.start();
      const second = server.start();

      await expect(first).rejects.toThrow("port in use");
      await expect(second).rejects.toThrow("port in use");
      expect(server.origin).toBeNull();

      // 진행 중 표시가 실패 후에 남아 있으면 재시도가 영영 옛 실패를 돌려받는다.
      mockStart.mockResolvedValue("http://localhost:23456");
      await expect(server.start()).resolves.toBe("http://127.0.0.1:23456");
    });
  });

  describe("stop 실패", () => {
    it("stop이 거부되면 그대로 던지되 상태는 비워 재시도가 가능하다", async () => {
      const server = createStaticWebAssetServer({ fileDir: "/data/web-dist" });
      await server.start();
      mockStop.mockRejectedValue(new Error("stop failed"));

      await expect(server.stop()).rejects.toThrow("stop failed");
      // origin이 죽은 서버를 가리킨 채 남으면 다음 start가 그 오리진을 그대로 돌려준다.
      expect(server.origin).toBeNull();
    });

    it("stop이 끝나기 전에는 상태를 비우지 않는다 — 그 사이 start가 두 번째 서버를 띄운다", async () => {
      let finishStop: () => void = () => undefined;
      mockStop.mockReturnValue(
        new Promise<void>((resolve) => {
          finishStop = resolve;
        }),
      );
      const server = createStaticWebAssetServer({ fileDir: "/data/web-dist" });
      await server.start();

      const stopping = server.stop();
      // 아직 내려가는 중이다 — 이 시점의 origin이 null이면 start가 새 서버를 띄운다.
      expect(server.origin).toBe("http://127.0.0.1:12345");

      finishStop();
      await stopping;
      expect(server.origin).toBeNull();
    });
  });
});
