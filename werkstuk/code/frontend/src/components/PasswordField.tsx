import { useState, type ChangeEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cx, inputClass } from "../lib/styles";

type PasswordFieldProps = {
  name: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  autoComplete?: string;
  className?: string;
};

export function PasswordField({
  name,
  value,
  onChange,
  placeholder,
  required,
  minLength,
  autoComplete,
  className,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative w-full">
      <input
        type={visible ? "text" : "password"}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        className={cx(inputClass, "pr-10", className)}
      />
      <button
        type="button"
        className="absolute inset-y-0 right-0 px-2.5 text-muted transition-colors hover:text-navy"
        onClick={() => setVisible((open) => !open)}
        aria-label={visible ? "Hide password" : "Show password"}
      >
        {visible ? (
          <EyeOff className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Eye className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
