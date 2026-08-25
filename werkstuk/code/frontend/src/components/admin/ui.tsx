import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  type ReactElement,
  type ReactNode,
  type SubmitEvent,
} from "react";
import { HelpCircle, X } from "lucide-react";
import { ADMIN_DOCS, type AdminDocId } from "../../lib/adminDocs";
import {
  buttonClass,
  cardClass,
  cx,
  errorClass,
  mutedClass,
  successClass,
  textButtonClass,
  titleClass,
} from "../../lib/styles";

export function AdminIconButton({
  label,
  onClick,
  danger = false,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={
        danger
          ? "cursor-pointer px-2.5 text-muted transition-colors hover:text-danger"
          : "cursor-pointer px-2.5 text-muted transition-colors hover:text-navy"
      }
    >
      {children}
    </button>
  );
}

export function StatusBadge({ ready }: { ready: boolean }) {
  return (
    <span className={ready ? successClass : mutedClass}>
      {ready ? "Ready" : "Incomplete"}
    </span>
  );
}

export function AdminAlert({
  tone = "error",
  children,
}: {
  tone?: "error" | "ok";
  children: ReactNode;
}) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cx("mb-4", tone === "error" ? errorClass : successClass)}
    >
      {children}
    </p>
  );
}

export function AdminField({
  label,
  hint,
  required,
  help,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  help?: AdminDocId;
  children: ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<{ id?: string; "aria-required"?: boolean; "aria-describedby"?: string }>, {
        id,
        "aria-required": required || undefined,
        "aria-describedby": hintId,
      })
    : children;

  return (
    <div className="mb-4">
      <div className="mb-1.5 flex items-center gap-1.5">
        <label
          htmlFor={id}
          className="text-xs font-semibold tracking-wide text-muted uppercase"
        >
          {label}
          {required ? <span className="text-danger"> *</span> : null}
        </label>
        {help ? <HelpTip doc={help} /> : null}
      </div>
      {hint ? (
        <p id={hintId} className={`mb-1.5 ${mutedClass}`}>
          {hint}
        </p>
      ) : null}
      {control}
    </div>
  );
}

export function HelpTip({ doc }: { doc: AdminDocId }) {
  const item = ADMIN_DOCS[doc];
  const tipId = useId();

  return (
    <span className="group relative inline-block">
      <button
        type="button"
        className="inline-flex cursor-help items-center text-muted hover:text-navy"
        aria-label={item.title}
        aria-describedby={tipId}
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
      <span className="invisible absolute left-0 top-full z-30 w-72 pt-1 text-left opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
        <span id={tipId} role="tooltip" className={`block p-3 ${cardClass}`}>
          <span className="mb-1 block text-sm font-semibold text-navy">{item.title}</span>
          {item.paragraphs.map((paragraph) => (
            <span key={paragraph} className={`mt-1 block ${mutedClass}`}>
              {paragraph}
            </span>
          ))}
        </span>
      </span>
    </span>
  );
}

export function AdminDialog({
  title,
  onClose,
  children,
  wide = false,
  unsaved = false,
  locked = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  unsaved?: boolean;
  locked?: boolean;
}) {
  const headingId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  // Latest values for the Escape handler, which subscribes only once.
  const unsavedRef = useRef(unsaved);
  const lockedRef = useRef(locked);
  useEffect(() => {
    unsavedRef.current = unsaved;
    lockedRef.current = locked;
  });

  const requestClose = useCallback(() => {
    if (lockedRef.current) {
      return;
    }
    if (
      unsavedRef.current &&
      !window.confirm("You have unsaved changes. Discard them?")
    ) {
      return;
    }
    onClose();
  }, [onClose]);

  useEffect(() => {
    const previous = document.activeElement;
    const node = panelRef.current;
    const focusable = node?.querySelector<HTMLElement>(
      "input, textarea, select, button",
    );
    focusable?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        requestClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (previous instanceof HTMLElement) {
        previous.focus();
      }
    };
  }, [requestClose]);

  useEffect(() => {
    if (!unsaved) {
      return;
    }
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [unsaved]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy/40 p-4 sm:p-8"
      onClick={requestClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className={cx(
          `my-4 w-full p-8 ${cardClass}`,
          wide ? "max-w-3xl" : "max-w-lg",
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id={headingId} className={cx(titleClass, "mb-0")}>
            {title}
          </h2>
          <button
            type="button"
            aria-label="Close"
            title="Close"
            onClick={requestClose}
            className="cursor-pointer px-2.5 text-muted transition-colors hover:text-navy"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel = "Delete",
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel?: string;
  busy?: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm?: () => void;
}) {
  return (
    <AdminDialog title={title} onClose={onCancel} locked={busy}>
      <p className={`mb-4 ${mutedClass}`}>{body}</p>
      {error ? <p className={`mb-4 ${errorClass}`}>{error}</p> : null}
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button type="button" className={textButtonClass} onClick={onCancel}>
          {onConfirm ? "Cancel" : "Close"}
        </button>
        {onConfirm ? (
          <button
            type="button"
            className="cursor-pointer text-sm text-danger transition-colors hover:text-navy disabled:cursor-not-allowed disabled:text-disabled"
            disabled={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        ) : null}
      </div>
    </AdminDialog>
  );
}

export function WizardFrame({
  title,
  step,
  stepCount,
  stepLabel,
  error,
  busy,
  onClose,
  onBack,
  onNext,
  nextLabel,
  nextDisabled,
  unsaved,
  children,
}: {
  title: string;
  step: number;
  stepCount: number;
  stepLabel: string;
  error?: string;
  busy?: boolean;
  onClose: () => void;
  onBack?: () => void;
  onNext: () => void;
  nextLabel: string;
  nextDisabled?: boolean;
  unsaved?: boolean;
  children: ReactNode;
}) {
  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!nextDisabled && !busy) {
      onNext();
    }
  }

  return (
    <AdminDialog title={title} onClose={onClose} unsaved={unsaved} locked={busy} wide>
      <p className={`mb-4 ${mutedClass}`}>
        Step {step} of {stepCount} · {stepLabel}
      </p>
      <form onSubmit={onSubmit}>
        {children}
        {error ? <p className={`mb-4 ${errorClass}`}>{error}</p> : null}
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <button
            type="submit"
            className={buttonClass}
            disabled={nextDisabled || busy}
          >
            {nextLabel}
          </button>
          {onBack ? (
            <button type="button" className={textButtonClass} onClick={onBack}>
              Back
            </button>
          ) : null}
        </div>
      </form>
    </AdminDialog>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className={`py-8 ${mutedClass}`}>{children}</p>;
}
