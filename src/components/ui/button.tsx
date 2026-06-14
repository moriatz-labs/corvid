import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  icon?: ReactNode;
};

const variants: Record<ButtonVariant, string> = {
  primary: "border border-primary bg-primary text-primary-text hover:bg-foreground disabled:bg-muted-foreground disabled:border-muted-foreground",
  secondary: "border border-border bg-card text-foreground hover:border-primary hover:bg-muted",
  ghost: "bg-transparent text-foreground hover:bg-muted",
  danger: "border border-[#E8C8C2] bg-[#F8E7E4] text-[#A33A32] hover:bg-[#F3DAD4]",
};

export function Button({ className, variant = "primary", icon, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-4 py-2 font-primary text-sm font-medium transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        "disabled:cursor-not-allowed disabled:opacity-60",
        variants[variant],
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
