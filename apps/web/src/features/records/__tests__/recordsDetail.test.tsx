import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { StudySessionListResponse, StudySessionSummary, SubjectRef } from "@focusmakers/types";

import { DayDetailCard } from "../DayDetailCard";
import { SessionDetailSheet } from "../SessionDetailSheet";
import { Timetable } from "../Timetable";
import { dayTimetable } from "../recordsTimetable";

// KST 07:30~08:16 (2026-09-18) = UTC 2026-09-17T22:30~23:16. dateKey는 KST 날짜다.
const DATE = "2026-09-18";
const STARTED = "2026-09-17T22:30:00Z";
const ENDED = "2026-09-17T23:16:00Z";

const subjects: SubjectRef[] = [
  { id: 1, name: "영어", colorIndex: 0, deleted: false },
  { id: 2, name: "수학", colorIndex: 5, deleted: true },
];

function session(over: Partial<StudySessionSummary> = {}): StudySessionSummary {
  return {
    id: 1,
    statDate: DATE,
    startedAt: STARTED,
    endedAt: ENDED,
    studySec: 52 * 60,
    focusSec: 44 * 60,
    focusRate: 96,
    eventCounts: { AWAY: 0, PHONE: 0, DEVICE: 0, PAUSE: 0 },
    subjectSegments: [
      {
        subjectId: 1,
        startedAt: STARTED,
        endedAt: "2026-09-17T23:14:00Z",
        studySec: 50 * 60,
        focusSec: 44 * 60,
      },
    ],
    completedTasks: [{ id: 10, name: "단어 60개 암기", subjectId: 1, deleted: false }],
    ...over,
  };
}

function listResponse(): StudySessionListResponse {
  return {
    sessions: [session()],
    sessionCount: 1,
    totalStudySec: 52 * 60,
    totalFocusSec: 44 * 60,
    longestFocusSec: 44 * 60,
    focusRate: 96,
    totalEventCounts: { AWAY: 0, PHONE: 0, DEVICE: 0, PAUSE: 0 },
    studiedDatesInMonth: [DATE],
    subjects,
  };
}

describe("DayDetailCard", () => {
  it("순공·총공부·집중률과 과목별 시간, 휴식 행을 보여준다", () => {
    render(<DayDetailCard stats={listResponse()} dateKey={DATE} />);
    expect(screen.getByText("순공 시간")).toBeInTheDocument();
    expect(screen.getAllByText("44분").length).toBeGreaterThan(0); // 순공·영어
    expect(screen.getByText("52분")).toBeInTheDocument(); // 총 공부
    expect(screen.getByText("50분")).toBeInTheDocument(); // 영어 = studySec(순공 아님)
    expect(screen.getByText("96%")).toBeInTheDocument();
    expect(screen.getByText("영어")).toBeInTheDocument();
    expect(screen.getByText("휴식")).toBeInTheDocument();
    // 타임테이블 대체 텍스트가 제목이 아니라 순공 요약을 담는다.
    expect(screen.getByRole("img", { name: /순공 44분/ })).toBeInTheDocument();
  });

  it("타임테이블에 그 과목 색 칸이 실제로 칠해진다", () => {
    const { container } = render(<DayDetailCard stats={listResponse()} dateKey={DATE} />);
    // 영어(colorIndex 0) 구간이 있으니 subject-0 색을 가진 칸이 하나 이상 있어야 한다.
    expect(container.querySelector('[style*="--subject-0"]')).not.toBeNull();
  });

  it("지운 과목의 구간도 과목별 행에 원래 이름으로 나온다", () => {
    // 수학(id 2)은 deleted:true지만 그 구간을 공부했으면 이름을 그대로 보여줘야 한다.
    const deletedSubjectSession = session({
      subjectSegments: [
        {
          subjectId: 2,
          startedAt: STARTED,
          endedAt: "2026-09-17T23:14:00Z",
          studySec: 50 * 60,
          focusSec: 44 * 60,
        },
      ],
    });
    const stats: StudySessionListResponse = {
      ...listResponse(),
      sessions: [deletedSubjectSession],
    };
    render(<DayDetailCard stats={stats} dateKey={DATE} />);
    expect(screen.getByText("수학")).toBeInTheDocument();
  });
});

describe("Timetable", () => {
  it("24행 × 6칸(=144)을 role=img로 묶어 그린다", () => {
    const map = new Map(subjects.map((s) => [s.id, s]));
    const { container } = render(
      <Timetable slots={dayTimetable([session()], DATE)} subjects={map} />,
    );
    expect(screen.getByRole("img", { name: "24시간 공부 분포" })).toBeInTheDocument();
    expect(container.querySelectorAll(".rounded-\\[2px\\]")).toHaveLength(144);
  });
});

describe("SessionDetailSheet", () => {
  it("session이 null이면 시트 내용을 그리지 않는다", () => {
    render(
      <SessionDetailSheet session={null} subjects={subjects} dateKey={DATE} onClose={() => {}} />,
    );
    expect(screen.queryByText("순공 시간")).not.toBeInTheDocument();
  });

  it("열리면 시각 범위·휴식·완료한 할 일을 보여주고, 포털에도 소프트블루 테마가 붙는다", () => {
    render(
      <SessionDetailSheet
        session={session()}
        subjects={subjects}
        dateKey={DATE}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText("07:30 ~ 08:16")).toBeInTheDocument();
    expect(screen.getByText("휴식")).toBeInTheDocument();
    expect(screen.getByText("8분")).toBeInTheDocument(); // 휴식 = studySec - focusSec
    expect(screen.getByText("완료한 할 일")).toBeInTheDocument();
    expect(screen.getByText("단어 60개 암기")).toBeInTheDocument();
    // 포털 콘텐츠 루트에 theme-soft-blue가 붙어 토큰이 풀리지 않는다.
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.classList.contains("theme-soft-blue")).toBe(true);
  });

  it("닫기를 누르면 onClose가 불린다", () => {
    const onClose = vi.fn();
    render(
      <SessionDetailSheet
        session={session()}
        subjects={subjects}
        dateKey={DATE}
        onClose={onClose}
      />,
    );
    screen.getByRole("button", { name: "닫기" }).click();
    expect(onClose).toHaveBeenCalled();
  });

  it("지운 과목·지운 할 일의 이름도 시트에 보여준다", () => {
    // 수학(id 2)은 deleted:true, 할 일도 deleted:true — 둘 다 원래 이름을 그대로 보여줘야 한다.
    const withDeleted = session({
      subjectSegments: [
        {
          subjectId: 2,
          startedAt: STARTED,
          endedAt: "2026-09-17T23:14:00Z",
          studySec: 50 * 60,
          focusSec: 44 * 60,
        },
      ],
      completedTasks: [{ id: 11, name: "지운 과제", subjectId: 2, deleted: true }],
    });
    render(
      <SessionDetailSheet
        session={withDeleted}
        subjects={subjects}
        dateKey={DATE}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText("수학")).toBeInTheDocument();
    expect(screen.getByText("지운 과제")).toBeInTheDocument();
  });
});
