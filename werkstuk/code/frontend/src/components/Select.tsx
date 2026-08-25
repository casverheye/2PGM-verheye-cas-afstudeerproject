import type { SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cx, inputClass } from "../lib/styles";

export function Select({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative w-full">
      <select
        {...props}
        className={cx(inputClass, "appearance-none pr-10", className)}
      />
      <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-muted">
        <ChevronDown className="h-4 w-4" aria-hidden="true" />
      </span>
    </div>
  );
}
