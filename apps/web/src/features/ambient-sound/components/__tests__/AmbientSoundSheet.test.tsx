import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import type { AmbientSound } from "../../catalog";
import { AmbientSoundSheet } from "../AmbientSoundSheet";
import type { AmbientSoundSheetProps } from "../AmbientSoundSheet";

const catalog: AmbientSound[] = [
  { id: "white", kind: "synth", label: "백색소음" },
  { id: "pink", kind: "synth", label: "핑크노이즈" },
  { id: "brown", kind: "synth", label: "브라운노이즈" },
  { id: "rain", kind: "file", label: "빗소리", file: "rain.mp3" },
];

function renderSheet(overrides: Partial<AmbientSoundSheetProps> = {}) {
  const props: AmbientSoundSheetProps = {
    open: true,
    container: null,
    triggerRef: createRef<HTMLButtonElement>(),
    catalog,
    mix: {},
    duckEnabled: true,
    blocked: false,
    onToggleSound: vi.fn(),
    onChangeLevel: vi.fn(),
    onSetDuckEnabled: vi.fn(),
    onOpenChange: vi.fn(),
    ...overrides,
  };
  const { baseElement } = render(<AmbientSoundSheet {...props} />);
  return { ...props, baseElement };
}

describe("AmbientSoundSheet — 음량 조절", () => {
  it("제목이 '배경음'인 다이얼로그로 열린다", () => {
    renderSheet();

    expect(screen.getByRole("dialog", { name: "배경음" })).toBeInTheDocument();
  });

  /**
   * 네이티브 탭 바 차단(`nativeModalOverlay.ts`)이 `aria-modal="true"` 의 존재 여부만 본다.
   * Radix 가 이 속성을 만들어 주지 않으므로 빠지면 시트 아래 탭 바가 계속 눌린다.
   */
  it("aria-modal 을 달아 네이티브 탭 바 차단이 걸리게 한다", () => {
    renderSheet();

    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
  });

  /** 카메라 위라 딤도 세션 값이어야 한다. 전역 `--dim` 은 라이트 테마에서 뒤가 비친다. */
  it("딤이 전역 값이 아니라 세션 값을 쓴다", () => {
    const { baseElement } = renderSheet();

    const classes = [...baseElement.querySelectorAll("div")].map((el) => el.className);
    expect(classes.some((c) => c.includes("var(--session-dim)"))).toBe(true);
    expect(classes.some((c) => c.includes("var(--dim)"))).toBe(false);
  });

  it("닫혀 있으면 아무것도 그리지 않는다", () => {
    renderSheet({ open: false });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("아무것도 켜지지 않았으면 열린 탭의 슬라이더가 전부 0 이다", () => {
    renderSheet();

    const sliders = screen.getAllByRole("slider");
    expect(sliders).toHaveLength(3);
    for (const slider of sliders) expect(slider).toHaveValue("0");
    for (const sound of catalog.filter((s) => s.kind === "synth")) {
      expect(screen.getByRole("button", { name: sound.label })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    }
  });

  /**
   * 합성 노이즈와 녹음된 장면 소리를 한 목록에 쏟으면 성격이 다른 것이 섞여 고르기 어렵다.
   * 개수는 탭을 열어 보지 않고도 뭐가 몇 개인지 알려 준다.
   */
  it("노이즈와 주변 소리 탭으로 나뉘고 각 탭에 개수가 붙는다", () => {
    renderSheet();

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["노이즈3", "주변 소리1"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
  });

  it("탭을 바꾸면 그 갈래의 소리만 보인다", async () => {
    renderSheet();

    expect(screen.getByRole("button", { name: "백색소음" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "빗소리" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: /주변 소리/ }));

    expect(screen.getByRole("button", { name: "빗소리" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "백색소음" })).not.toBeInTheDocument();
  });

  /** 카탈로그를 한쪽만 받았을 때 누를 것이 없는 빈 탭이 남으면 안 된다. */
  it("소리가 없는 갈래는 탭도 만들지 않는다", () => {
    renderSheet({ catalog: catalog.filter((s) => s.kind === "synth") });

    expect(screen.getAllByRole("tab")).toHaveLength(1);
    expect(screen.getByRole("tab")).toHaveTextContent("노이즈3");
  });

  it("소리마다 아이콘과 이름이 한 줄에 나란히 놓인다", () => {
    renderSheet();

    for (const sound of catalog.filter((s) => s.kind === "synth")) {
      const row = screen.getByRole("button", { name: sound.label });
      expect(row).toHaveTextContent(sound.label);
      expect(row.querySelector("svg")).not.toBeNull();
    }
  });

  it("켜진 소리의 줄은 aria-pressed 가 true 다", async () => {
    renderSheet({ mix: { rain: 70 } });

    await userEvent.click(screen.getByRole("tab", { name: /주변 소리/ }));

    expect(screen.getByRole("button", { name: "빗소리" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("slider", { name: "빗소리 음량" })).toHaveValue("70");
  });

  it("이름 줄을 누르면 onToggleSound(id) 를 부른다", async () => {
    const props = renderSheet({ mix: { white: 60 } });

    await userEvent.click(screen.getByRole("button", { name: "백색소음" }));

    expect(props.onToggleSound).toHaveBeenCalledWith("white");
  });

  it("슬라이더를 움직이면 onChangeLevel(id, 숫자) 를 부른다", () => {
    const props = renderSheet();

    fireEvent.change(screen.getByRole("slider", { name: "백색소음 음량" }), {
      target: { value: "25" },
    });

    expect(props.onChangeLevel).toHaveBeenCalledWith("white", 25);
  });

  /** 겹쳐 켜는 개수에 상한이 없다. 상한 안내가 되살아나면 여기서 잡는다. */
  it("소리를 넷 다 켜도 상한 안내가 없다", () => {
    renderSheet({ mix: { white: 60, pink: 60, brown: 60, rain: 60 } });

    expect(screen.queryByText(/최대/)).not.toBeInTheDocument();
  });

  it("저장된 믹스가 켜진 채 자동 재생이 막히면 다시 올리라는 안내 한 줄을 띄운다", () => {
    renderSheet({ mix: { white: 60 }, blocked: true });

    expect(
      screen.getByText("자동 재생이 막혀 있어요. 음량을 0 으로 내렸다 다시 올리면 들려요"),
    ).toBeInTheDocument();
  });

  it("막히지 않았으면 자동 재생 안내가 없다", () => {
    renderSheet({ mix: { white: 60 } });

    expect(screen.queryByText(/자동 재생/)).not.toBeInTheDocument();
  });

  /**
   * 멈춘 세션에서 슬라이더를 올려도 소리가 안 나는 것은 정상인데, 말해 주지 않으면 고장으로
   * 읽힌다. 실제로 그렇게 헷갈린 적이 있다. 터치 기기에서는 hover 가 없어 탭으로 열려야 한다.
   */
  /**
   * 시트를 열면 Radix 가 첫 포커스를 안내 버튼에 준다. 툴팁이 포커스에도 열리면 시트를
   * 열자마자 떠 있고, 그 상태의 Escape 가 시트가 아니라 툴팁을 닫아 먹통처럼 보인다.
   */
  it("시트를 열었다고 툴팁이 저절로 뜨지 않는다", () => {
    renderSheet();

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("제목 옆 안내를 누르면 일시정지 때 소리가 없다는 툴팁이 뜬다", async () => {
    renderSheet();

    expect(screen.queryByText(/일시정지 중에는/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "배경음 안내" }));

    expect(await screen.findByText("일시정지 중에는 배경음이 들리지 않아요")).toBeInTheDocument();
  });

  it("카탈로그가 비어 있으면 목록 대신 불러오지 못했다는 안내 한 줄을 띄운다", () => {
    renderSheet({ catalog: [] });

    expect(screen.getByText("배경음 목록을 불러오지 못했어요")).toBeInTheDocument();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  /** 조합 저장은 걷어냈다. 입력칸이 되살아나면 여기서 잡는다. */
  it("조합을 저장하는 입력과 버튼이 없다", () => {
    renderSheet({ mix: { white: 60 } });

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /저장/ })).not.toBeInTheDocument();
  });

  it("바이노럴 행에만 안내 버튼이 있고 눌러야 문구가 뜬다", async () => {
    renderSheet({
      catalog: [
        { id: "binaural", kind: "synth", group: "noise", label: "바이노럴 비트" },
        { id: "white", kind: "synth", group: "noise", label: "백색소음" },
      ],
    });

    // 다른 소리에는 안내 버튼이 없다.
    expect(screen.queryByRole("button", { name: "백색소음 안내" })).not.toBeInTheDocument();
    // 열기 전에는 문구가 화면에 없다.
    expect(screen.queryByText("이어폰을 껴야 제대로 들려요")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "바이노럴 비트 안내" }));
    expect(await screen.findByText("이어폰을 껴야 제대로 들려요")).toBeInTheDocument();
  });
});

describe("AmbientSoundSheet — 연동 토글·닫기", () => {
  it("집중 연동 스위치가 상태를 드러내고 반대 값으로 onSetDuckEnabled 를 부른다", async () => {
    const props = renderSheet({ duckEnabled: true });
    const toggle = screen.getByRole("switch", { name: "집중 연동" });
    expect(toggle).toHaveAttribute("aria-checked", "true");

    await userEvent.click(toggle);

    expect(props.onSetDuckEnabled).toHaveBeenCalledWith(false);
  });

  it("집중 연동 설명이 '집중 상태가 아닐 때는 소리를 낮춰요' 다", () => {
    renderSheet();

    expect(screen.getByText("집중 상태가 아닐 때는 소리를 낮춰요")).toBeInTheDocument();
  });

  /** 닫는 길이 셋이다. 하나라도 빠지면 시트에 갇히는 사용자가 생긴다. */
  it("X 버튼과 Escape 로 닫힌다", async () => {
    const props = renderSheet();

    await userEvent.click(screen.getByRole("button", { name: "닫기" }));
    await userEvent.keyboard("{Escape}");

    expect(props.onOpenChange).toHaveBeenCalledTimes(2);
    expect(props.onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("본문 아래에 큰 닫기 버튼을 따로 두지 않는다", () => {
    renderSheet();

    // 제목 줄의 X 하나뿐이어야 한다.
    expect(screen.getAllByRole("button", { name: "닫기" })).toHaveLength(1);
  });

  it("바깥을 누르면 닫힌다", async () => {
    const { baseElement, ...props } = renderSheet();

    const overlay = baseElement.querySelector<HTMLElement>('[class*="session-dim"]');
    expect(overlay).not.toBeNull();
    await userEvent.click(overlay as HTMLElement);

    expect(props.onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("열리면 시트 안으로 포커스가 들어간다", () => {
    renderSheet();

    expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
  });

  /**
   * Radix 는 `Sheet.Trigger` 를 쓸 때만 포커스를 되돌린다. 진입 버튼이 세션 레이어 안에 따로
   * 있어 Trigger 로 감쌀 수 없으므로 돌려줄 자리를 직접 넘긴다. 빠뜨리면 포커스가 body 로
   * 빠져 키보드 사용자가 처음부터 탭을 돌아야 한다.
   */
  it("닫으면 넘겨받은 버튼으로 포커스가 돌아간다", async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      const triggerRef = useRef<HTMLButtonElement>(null);
      return (
        <>
          <button type="button" ref={triggerRef} onClick={() => setOpen(true)}>
            배경음
          </button>
          <AmbientSoundSheet
            open={open}
            container={null}
            triggerRef={triggerRef}
            catalog={catalog}
            mix={{}}
            duckEnabled
            blocked={false}
            onToggleSound={vi.fn()}
            onChangeLevel={vi.fn()}
            onSetDuckEnabled={vi.fn()}
            onOpenChange={setOpen}
          />
        </>
      );
    }
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "배경음" });

    await userEvent.click(trigger);
    await userEvent.keyboard("{Escape}");

    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
