import type React from "react";

type ButtonProps = {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost";
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
  title?: string;
  href?: string;
  target?: string;
  rel?: string;
};

export function Button({
  children,
  onClick,
  variant = "ghost",
  leftIcon,
  rightIcon,
  className = "",
  disabled,
  type = "button",
  title,
  href,
  target,
  rel,
}: ButtonProps) {
  const cls =
    variant === "primary"
      ? "bg-[var(--ds-primary)] text-white hover:opacity-95 disabled:hover:opacity-50"
      : "bg-white text-[rgba(0,0,0,0.72)] border border-[rgba(0,0,0,0.10)] hover:bg-[rgba(0,0,0,0.03)]";

  const classes = [
    "h-9 inline-flex items-center gap-2 rounded-[8px] px-3 text-sm font-medium transition",
    "disabled:opacity-50 disabled:cursor-not-allowed",
    cls,
    className,
  ].join(" ");

  if (href) {
    return (
      <a
        href={href}
        target={target}
        rel={rel}
        title={title}
        className={[classes, disabled ? "pointer-events-none opacity-50" : ""].join(" ")}
        aria-disabled={disabled || undefined}
      >
        {leftIcon}
        {children}
        {rightIcon}
      </a>
    );
  }

  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title} className={classes}>
      {leftIcon}
      {children}
      {rightIcon}
    </button>
  );
}
