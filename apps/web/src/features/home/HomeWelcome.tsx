import { BookOpen, Pencil, Timer } from "lucide-react";

import { Button } from "@/components/ui/button";

const ICONS = [
  { Icon: BookOpen, color: "text-primary" },
  { Icon: Pencil, color: "text-(--subject-5)" },
  { Icon: Timer, color: "text-(--subject-1)" },
];

/** 과목을 만든 적 없는 계정의 홈 본문. */
export function HomeWelcome({ onCreate }: { onCreate: () => void }) {
  return (
    <section
      aria-labelledby="home-welcome-title"
      className="my-auto flex flex-col items-center text-center"
    >
      <div aria-hidden className="flex gap-3">
        {ICONS.map(({ Icon, color }) => (
          <span
            key={color}
            className={`flex size-16 items-center justify-center rounded-full bg-current/15 ${color}`}
          >
            <Icon size={26} strokeWidth={1.75} />
          </span>
        ))}
      </div>
      <h2
        id="home-welcome-title"
        className="mt-6 text-[20px] leading-7 font-bold break-keep text-foreground"
      >
        포커스메이커스에 오신 걸 환영해요
      </h2>
      <p className="mt-2 text-[15px] leading-5.5 break-keep text-muted-foreground">
        과목을 만들면 과목별로 순공시간이 쌓여요.
        <br />
        공부할 과목 하나로 시작해 보세요.
      </p>
      <Button size="xl" onClick={onCreate} className="mt-7 w-full font-bold">
        과목 만들기
      </Button>
    </section>
  );
}
