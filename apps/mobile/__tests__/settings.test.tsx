import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import Constants from "expo-constants";
import { router } from "expo-router";
import { Linking } from "react-native";

import SettingsScreen from "../app/(tabs)/settings";
import { type CameraPermissionStatus, setCameraPermissionAdapter } from "../lib/cameraPermission";

/**
 * 화면 테스트는 `app/` 밖에 둔다 — `expo-router`의 라우트 컨텍스트 정규식이 `__tests__`·
 * `.test.tsx`를 걸러내지 않아 `app/` 아래에 두면 테스트 파일이 라우트로 등록된다
 * (`__tests__/records.test.tsx`와 같은 이유).
 */

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { version: "0.0.0" } },
}));

const mockedConstants = Constants as unknown as { expoConfig: { version?: string } | null };

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), navigate: jest.fn(), back: jest.fn(), replace: jest.fn() },
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
}));

/** 어댑터를 교체해 권한 상태를 재현한다 — 네이티브 `expo-camera`를 건드리지 않는다. */
function stubPermission(status: CameraPermissionStatus) {
  setCameraPermissionAdapter({
    getStatus: () => Promise.resolve(status),
    request: () => Promise.resolve(status),
  });
}

/**
 * 화면은 마운트 직후 카메라 권한을 비동기로 조회한다. 그 결과가 도착하기 전에 단정하면
 * 상태 갱신이 `act()` 밖에서 일어나 경고가 난다 — 조회가 끝난 뒤부터 검사한다.
 */
async function renderSettings() {
  render(<SettingsScreen />);
  await screen.findByRole("button", { name: /^카메라 권한, 허용/ });
}

beforeEach(() => {
  mockedConstants.expoConfig = { version: "1.0.0" };
  jest.clearAllMocks();
  jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
  jest.spyOn(Linking, "openURL").mockResolvedValue(true);
  stubPermission("granted");
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("S6 · 설정", () => {
  it("3개 그룹 7개 행을 확정 문구 그대로 보여준다", async () => {
    await renderSettings();

    expect(screen.getByText("설정")).toBeTruthy();

    expect(screen.getByText("측정")).toBeTruthy();
    expect(screen.getByText("카메라 권한")).toBeTruthy();
    expect(screen.getByText("측정 기준 안내")).toBeTruthy();
    expect(
      screen.getByText("자리 이탈 · 휴대폰 사용 · 기기 조작을 기기 안에서만 측정해요"),
    ).toBeTruthy();
    expect(screen.getByText("권한은 시스템 설정에서 바꿀 수 있어요")).toBeTruthy();

    expect(screen.getByText("지원")).toBeTruthy();
    expect(screen.getByText("문의하기")).toBeTruthy();

    expect(screen.getByText("약관 · 정보")).toBeTruthy();
    expect(screen.getByText("이용약관")).toBeTruthy();
    expect(screen.getByText("개인정보처리방침")).toBeTruthy();
    expect(screen.getByText("오픈소스 라이선스")).toBeTruthy();
    expect(screen.getByText("버전 정보")).toBeTruthy();
  });

  it("V1.0 인벤토리에 없는 항목을 만들지 않는다 (로그인·계정·알림)", async () => {
    await renderSettings();

    for (const absent of ["로그인", "로그아웃", "계정 삭제", "알림", "알림 설정", "프로필"]) {
      expect(screen.queryByText(absent)).toBeNull();
    }
  });

  it("싱글룸 문구만 쓴다 — 멀티룸 프라이버시 문구를 가져오지 않는다", async () => {
    await renderSettings();

    expect(screen.queryByText(/서버로 전송되지/)).toBeNull();
    expect(screen.queryByText(/AI 분석용 원본 프레임/)).toBeNull();
  });

  it("카메라 권한 행은 OS 권한 상태를 텍스트로 읽어주고 시스템 설정을 연다", async () => {
    render(<SettingsScreen />);

    const row = await screen.findByRole("button", {
      name: "카메라 권한, 허용됨, 시스템 설정 열기",
    });
    fireEvent.press(row);

    expect(Linking.openSettings).toHaveBeenCalledTimes(1);
    // 설정 탭의 카메라 권한 행은 S2-3(권한 거부 안내)으로 보내지 않는다.
    expect(router.push).not.toHaveBeenCalled();
  });

  it("권한이 거부돼 있으면 거부 상태를 그대로 읽어준다 (Figma 예시값을 굳혀 쓰지 않는다)", async () => {
    stubPermission("denied");
    render(<SettingsScreen />);

    expect(
      await screen.findByRole("button", { name: "카메라 권한, 허용 안 됨, 시스템 설정 열기" }),
    ).toBeTruthy();
  });

  it("조회에 실패하면 허용/거부 어느 쪽으로도 단정하지 않는다", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    setCameraPermissionAdapter({
      getStatus: () => Promise.reject(new Error("native unavailable")),
      request: jest.fn(),
    });
    render(<SettingsScreen />);

    // 상태 없는 라벨만 남고, 색으로만 상태를 전하는 토글도 그려지지 않는다.
    expect(screen.getByRole("button", { name: "카메라 권한, 시스템 설정 열기" })).toBeTruthy();
    await waitFor(() => {
      expect(console.warn).toHaveBeenCalled();
    });
    expect(screen.queryByRole("button", { name: /허용/ })).toBeNull();
  });

  it("토글은 조작 컨트롤이 아니다 — switch 역할로 노출되지 않는다", async () => {
    await renderSettings();

    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("측정 기준 안내는 문구를 복제하지 않고 온보딩 가이드로 재진입시킨다", async () => {
    await renderSettings();

    // 행 전체가 하나의 접근성 요소라 서브 문구(싱글룸 프라이버시 고지)까지 라벨에 담겨야 한다 —
    // `accessibilityLabel`을 라벨만으로 지정하면 스크린리더에서 서브 문구가 통째로 사라진다.
    fireEvent.press(
      screen.getByRole("button", {
        name: "측정 기준 안내, 자리 이탈 · 휴대폰 사용 · 기기 조작을 기기 안에서만 측정해요",
      }),
    );

    expect(router.push).toHaveBeenCalledWith({
      pathname: "/onboarding-guide",
      params: { entry: "settings" },
    });
  });

  it("목적지가 미정인 4개 행은 버튼으로 노출되지 않는다 (탭 no-op)", async () => {
    await renderSettings();

    for (const label of ["문의하기", "이용약관", "개인정보처리방침", "오픈소스 라이선스"]) {
      expect(screen.queryByRole("button", { name: label })).toBeNull();
    }

    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it("버전은 app 설정에서 읽는다 — 하드코딩하지 않는다", async () => {
    mockedConstants.expoConfig = { version: "1.4.2" };
    await renderSettings();

    expect(screen.getByText("1.4.2")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "버전 정보" })).toBeNull();
  });
});
