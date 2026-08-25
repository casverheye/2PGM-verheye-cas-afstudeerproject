import type { QueueItem } from "../../lib/types";

/** Course progress donut with a per-topic breakdown on hover. */
export function ProgressRing({
  percent,
  topics,
}: {
  percent: number;
  topics: QueueItem[];
}) {
  const clamped = Math.min(100, Math.max(0, percent));
  const maxKps = Math.max(...topics.map((item) => item.kp_total), 1);

  return (
    <div className="group relative shrink-0">
      <div
        className="flex h-12 w-12 items-center justify-center rounded-full"
        style={{
          background:
            clamped === 0
              ? "var(--color-line)"
              : `conic-gradient(var(--color-blue) ${clamped}%, var(--color-line) 0)`,
        }}
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-xs font-medium text-navy">
          {clamped}%
        </div>
      </div>
      {topics.length > 0 ? (
        <div className="pointer-events-none invisible absolute top-full right-0 z-40 mt-2 w-80 overflow-x-hidden rounded-lg border border-line bg-surface p-3 shadow-sm group-hover:visible lg:top-0 lg:right-auto lg:left-full lg:mt-0 lg:ml-3">
          <ul className="space-y-2.5">
            {topics.map((item, index) => {
              const total = item.kp_total;
              if (total === 0) {
                return null;
              }
              const learned = item.kp_mastered;
              const rest = Math.max(total - learned, 0);
              const doing =
                item.state === "in_progress" || item.state === "halted";
              const doingWidth = doing ? rest : 0;
              const emptyWidth = doing ? 0 : rest;
              const barWidth = `${Math.max((total / maxKps) * 100, 18)}%`;
              return (
                <li key={item.topic_id}>
                  <p className="mb-1 break-words text-xs text-muted">
                    {index + 1}. {item.title}
                  </p>
                  <div
                    className="flex h-3.5 overflow-hidden border border-line bg-surface"
                    style={{ width: barWidth }}
                  >
                    {learned > 0 ? (
                      <span
                        className="h-full bg-[#1e4b8c]"
                        style={{ width: `${(learned / total) * 100}%` }}
                      />
                    ) : null}
                    {doingWidth > 0 ? (
                      <span
                        className="h-full bg-blue-soft"
                        style={{ width: `${(doingWidth / total) * 100}%` }}
                      />
                    ) : null}
                    {emptyWidth > 0 ? (
                      <span
                        className="h-full bg-surface"
                        style={{ width: `${(emptyWidth / total) * 100}%` }}
                      />
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
