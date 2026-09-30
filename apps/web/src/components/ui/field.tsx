import * as React from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * 세로 배치 입력 필드
 *
 * shadcn Field에서 이 저장소가 쓰는 세로 배치만 들였다.
 * 가로·반응형 배치와 FieldSet 등은 쓰는 화면이 생길 때 원본에서 가져온다.
 */
function Field({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      role="group"
      data-slot="field"
      className={cn("group/field flex w-full flex-col gap-3 [&>*]:w-full", className)}
      {...props}
    />
  );
}

function FieldLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
  return (
    <Label
      data-slot="field-label"
      className={cn("flex w-fit gap-2 leading-snug", className)}
      {...props}
    />
  );
}

function FieldError({
  className,
  children,
  errors,
  ...props
}: React.ComponentProps<"div"> & {
  errors?: Array<{ message?: string } | undefined>;
}) {
  const content = children ?? errors?.find((error) => error?.message)?.message;
  if (!content) {
    return null;
  }
  return (
    <div
      role="alert"
      data-slot="field-error"
      className={cn("text-sm font-normal text-state-distract-text", className)}
      {...props}
    >
      {content}
    </div>
  );
}

export { Field, FieldError, FieldLabel };
