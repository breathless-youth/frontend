import { STICKER_URL } from "./photoFrame";
import type { TimelapseAspect, TimelapseInfoKey } from "./timelapseSettings";

type InfoLine = { key: TimelapseInfoKey; text: string; className: string };

const SAMPLE_DDAY_LABEL = "D-108 · 2027 수능";

const SMALL_LINE = "text-[7.5px] font-semibold";

/** 왼쪽 위 정보 줄의 표시 순서와 예시 값 */
const TOP_LINES = [
  { key: "dday", text: SAMPLE_DDAY_LABEL, className: "text-[10px] font-bold" },
  { key: "streak", text: "5일 연속 공부 🔥", className: SMALL_LINE },
] as const satisfies readonly InfoLine[];

/** 오른쪽 아래 정보 줄의 표시 순서와 예시 값 */
const BOTTOM_LINES = [
  { key: "date", text: "10월 5일", className: SMALL_LINE },
  { key: "focusTime", text: "순공 2시간 14분", className: "text-[13px] font-extrabold" },
  { key: "focusRate", text: "집중률 80%", className: SMALL_LINE },
] as const satisfies readonly InfoLine[];

const INFO_TEXT = "text-white [text-shadow:0_0.5px_2px_rgba(0,0,0,0.45)]";

/**
 * 흐름 바 예시 12칸
 *
 * 순공, 자동 멈춤, 일시정지 색이 한 번씩은 보이도록 섞었다.
 * 영상 위에 그리는 색이라 테마와 관계없이 고정이다.
 */
const FLOW_SEGMENTS = [
  "#5a90ea",
  "#5a90ea",
  "#5a90ea",
  "#5a90ea",
  "#ff9e1b",
  "#5a90ea",
  "#5a90ea",
  "#5a90ea",
  "#5a90ea",
  "#b3bccb",
  "#5a90ea",
  "#5a90ea",
] as const;

type TimelapsePreviewProps = {
  aspect: TimelapseAspect;
  info: Readonly<Record<TimelapseInfoKey, boolean>>;
  /** 사용자의 D-Day. 아직 모르면 예시 값을 쓴다. */
  ddayLabel?: string;
};

/**
 * 설정 화면의 타임랩스 미리보기
 *
 * 실제 사진 대신 빈 예시 화면 위에 켠 요소만 예시 값으로 그린다.
 * D-Day만 사용자가 정한 값을 받아 쓴다.
 * 영상 위 요소라 색은 테마를 따르지 않는다.
 * 같은 내용을 스위치가 읽어 주므로 스크린리더에서는 숨긴다.
 */
export function TimelapsePreview({
  aspect,
  info,
  ddayLabel = SAMPLE_DDAY_LABEL,
}: TimelapsePreviewProps) {
  const topLines = TOP_LINES.filter((line) => info[line.key]);
  const bottomLines = BOTTOM_LINES.filter((line) => info[line.key]);
  const empty =
    !info.faceMask && !info.flowBar && topLines.length === 0 && bottomLines.length === 0;

  return (
    <div
      data-testid="timelapse-preview"
      aria-hidden="true"
      className={`relative overflow-hidden rounded-xl bg-[#3b4655] ${
        aspect === "9:16" ? "h-[320px] w-[180px]" : "aspect-video w-full"
      }`}
    >
      {empty && (
        <p className="absolute inset-0 flex items-center justify-center text-xs text-white/60">
          공부 중 화면
        </p>
      )}
      {info.faceMask && (
        <img
          src={STICKER_URL}
          alt=""
          className="absolute top-[40%] left-1/2 size-16 -translate-x-1/2 -translate-y-1/2"
        />
      )}
      {topLines.length > 0 && (
        <div
          data-testid="timelapse-preview-top"
          className={`absolute top-3 left-2.5 flex flex-col items-start gap-px ${INFO_TEXT}`}
        >
          {topLines.map((line) => (
            <p key={line.key} className={line.className}>
              {line.key === "dday" ? ddayLabel : line.text}
            </p>
          ))}
        </div>
      )}
      <div className="absolute inset-0 flex flex-col items-end justify-end gap-[5px] px-2.5 pt-3 pb-2.5">
        {bottomLines.length > 0 && (
          <div className={`flex flex-col items-end gap-px ${INFO_TEXT}`}>
            {bottomLines.map((line) => (
              <p key={line.key} className={line.className}>
                {line.text}
              </p>
            ))}
          </div>
        )}
        {info.flowBar && (
          <div
            data-testid="timelapse-preview-flow-bar"
            className="flex h-1 w-full overflow-hidden rounded-[2px] bg-white/25"
          >
            {FLOW_SEGMENTS.map((color, index) => (
              // 고정 예시 배열이라 순서가 바뀌지 않는다.
              <div key={index} className="h-full flex-1" style={{ backgroundColor: color }} />
            ))}
          </div>
        )}
      </div>
      <span className="absolute top-3 right-3 rounded-[4px] bg-black/35 px-[5px] py-[2.5px] text-[8px] font-extrabold text-[#3671cf]">
        포커스 메이커스
      </span>
    </div>
  );
}
