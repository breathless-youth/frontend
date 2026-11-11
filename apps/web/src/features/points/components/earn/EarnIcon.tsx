/** 받기 칸 앞의 흰 바탕 아이콘이며 옆 글자가 뜻을 전해 낭독기에서는 숨긴다. */
export function EarnIcon({ name }: { name: "study" | "attendance" | "dailyGoal" | "ad" }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-11 shrink-0 items-center justify-center rounded-md bg-muted text-primary"
    >
      <svg
        width={22}
        height={22}
        viewBox="0 0 24 24"
        fill={name === "ad" ? "currentColor" : "none"}
        stroke={name === "ad" ? "none" : "currentColor"}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {name === "study" && (
          <path d="M12 6.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15zM12 9.5v4l2.5 1.5M9.5 3h5M12 3v3" />
        )}
        {name === "attendance" && (
          <path d="M6.5 5h11a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-11a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3zM8 3v4M16 3v4M3.5 10h17M9 15l2 2 4-4" />
        )}
        {name === "dailyGoal" && (
          <>
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="4.5" />
            <circle cx="12" cy="12" r="1" fill="currentColor" />
          </>
        )}
        {name === "ad" && (
          <>
            <rect x="2.5" y="5" width="19" height="14" rx="4" />
            <path d="M10 9.2v5.6l5-2.8z" className="fill-muted" />
          </>
        )}
      </svg>
    </span>
  );
}
