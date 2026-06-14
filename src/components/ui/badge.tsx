import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
};

const tones: Record<BadgeTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-[#E7F3EF] text-[#236B61]",
  warning: "bg-[#F7ECE3] text-[#A8663A]",
  danger: "bg-[#F8E7E4] text-[#A33A32]",
  info: "bg-[#E8EEF4] text-[#445B7A]",
};

export function Badge({ className, tone = "neutral", children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-1 font-primary text-xs font-medium",
        tones[tone],
        className,
      )}
      {...props}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}
