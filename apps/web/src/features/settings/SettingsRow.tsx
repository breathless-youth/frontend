import { PermissionToggle } from "./PermissionToggle";

/**
 * S6 설정의 리스트 행 (Figma `Settings / Row` 43:117).
 *
 * Figma의 5개 variant(`Toggle`·`ChevronSub`·`Chevron`·`External`·`Value`)는 여기서
 * **트레일링 4종 × 보조 문구 유무**로 표현된다 — `ChevronSub`는 `chevron` + `sublabel`이다.
 *
 * 행 사이 1px 헤어라인은 **행이 아니라 카드가 그린다**(Figma 컴포넌트 설명: "행 사이 1px
 * 헤어라인은 화면에서 배치") — `SettingsSection` 참고.
 *
 * 높이를 고정하지 않는다. Figma 실측(47 / 59 / 65px)은 py 14px + 콘텐츠 높이의 결과이고,
 * 시스템 폰트 확대 시 행이 함께 늘어나야 문구가 잘리지 않는다.
 */

export type SettingsRowTrailing =
  /** OS 카메라 권한 상태 표시(조작 불가). */
  | { kind: "toggle"; granted: boolean }
  /** 앱 내 이동. */
  | { kind: "chevron" }
  /** 앱 밖(외부 브라우저)으로 나감. */
  | { kind: "external" }
  /** 값 표시만 — 누를 수 없다. */
  | { kind: "value"; value: string };

type SettingsRowProps = {
  label: string;
  /** 라벨 아래 보조 문구. 폰트 확대 시 두 줄이 될 수 있어 줄바꿈을 막지 않는다. */
  sublabel?: string;
  /** 생략하면 트레일링 자리를 비운다 — 상태를 아직 모르는 행(카메라 권한 조회 전)이 쓴다. */
  trailing?: SettingsRowTrailing;
  /**
   * 클릭 동작. **넘기지 않으면 행이 button으로 노출되지 않는다** — 목적지가 확정되지 않은 행을
   * 버튼처럼 읽어주면 스크린리더 사용자에게 없는 화면을 있다고 말하는 셈이다
   * (S1 홈 `StatCard`·S5 세션 아이템과 같은 방어 규칙).
   */
  onPress?: () => void;
  /**
   * 지정하지 않으면 `label`(+ `sublabel`)을 합성해 쓴다. 상태를 함께 읽어야 하는
   * 행(카메라 권한)만 넘긴다.
   *
   * ⚠️ 합성이 필요한 이유: button 전체가 하나의 접근성 요소로 읽히는데, `aria-label`을
   * 명시하면 자식 텍스트를 순회해 만들던 기본 라벨이 통째로 덮어써진다. 라벨만 넘기면
   * `sublabel`이 화면에는 보이지만 스크린리더에서는 사라진다(`SettingsRow`의 `sublabel`은
   * `측정 기준 안내` 행의 싱글룸 프라이버시 문구다).
   */
  accessibilityLabel?: string;
};

/** 최소 44px 터치 타겟 — 실측 높이(47/59/65)가 이미 넘지만 폰트 축소 상황의 바닥값으로 둔다. */
const ROW_CLASS_NAME = "min-h-11 flex w-full flex-row items-center justify-between gap-3 py-[14px]";

function IconChevronRight({ size = 12 }: { size?: number }) {
  // 원본 비율 7×12 — size는 높이 기준으로 두고 너비를 비율로 맞춘다.
  return (
    <svg width={(size * 7) / 12} height={size} viewBox="0 0 7 12" fill="none" aria-hidden="true">
      <path
        d="M0.928589 0.857147L6.07145 6L0.928589 11.1429"
        stroke="#8B95A1"
        strokeWidth={1.54286}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconExternalLink({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M4.71428 2.14285H2.14285C1.91552 2.14285 1.6975 2.23316 1.53676 2.3939C1.37601 2.55465 1.28571 2.77267 1.28571 3V9.85714C1.28571 10.0845 1.37601 10.3025 1.53676 10.4632C1.6975 10.624 1.91552 10.7143 2.14285 10.7143H8.99999C9.22732 10.7143 9.44534 10.624 9.60608 10.4632C9.76683 10.3025 9.85713 10.0845 9.85713 9.85714V7.28571"
        stroke="#8B95A1"
        strokeWidth={1.28571}
        strokeLinecap="round"
      />
      <path
        d="M6.85712 1.28572H10.7143V5.14286M10.4571 1.54286L5.82855 6.17143"
        stroke="#8B95A1"
        strokeWidth={1.28571}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RowTrailing({ trailing }: { trailing: SettingsRowTrailing }) {
  switch (trailing.kind) {
    case "toggle":
      return <PermissionToggle granted={trailing.granted} />;
    case "chevron":
      return <IconChevronRight size={12} />;
    case "external":
      return <IconExternalLink size={12} />;
    case "value":
      return (
        <span className="text-text-tertiary shrink-0 text-[15px] leading-[18px]">
          {trailing.value}
        </span>
      );
  }
}

export function SettingsRow({
  label,
  sublabel,
  trailing,
  onPress,
  accessibilityLabel,
}: SettingsRowProps) {
  const content = (
    <>
      {/* `shrink`가 있어야 라벨이 길어질 때 트레일링을 밀어내지 않고 접힌다. */}
      <div className="flex shrink flex-col items-start gap-[3px]">
        <span className="text-foreground text-base leading-[19px]">{label}</span>
        {sublabel !== undefined && (
          <span className="text-text-tertiary text-xs leading-[15px]">{sublabel}</span>
        )}
      </div>
      {trailing !== undefined && <RowTrailing trailing={trailing} />}
    </>
  );

  if (onPress === undefined) {
    return <div className={ROW_CLASS_NAME}>{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={accessibilityLabel ?? (sublabel === undefined ? label : `${label}, ${sublabel}`)}
      className={ROW_CLASS_NAME}
    >
      {content}
    </button>
  );
}
