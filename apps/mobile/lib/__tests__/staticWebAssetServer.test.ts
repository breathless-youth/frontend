import Server from "@dr.pogodin/react-native-static-server";

import { createStaticWebAssetServer, SPA_FALLBACK_EXTRA_CONFIG } from "../staticWebAssetServer";

const mockStart = jest.fn<Promise<string>, []>();
const mockStop = jest.fn<Promise<void>, []>();

jest.mock("@dr.pogodin/react-native-static-server", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({ start: mockStart, stop: mockStop })),
}));

const ServerMock = Server as unknown as jest.Mock;

/** 생성자에 실제로 넘어간 옵션. 라이브러리 계약을 테스트가 직접 확인한다. */
function constructorOptions(): Record<string, unknown> {
  return ServerMock.mock.calls[0][0] as Record<string, unknown>;
}

describe("createStaticWebAssetServer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStart.mockResolvedValue("http://localhost:12345");
    mockStop.mockResolvedValue(undefined);
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
});
