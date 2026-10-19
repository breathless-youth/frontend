import { remoteScreenInput } from "../tabDeepLink";

describe("remoteScreenInput — 탭 파라미터를 웹뷰 입력으로", () => {
  it("path 파라미터가 없으면 탭 루트를 연다", () => {
    expect(remoteScreenInput({}, "/records")).toEqual({
      key: "/records",
      path: "/records",
      resetPath: "/records",
    });
  });

  it("path가 있으면 그 경로와 쿼리를 열고, at를 섞은 key로 다시 마운트되게 한다", () => {
    expect(
      remoteScreenInput({ path: "/records?date=2026-10-01&view=week", at: "17" }, "/records"),
    ).toEqual({
      key: "/records?date=2026-10-01&view=week-17",
      path: "/records",
      resetPath: "/records",
      extraQuery: { date: "2026-10-01", view: "week" },
    });
    expect(remoteScreenInput({ path: "/planner", at: "18" }, "/records")).toEqual({
      key: "/planner-18",
      path: "/planner",
      resetPath: "/records",
    });
  });

  it("쿼리는 첫 ?에서만 가르고, 반복 키는 웹이 읽는 첫 값을 남기고, 빈 쿼리는 없는 것으로 본다", () => {
    expect(
      remoteScreenInput({ path: "/records?date=2026-10-01&date=2026-10-02", at: "1" }, "/records"),
    ).toEqual({
      key: "/records?date=2026-10-01&date=2026-10-02-1",
      path: "/records",
      resetPath: "/records",
      extraQuery: { date: "2026-10-01" },
    });
    expect(
      remoteScreenInput({ path: "/records?q=what?&x=1", at: "2" }, "/records").extraQuery,
    ).toEqual({ q: "what?", x: "1" });
    expect(remoteScreenInput({ path: "/planner?", at: "3" }, "/records")).toEqual({
      key: "/planner?-3",
      path: "/planner",
      resetPath: "/records",
    });
  });

  it("이 탭이 여는 경로가 아니면 루트를 연다 — 세션 화면·다른 탭 화면·모르는 경로", () => {
    for (const path of [
      "/room/1",
      "/social/room/9",
      "/profile",
      "/dev/webrtc-loopback",
      "/unknown",
    ]) {
      expect(remoteScreenInput({ path, at: "1" }, "/records")).toEqual({
        key: "/records",
        path: "/records",
        resetPath: "/records",
      });
    }
    expect(remoteScreenInput({ path: "/profile", at: "1" }, "/settings").path).toBe("/profile");
    expect(remoteScreenInput({ path: "/timelapses", at: "1" }, "/home").path).toBe("/timelapses");
  });

  it("슬래시로 시작하지 않거나 배열로 온 path는 무시하고, 배열 at은 key에 섞지 않는다", () => {
    expect(remoteScreenInput({ path: "https://evil.example/x" }, "/records")).toEqual({
      key: "/records",
      path: "/records",
      resetPath: "/records",
    });
    expect(remoteScreenInput({ path: ["/planner"] }, "/records")).toEqual({
      key: "/records",
      path: "/records",
      resetPath: "/records",
    });
    expect(remoteScreenInput({ path: "/planner", at: ["1", "2"] }, "/records").key).toBe(
      "/planner-",
    );
  });
});
