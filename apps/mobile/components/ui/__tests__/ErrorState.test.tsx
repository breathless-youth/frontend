import { fireEvent, render, screen } from "@testing-library/react-native";

import { ErrorState } from "../ErrorState";

describe("ErrorState", () => {
  it("메시지와 다시 시도 버튼을 그리고, 버튼이 onRetry를 호출한다", () => {
    const onRetry = jest.fn();
    render(<ErrorState message="기록을 불러오지 못했어요" onRetry={onRetry} />);

    expect(screen.getByText("기록을 불러오지 못했어요")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "다시 시도" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
