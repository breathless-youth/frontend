import { Alert } from "react-native";

import {
  createRecommendedUpdateAlert,
  DISMISSED_VERSION_KEY,
  RECOMMENDED_UPDATE_CONFIRM_LABEL,
  RECOMMENDED_UPDATE_DESCRIPTION,
  RECOMMENDED_UPDATE_LATER_LABEL,
  RECOMMENDED_UPDATE_TITLE,
  type RecommendedUpdateAlertButton,
} from "../recommendedUpdateAlert";

/**
 * 권장 알림창은 "최신 버전당 한 번"이 핵심이다 — 어느 경로로 닫혀도 기록하고, 같은 값엔 다시 묻지 않으며,
 * 더 높은 값엔 다시 묻는다. 저장소 실패는 묻는 쪽으로 기운다.
 */

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock("../storeLink", () => ({
  openAppStore: jest.fn(() => Promise.resolve()),
}));

type AlertCall = [
  string,
  string,
  RecommendedUpdateAlertButton[],
  { cancelable: boolean; onDismiss: () => void },
];

function createHarness({
  stored = null as string | null,
  getFails = false,
  setFails = false,
} = {}) {
  const store = new Map<string, string>();
  if (stored !== null) store.set(DISMISSED_VERSION_KEY, stored);
  const storage = {
    getItemAsync: jest.fn((key: string) =>
      getFails ? Promise.reject(new Error("keychain")) : Promise.resolve(store.get(key) ?? null),
    ),
    setItemAsync: jest.fn((key: string, value: string) => {
      if (setFails) return Promise.reject(new Error("keychain"));
      store.set(key, value);
      return Promise.resolve();
    }),
  };
  const alert = jest.fn();
  const openStore = jest.fn(() => Promise.resolve());
  const controller = createRecommendedUpdateAlert({ alert, openStore, storage });
  const lastCall = () => alert.mock.calls.at(-1) as AlertCall;
  return { alert, openStore, storage, store, controller, lastCall };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("recommendedUpdateAlert (BY-586)", () => {
  it("처음 보는 최신 버전이면 두 버튼짜리 알림창을 띄운다 — 나중에(cancel)·지금 업데이트", async () => {
    const h = createHarness();

    await expect(h.controller.maybeShow("1.0.3")).resolves.toBe(true);

    const [title, message, buttons, options] = h.lastCall();
    expect(title).toBe(RECOMMENDED_UPDATE_TITLE);
    expect(message).toBe(RECOMMENDED_UPDATE_DESCRIPTION);
    expect(buttons.map((b) => b.text)).toEqual([
      RECOMMENDED_UPDATE_LATER_LABEL,
      RECOMMENDED_UPDATE_CONFIRM_LABEL,
    ]);
    expect(buttons[0].style).toBe("cancel");
    expect(options.cancelable).toBe(true);
  });

  it("같은 최신 버전에 이미 답했으면 다시 묻지 않는다", async () => {
    const h = createHarness({ stored: "1.0.3" });

    await expect(h.controller.maybeShow("1.0.3")).resolves.toBe(false);

    expect(h.alert).not.toHaveBeenCalled();
  });

  it("더 높은 최신 버전이 오면 다시 묻는다", async () => {
    const h = createHarness({ stored: "1.0.3" });

    await expect(h.controller.maybeShow("1.0.4")).resolves.toBe(true);
  });

  it("'나중에'는 그 버전을 기록만 하고 스토어를 열지 않는다", async () => {
    const h = createHarness();
    await h.controller.maybeShow("1.0.3");

    h.lastCall()[2][0].onPress();
    await flush();

    expect(h.storage.setItemAsync).toHaveBeenCalledWith(DISMISSED_VERSION_KEY, "1.0.3");
    expect(h.openStore).not.toHaveBeenCalled();
  });

  it("'지금 업데이트'는 기록하고 스토어를 연다", async () => {
    const h = createHarness();
    await h.controller.maybeShow("1.0.3");

    h.lastCall()[2][1].onPress();
    await flush();

    expect(h.storage.setItemAsync).toHaveBeenCalledWith(DISMISSED_VERSION_KEY, "1.0.3");
    expect(h.openStore).toHaveBeenCalledTimes(1);
  });

  it("Android 뒤로가기·바깥 터치(onDismiss)도 '나중에'로 기록한다", async () => {
    const h = createHarness();
    await h.controller.maybeShow("1.0.3");

    h.lastCall()[3].onDismiss();
    await flush();

    expect(h.store.get(DISMISSED_VERSION_KEY)).toBe("1.0.3");
  });

  it("기록을 못 읽으면 경고만 남기고 묻는다", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const h = createHarness({ getFails: true });

    await expect(h.controller.maybeShow("1.0.3")).resolves.toBe(true);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("다시 묻는다"), expect.any(Error));
    warn.mockRestore();
  });

  it("기록 저장이 실패해도 throw하지 않는다", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const h = createHarness({ setFails: true });
    await h.controller.maybeShow("1.0.3");

    expect(() => h.lastCall()[2][0].onPress()).not.toThrow();
    await flush();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("저장 실패"), expect.any(Error));
    warn.mockRestore();
  });

  it("기본 의존성은 react-native Alert.alert와 SecureStore에 연결된다", async () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});

    await createRecommendedUpdateAlert().maybeShow("1.0.3");

    expect(alertSpy).toHaveBeenCalledWith(
      RECOMMENDED_UPDATE_TITLE,
      RECOMMENDED_UPDATE_DESCRIPTION,
      expect.arrayContaining([expect.objectContaining({ text: RECOMMENDED_UPDATE_LATER_LABEL })]),
      expect.objectContaining({ cancelable: true }),
    );
    alertSpy.mockRestore();
  });
});
