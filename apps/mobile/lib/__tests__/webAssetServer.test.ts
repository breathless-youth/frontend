import {
  FAKE_WEB_ASSET_SERVER_ORIGIN,
  WEB_ASSET_SERVER_UNAVAILABLE_MESSAGE,
  buildSessionUrl,
  createFakeWebAssetServer,
  createUnavailableWebAssetServer,
} from "../webAssetServer";

describe("buildSessionUrl", () => {
  it("userId가 있으면 쿼리로 붙인다", () => {
    expect(buildSessionUrl("http://localhost:34567", { roomId: "1", userId: 7 })).toBe(
      "http://localhost:34567/room/1?userId=7",
    );
  });

  it("userId가 없으면 쿼리를 붙이지 않는다 — apps/web이 unsaved 경로로 처리한다", () => {
    expect(buildSessionUrl("http://localhost:34567", { roomId: "1", userId: null })).toBe(
      "http://localhost:34567/room/1",
    );
  });

  it("오리진 끝의 슬래시를 중복시키지 않는다", () => {
    expect(buildSessionUrl("http://localhost:34567/", { roomId: "1", userId: null })).toBe(
      "http://localhost:34567/room/1",
    );
  });

  /**
   * 동봉되는 web-dist는 **언제나 프로덕션 빌드**라 `import.meta.env.DEV`가 false다.
   * 이 플래그가 실기기에서 웹 진단을 켤 유일한 수단이다(2026-07-30 확인: 번들에
   * `camera:stream` 문자열이 0건이었다).
   */
  it("diag를 켜면 진단 플래그를 붙인다", () => {
    expect(buildSessionUrl("http://localhost:34567", { roomId: "1", userId: 7, diag: true })).toBe(
      "http://localhost:34567/room/1?userId=7&diag=1",
    );
  });

  it("userId 없이 diag만 켜도 올바른 쿼리를 만든다", () => {
    expect(
      buildSessionUrl("http://localhost:34567", { roomId: "1", userId: null, diag: true }),
    ).toBe("http://localhost:34567/room/1?diag=1");
  });

  it("diag를 넘기지 않으면 플래그가 붙지 않는다 — 릴리스 빌드의 기본값이다", () => {
    expect(buildSessionUrl("http://localhost:34567", { roomId: "1", userId: 7 })).not.toContain(
      "diag",
    );
  });
});

describe("createUnavailableWebAssetServer", () => {
  it("start가 어느 작업이 남았는지 밝히며 거부된다", async () => {
    const server = createUnavailableWebAssetServer();

    await expect(server.start()).rejects.toThrow(WEB_ASSET_SERVER_UNAVAILABLE_MESSAGE);
    expect(server.origin).toBeNull();
  });
});

describe("createFakeWebAssetServer", () => {
  it("start 전에는 origin이 null이다", () => {
    expect(createFakeWebAssetServer().origin).toBeNull();
  });

  it("기본 오리진이 Metro 포트(8081)와 겹치지 않는다 — 겹치면 실패가 성공처럼 보인다", async () => {
    const server = createFakeWebAssetServer();

    await expect(server.start()).resolves.toBe(FAKE_WEB_ASSET_SERVER_ORIGIN);
    expect(FAKE_WEB_ASSET_SERVER_ORIGIN).not.toContain(":8081");
  });

  it("start가 오리진을 돌려주고 origin에 반영한다", async () => {
    const server = createFakeWebAssetServer({ origin: "http://localhost:9999" });

    await expect(server.start()).resolves.toBe("http://localhost:9999");
    expect(server.origin).toBe("http://localhost:9999");
  });

  it("이미 떠 있으면 다시 띄우지 않고 같은 오리진을 준다", async () => {
    const server = createFakeWebAssetServer();

    const first = await server.start();
    const second = await server.start();

    expect(second).toBe(first);
    expect(server.startCount).toBe(1);
  });

  it("stop 후에는 origin이 null로 돌아가고 다시 start할 수 있다", async () => {
    const server = createFakeWebAssetServer();

    await server.start();
    await server.stop();
    expect(server.origin).toBeNull();

    await server.start();
    expect(server.startCount).toBe(2);
  });

  it("failToStart면 start가 거부되고 origin이 null로 남는다", async () => {
    const server = createFakeWebAssetServer({ failToStart: true });

    await expect(server.start()).rejects.toThrow("web asset server failed to start");
    expect(server.origin).toBeNull();
  });
});
