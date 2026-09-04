import { Alert } from "react-native";

import {
  createForceUpdateAlert,
  FORCE_UPDATE_CONFIRM_LABEL,
  FORCE_UPDATE_DESCRIPTION,
  FORCE_UPDATE_TITLE,
  type ForceUpdateAlertButton,
  RESHOW_DELAY_MS,
} from "../forceUpdateAlert";

/**
 * OS 알림창은 버튼을 누르면 닫히므로 "다시 띄우기"가 곧 차단이다 — 스토어 복귀·스토어 실패·배경 탭·
 * 플랫폼별 겹침 규칙을 고정한다. 알림창 자체는 주입한 fake로 받는다.
 */

jest.mock("../storeLink", () => ({
  openAppStore: jest.fn(() => Promise.resolve()),
}));
// 기본 getCopy는 Remote Config를 읽는다 — 값 없음(빈 문자열)으로 두면 기본 문구가 나온다.
jest.mock("../remoteConfig", () => ({
  getRemoteConfigString: jest.fn(() => ""),
}));

type Listener = (state: string) => void;

function createHarness({
  platform = "ios",
  storeOpens = true,
  storeRejects = false,
  copy,
}: {
  platform?: "android" | "ios";
  storeOpens?: boolean;
  storeRejects?: boolean;
  copy?: () => { title: string; message: string; confirmLabel: string };
} = {}) {
  let listener: Listener | null = null;
  const appState = {
    currentState: "active",
    addEventListener: jest.fn((_type: "change", l: Listener) => {
      listener = l;
      return {
        remove: () => {
          listener = null;
        },
      };
    }),
  };
  const alert = jest.fn();
  const openStore = jest.fn(() => {
    if (storeRejects) return Promise.reject(new Error("no store"));
    // 스토어가 열리면 앱은 백그라운드로 간다.
    if (storeOpens) appState.currentState = "background";
    return Promise.resolve();
  });
  const controller = createForceUpdateAlert({
    alert,
    appState,
    openStore,
    platform,
    ...(copy ? { getCopy: copy } : null),
  });
  const lastButtons = () => alert.mock.calls.at(-1)?.[2] as ForceUpdateAlertButton[];

  return {
    alert,
    openStore,
    appState,
    controller,
    lastButtons,
    async pressConfirm() {
      lastButtons()[0].onPress();
      // openStore 프로미스 정착 → then 콜백(타이머 예약)까지 마이크로태스크 두 번.
      await Promise.resolve();
      await Promise.resolve();
    },
    emit(state: string) {
      appState.currentState = state;
      listener?.(state);
    },
    hasListener: () => listener !== null,
  };
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("forceUpdateAlert (BY-586)", () => {
  it("start()는 BY-533 확정 카피·버튼 하나·cancelable false로 알림창을 띄운다", () => {
    const h = createHarness();

    h.controller.start();

    expect(h.alert).toHaveBeenCalledTimes(1);
    const [title, message, buttons, options] = h.alert.mock.calls[0] as [
      string,
      string,
      ForceUpdateAlertButton[],
      { cancelable: boolean },
    ];
    expect(title).toBe("업데이트가 필요해요");
    expect(message).toBe("원활한 이용을 위해 최신 버전으로 업데이트 해주세요.");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].text).toBe("지금 업데이트");
    expect(options).toEqual({ cancelable: false });
    expect(FORCE_UPDATE_TITLE).toBe(title);
    expect(FORCE_UPDATE_DESCRIPTION).toBe(message);
    expect(FORCE_UPDATE_CONFIRM_LABEL).toBe(buttons[0].text);
  });

  it("콘솔 문구(getCopy)가 있으면 그것으로 띄우고, 재표시 때 다시 읽는다", () => {
    const copy = jest
      .fn()
      .mockReturnValueOnce({ title: "제목1", message: "본문1", confirmLabel: "버튼1" })
      .mockReturnValueOnce({ title: "제목2", message: "본문2", confirmLabel: "버튼2" });
    const h = createHarness({ copy });

    h.controller.start();
    h.controller.reshow();

    expect(h.alert.mock.calls[0].slice(0, 2)).toEqual(["제목1", "본문1"]);
    expect((h.alert.mock.calls[0][2] as ForceUpdateAlertButton[])[0].text).toBe("버튼1");
    expect(h.alert.mock.calls[1].slice(0, 2)).toEqual(["제목2", "본문2"]);
    expect(copy).toHaveBeenCalledTimes(2);
  });

  it("떠 있는 동안 show()를 또 불러도 겹쳐 띄우지 않는다", () => {
    const h = createHarness();

    h.controller.start();
    h.controller.show();
    h.controller.show();

    expect(h.alert).toHaveBeenCalledTimes(1);
  });

  it("확인 → 스토어를 열고, 앱이 백그라운드면 지연 재표시는 건너뛰고 복귀(active)에서 다시 띄운다", async () => {
    const h = createHarness();
    h.controller.start();

    await h.pressConfirm();
    expect(h.openStore).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(RESHOW_DELAY_MS);
    expect(h.alert).toHaveBeenCalledTimes(1);

    h.emit("active");
    expect(h.alert).toHaveBeenCalledTimes(2);
  });

  it("스토어가 안 열려 앱이 그대로 활성이면 RESHOW_DELAY_MS 뒤 다시 띄운다", async () => {
    const h = createHarness({ storeOpens: false });
    h.controller.start();

    await h.pressConfirm();
    expect(h.alert).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(RESHOW_DELAY_MS - 1);
    expect(h.alert).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    expect(h.alert).toHaveBeenCalledTimes(2);
  });

  it("스토어 열기가 거부돼도 throw 없이 재표시를 건다", async () => {
    const h = createHarness({ storeRejects: true });
    h.controller.start();

    await expect(h.pressConfirm()).resolves.toBeUndefined();
    jest.advanceTimersByTime(RESHOW_DELAY_MS);
    expect(h.alert).toHaveBeenCalledTimes(2);
  });

  it("iOS: 알림창이 떠 있는 채로 active가 와도(알림 센터 등) 겹쳐 띄우지 않는다", () => {
    const h = createHarness({ platform: "ios" });
    h.controller.start();

    h.emit("inactive");
    h.emit("active");

    expect(h.alert).toHaveBeenCalledTimes(1);
  });

  it("Android: 복귀 때마다 다시 띄운다 — 새 창이 기존 창을 대체하므로 사라진 창까지 복구된다", () => {
    const h = createHarness({ platform: "android" });
    h.controller.start();

    h.emit("background");
    h.emit("active");

    expect(h.alert).toHaveBeenCalledTimes(2);
  });

  it("reshow()는 떠 있다고 알아도 다시 띄운다 — 배경 탭은 알림창이 없다는 증거다", () => {
    const h = createHarness();
    h.controller.start();

    h.controller.reshow();

    expect(h.alert).toHaveBeenCalledTimes(2);
  });

  it("해제하면 구독을 끊고 복귀해도 띄우지 않는다", () => {
    const h = createHarness();
    const stop = h.controller.start();

    stop();
    expect(h.hasListener()).toBe(false);
    h.emit("active");

    expect(h.alert).toHaveBeenCalledTimes(1);
  });

  it("기본 의존성은 react-native Alert.alert에 연결된다", () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});

    createForceUpdateAlert().show();

    expect(alertSpy).toHaveBeenCalledWith(
      FORCE_UPDATE_TITLE,
      FORCE_UPDATE_DESCRIPTION,
      [expect.objectContaining({ text: FORCE_UPDATE_CONFIRM_LABEL })],
      { cancelable: false },
    );
    alertSpy.mockRestore();
  });
});
