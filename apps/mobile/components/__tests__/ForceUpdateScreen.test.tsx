import { fireEvent, render, screen } from "@testing-library/react-native";

import {
  FORCE_UPDATE_CONFIRM_LABEL,
  FORCE_UPDATE_DESCRIPTION,
  FORCE_UPDATE_TITLE,
  ForceUpdateScreen,
} from "../ForceUpdateScreen";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

describe("ForceUpdateScreen (BY-586)", () => {
  it("BY-533 확정 카피를 문자 단위로 그린다 — 웹 copy.ts와 같아야 한다", () => {
    render(<ForceUpdateScreen onUpdate={jest.fn()} />);

    expect(screen.getByRole("header", { name: "업데이트가 필요해요" })).toBeTruthy();
    expect(screen.getByText("원활한 이용을 위해 최신 버전으로 업데이트해 주세요.")).toBeTruthy();
    expect(FORCE_UPDATE_TITLE).toBe("업데이트가 필요해요");
    expect(FORCE_UPDATE_DESCRIPTION).toBe("원활한 이용을 위해 최신 버전으로 업데이트해 주세요.");
    expect(FORCE_UPDATE_CONFIRM_LABEL).toBe("지금 업데이트");
  });

  it("확인 버튼만 있고 누르면 onUpdate를 부른다 — 닫기·나중에는 없다", () => {
    const onUpdate = jest.fn();
    render(<ForceUpdateScreen onUpdate={onUpdate} />);

    expect(screen.getAllByRole("button")).toHaveLength(1);
    fireEvent.press(screen.getByRole("button", { name: "지금 업데이트" }));
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });
});
