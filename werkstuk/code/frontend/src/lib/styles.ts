export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export const inputClass =
  "w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink transition-colors focus:border-blue disabled:cursor-not-allowed disabled:bg-canvas disabled:text-muted";

export const buttonClass =
  "inline-flex cursor-pointer items-center justify-center rounded-full bg-blue px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue/90 disabled:cursor-not-allowed disabled:bg-disabled disabled:text-white";

export const titleClass = "mb-3 text-3xl font-bold tracking-tight text-navy";

export const sidebarLinkClass =
  "block w-full px-0 py-1.5 text-left text-sm text-muted transition-colors hover:text-navy data-[status=active]:font-semibold data-[status=active]:text-navy aria-[current=page]:font-semibold aria-[current=page]:text-navy";

export const navLinkClass =
  "text-sm font-medium text-navy/70 transition-colors hover:text-navy data-[status=active]:text-navy aria-[current=page]:text-navy";

export const linkClass = "text-blue transition-colors hover:text-navy";

export const textButtonClass =
  "cursor-pointer text-sm text-muted transition-colors hover:text-navy disabled:cursor-not-allowed disabled:text-disabled";

export const backLinkClass =
  "mb-6 inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-navy";

export const cardClass = "rounded-lg border border-line bg-surface";

export const taskClass = `${cardClass} mb-3 block w-full px-5 py-4 text-left transition-colors hover:bg-blue-soft/50`;

export const mutedClass = "text-sm text-muted";
export const errorClass = "text-sm text-danger";
export const successClass = "text-sm text-ok";
