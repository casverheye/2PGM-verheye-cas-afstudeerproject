import { ADMIN_DOCS, type AdminDocId } from "../lib/adminDocs";
import { linkClass, mutedClass } from "../lib/styles";
import { PageTitle } from "../components/PageFrame";
import { Link } from "@tanstack/react-router";

const ORDER: AdminDocId[] = [
  "catalog",
  "course",
  "topic",
  "knowledgePoint",
  "question",
  "prerequisite",
  "encompassing",
  "ready",
  "engine",
  "delete",
  "slug",
];

export function AdminHelpPage() {
  return (
    <div>
      <nav className={`mb-3 ${mutedClass}`}>
        <Link to="/admin" className={linkClass}>
          Courses
        </Link>
        <span> / Guide</span>
      </nav>
      <PageTitle>Catalog guide</PageTitle>
      <p className={`mb-6 ${mutedClass}`}>
        How this back office maps to Learn. Same articles appear as “?” next to fields
        while you work.
      </p>
      {ORDER.map((id) => {
        const doc = ADMIN_DOCS[id];
        return (
          <article key={id} className="mb-8 border-t border-line pt-6">
            <h2 className="mb-2 text-lg font-semibold text-navy">{doc.title}</h2>
            {doc.paragraphs.map((paragraph) => (
              <p key={paragraph} className={`mt-2 ${mutedClass}`}>
                {paragraph}
              </p>
            ))}
          </article>
        );
      })}
    </div>
  );
}
