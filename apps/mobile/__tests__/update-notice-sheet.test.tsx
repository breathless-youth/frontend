import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import appJson from "../app.json";
import HomeScreen from "../app/(tabs)/index";
import { UpdateNoticeSheet } from "../components/UpdateNoticeSheet";
import {
  createMemoryUpdateNoticeStore,
  resetUpdateNoticeStore,
  setUpdateNoticeStore,
  type UpdateNoticeStore,
} from "../lib/updateNotice";

/**
 * U1 업데이트 안내 시트 (`frontend/docs/screens/SCR-U1-update-sheet.md`).
 *
 * 화면 테스트는 `app/` 밖에 둔다 — `expo-router`의 라우트 컨텍스트 정규식이 테스트 파일을
 * 걸러내지 않아 `app/` 아래에 두면 라우트로 등록된다(기존 테스트들과 같은 이유).
 *
 * 홈 내용물이 `RemoteScreen`(BY-333 2단계)으로 이관돼 더 이상 "오늘 순공시간" 같은 네이티브
 * 텍스트를 렌더하지 않는다 — 이 시트가 홈 위에 얹히는 **오버레이**라는 사실만, 웹뷰가 계속
 * 마운트돼 있는지로 확인한다.
 */

const mockExtra: Record<string, unknown> = {};

jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  useIsFocused: () => true,
}));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { extra: mockExtra, version: "1.0.0" };
    },
  },
}));

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock("../lib/userApi", () => ({ ensureUserRegistered: jest.fn(async () => null) }));

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
}));

jest.mock("react-native-webview", () => {
  /*
    eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports --
    `jest.mock` 팩토리는 상단 import보다 먼저 호이스팅돼 평가되므로 import 바인딩을 참조할 수 없다.
  */
  const ReactModule = require("react") as typeof import("react");
  const { View } = require("react-native") as typeof import("react-native");
  /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports */

  return {
    WebView: ReactModule.forwardRef(function MockWebView(
      props: Record<string, unknown>,
      ref: React.Ref<{ reload: () => void }>,
    ) {
      ReactModule.useImperativeHandle(ref, () => ({ reload: jest.fn() }));
      return ReactModule.createElement(View, props);
    }),
  };
});

const TITLE = "로그인이 곧 추가돼요";

let store: UpdateNoticeStore;

beforeEach(() => {
  for (const key of Object.keys(mockExtra)) {
    delete mockExtra[key];
  }
  mockExtra.webBaseUrl = "https://web.test";
  store = createMemoryUpdateNoticeStore(false);
  setUpdateNoticeStore(store);
  jest.clearAllMocks();
});

afterEach(() => {
  resetUpdateNoticeStore();
});

/** 홈 마운트 직후의 비동기 게이트 판정이 끝날 때까지 기다린다. */
async function settleGate() {
  await screen.findByTestId("home-webview");
}

describe("기본은 비노출 — 이 화면의 성공 기준", () => {
  it("app.json에 커밋된 플래그 값이 false다", () => {
    expect(appJson.expo.extra.updateNoticeEnabled).toBe(false);
  });

  it("플래그가 없으면 홈에 아무것도 렌더하지 않는다 — 딤조차 그리지 않는다", async () => {
    render(<HomeScreen />);
    await settleGate();

    expect(screen.queryByText(TITLE)).toBeNull();
    expect(screen.queryByTestId("update-notice-sheet")).toBeNull();
    expect(screen.queryByTestId("update-notice-dim")).toBeNull();
  });

  it("플래그가 false면 아직 안 봤어도 렌더하지 않는다", async () => {
    mockExtra.updateNoticeEnabled = false;

    render(<HomeScreen />);
    await settleGate();

    expect(screen.queryByTestId("update-notice-sheet")).toBeNull();
  });

  it("플래그가 켜져 있어도 이미 봤으면 렌더하지 않는다 (1회 노출)", async () => {
    mockExtra.updateNoticeEnabled = true;
    setUpdateNoticeStore(createMemoryUpdateNoticeStore(true));

    render(<HomeScreen />);
    await settleGate();

    expect(screen.queryByTestId("update-notice-sheet")).toBeNull();
  });

  it("홈은 그대로 렌더된다 — 시트가 홈 웹뷰를 가리거나 언마운트하지 않는다", async () => {
    render(<HomeScreen />);
    await settleGate();

    expect(screen.getByTestId("home-webview")).toBeTruthy();
  });
});

describe("플래그를 켰을 때 — Figma 확정 문구 그대로", () => {
  beforeEach(() => {
    mockExtra.updateNoticeEnabled = true;
  });

  it("홈 진입 직후 시트가 올라온다", async () => {
    render(<HomeScreen />);

    expect(await screen.findByText(TITLE)).toBeTruthy();
    expect(
      screen.getByText("다음 업데이트부터 Google·Apple 계정으로 로그인할 수 있어요."),
    ).toBeTruthy();
    expect(screen.getByText("지금까지의 기록도 로그인하면 계정에 그대로 이어져요.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "확인" })).toBeTruthy();
  });

  it("'확인'이 유일한 닫기 경로다 — 누르면 닫히고 '봤음'이 저장된다", async () => {
    render(<HomeScreen />);
    await screen.findByText(TITLE);

    fireEvent.press(screen.getByRole("button", { name: "확인" }));

    await waitFor(async () => {
      await expect(store.hasSeenUpdateNotice()).resolves.toBe(true);
    });
    await waitFor(() => {
      expect(screen.queryByText(TITLE)).toBeNull();
    });
  });

  it("딤을 탭해도 닫히지 않는다 — 닫기 경로 미정이라 동작을 켜지 않았다", async () => {
    render(<HomeScreen />);
    await screen.findByText(TITLE);

    fireEvent.press(screen.getByTestId("update-notice-dim", { includeHiddenElements: true }));

    expect(screen.getByText(TITLE)).toBeTruthy();
    await expect(store.hasSeenUpdateNotice()).resolves.toBe(false);
  });
});

describe("범위 경계 — 앱 버전 업데이트 시트가 아니다", () => {
  it("스토어 이동·강제 업데이트 문구가 없고, 닫기 버튼도 없다", () => {
    render(<UpdateNoticeSheet visible onConfirm={jest.fn()} />);

    expect(screen.queryByText(/지금 업데이트/)).toBeNull();
    expect(screen.queryByText(/나중에/)).toBeNull();
    expect(screen.queryByText(/스토어/)).toBeNull();
    expect(screen.queryByText(/버전/)).toBeNull();
    expect(screen.queryByRole("button", { name: "닫기" })).toBeNull();
    // 닫는 방법은 CTA 하나뿐이다.
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("로그인 제공자는 Google·Apple만 언급한다", () => {
    render(<UpdateNoticeSheet visible onConfirm={jest.fn()} />);

    expect(screen.queryByText(/카카오|네이버/)).toBeNull();
  });
});

describe("접근성", () => {
  it("타이틀이 헤더로 먼저 읽힌다", () => {
    render(<UpdateNoticeSheet visible onConfirm={jest.fn()} />);

    expect(screen.getByRole("header", { name: TITLE })).toBeTruthy();
  });

  it("본문 전문이 잘리지 않고 노출된다 — Figma의 nowrap/clip을 따라하지 않는다", () => {
    render(<UpdateNoticeSheet visible onConfirm={jest.fn()} />);

    const body = screen.getByText("다음 업데이트부터 Google·Apple 계정으로 로그인할 수 있어요.");
    expect(body.props.numberOfLines).toBeUndefined();
    expect(body.props.ellipsizeMode).toBeUndefined();
  });

  it("딤은 장식이라 스크린리더에 노출되지 않는다", () => {
    render(<UpdateNoticeSheet visible onConfirm={jest.fn()} />);

    expect(screen.queryByTestId("update-notice-dim")).toBeNull();
    expect(screen.getByTestId("update-notice-dim", { includeHiddenElements: true })).toBeTruthy();
  });

  it("visible=false면 아무것도 렌더하지 않는다", () => {
    render(<UpdateNoticeSheet visible={false} onConfirm={jest.fn()} />);

    expect(screen.queryByTestId("update-notice-sheet")).toBeNull();
  });
});

describe("미정 3건 — 콜백 자리만 있고 기본은 무동작", () => {
  it("onDismissRequest를 넘기면 딤 탭이 그 콜백으로 흐른다", () => {
    const onDismissRequest = jest.fn();
    render(<UpdateNoticeSheet visible onConfirm={jest.fn()} onDismissRequest={onDismissRequest} />);

    fireEvent.press(screen.getByTestId("update-notice-dim", { includeHiddenElements: true }));

    expect(onDismissRequest).toHaveBeenCalledWith("dim-press");
  });

  it("넘기지 않으면 딤 탭이 아무 일도 하지 않는다", () => {
    const onConfirm = jest.fn();
    render(<UpdateNoticeSheet visible onConfirm={onConfirm} />);

    fireEvent.press(screen.getByTestId("update-notice-dim", { includeHiddenElements: true }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText(TITLE)).toBeTruthy();
  });
});
