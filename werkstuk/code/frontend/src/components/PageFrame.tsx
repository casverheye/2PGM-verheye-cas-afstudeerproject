import type { ReactNode } from "react";
import { cardClass, mutedClass, titleClass } from "../lib/styles";

export function PagePanel({
  children,
  center = false,
}: {
  children: ReactNode;
  center?: boolean;
}) {
  if (center) {
    return (
      <div className={`mx-auto w-full max-w-md p-8 ${cardClass}`}>{children}</div>
    );
  }
  return <div className="w-full">{children}</div>;
}

export function TwoColumn({
  sidebar,
  children,
  centerPanel = false,
}: {
  sidebar: ReactNode;
  children: ReactNode;
  centerPanel?: boolean;
}) {
  return (
    <div className="flex w-full flex-col gap-8 md:flex-row md:gap-10">
      <aside className={`w-full p-5 md:w-56 md:shrink-0 md:self-start ${cardClass}`}>
        {sidebar}
      </aside>
      <section
        className={
          centerPanel
            ? `min-w-0 flex-1 p-6 sm:p-8 ${cardClass}`
            : "min-w-0 flex-1"
        }
      >
        {children}
      </section>
    </div>
  );
}

export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className={titleClass}>{children}</h1>;
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 block text-xs font-semibold tracking-wide text-muted uppercase">
        {label}
      </span>
      {hint ? <span className={`mb-1.5 block font-normal normal-case tracking-normal ${mutedClass}`}>{hint}</span> : null}
      {children}
    </label>
  );
}
