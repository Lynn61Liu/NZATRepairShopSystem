import type { TextareaHTMLAttributes } from "react";

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  fullWidth?: boolean;
};

export function Textarea({ className, fullWidth = true, ...props }: TextareaProps) {
  return (
    <textarea
      {...props}
      className={[ 
        "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900",
        "outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100",
        "placeholder:text-gray-400  bg-gray-50",
        fullWidth ? "w-full" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}
