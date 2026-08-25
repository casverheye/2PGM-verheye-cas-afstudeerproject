/** One grey skeleton block. Size it with width/height classes. */
export function Bone({ className }: { className: string }) {
  return <div className={`rounded-md bg-line ${className}`} aria-hidden="true" />;
}
