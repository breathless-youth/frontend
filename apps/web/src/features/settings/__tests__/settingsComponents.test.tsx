import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PermissionToggle } from "../PermissionToggle";
import { SettingsRow } from "../SettingsRow";
import { SettingsSection } from "../SettingsSection";

describe("SettingsRow", () => {
  it("onPress가 없으면 button이 아니라 div로 렌더한다", () => {
    render(<SettingsRow label="측정 기준 안내" />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("측정 기준 안내")).toBeInTheDocument();
  });

  it("onPress가 있으면 button으로 렌더하고 라벨을 합성한다", () => {
    render(<SettingsRow label="카메라 권한" sublabel="허용됨" onPress={() => {}} />);

    const button = screen.getByRole("button", { name: "카메라 권한, 허용됨" });
    expect(button).toBeInTheDocument();
  });

  it("accessibilityLabel을 명시하면 합성 대신 그 값을 쓴다", () => {
    render(
      <SettingsRow
        label="카메라 권한"
        sublabel="허용됨"
        onPress={() => {}}
        accessibilityLabel="카메라 권한 허용됨, 설정에서 변경"
      />,
    );

    expect(
      screen.getByRole("button", { name: "카메라 권한 허용됨, 설정에서 변경" }),
    ).toBeInTheDocument();
  });

  it("sublabel이 없으면 label만으로 라벨을 만든다", () => {
    render(<SettingsRow label="앱 버전" onPress={() => {}} />);

    expect(screen.getByRole("button", { name: "앱 버전" })).toBeInTheDocument();
  });

  it("trailing: toggle을 렌더한다", () => {
    const { container } = render(
      <SettingsRow label="카메라 권한" trailing={{ kind: "toggle", granted: true }} />,
    );
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });

  it("trailing: chevron을 렌더한다", () => {
    const { container } = render(
      <SettingsRow label="측정 기준 안내" trailing={{ kind: "chevron" }} />,
    );
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("trailing: external을 렌더한다", () => {
    const { container } = render(<SettingsRow label="문의하기" trailing={{ kind: "external" }} />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("trailing: value를 렌더한다", () => {
    render(<SettingsRow label="앱 버전" trailing={{ kind: "value", value: "1.0.0" }} />);
    expect(screen.getByText("1.0.0")).toBeInTheDocument();
  });
});

describe("SettingsSection", () => {
  it("행 사이에 헤어라인을 배치하고 라벨·캡션을 렌더한다", () => {
    render(
      <SettingsSection label="일반" caption="캡션 문구">
        <SettingsRow label="행 1" />
        <SettingsRow label="행 2" />
      </SettingsSection>,
    );

    expect(screen.getByText("일반")).toBeInTheDocument();
    expect(screen.getByText("캡션 문구")).toBeInTheDocument();
    expect(screen.getByText("행 1")).toBeInTheDocument();
    expect(screen.getByText("행 2")).toBeInTheDocument();
  });
});

describe("PermissionToggle", () => {
  it("표시 전용이라 button/switch 역할이 없다", () => {
    render(<PermissionToggle granted={true} />);
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
