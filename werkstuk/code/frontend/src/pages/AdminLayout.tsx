import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { TwoColumn } from "../components/PageFrame";
import { RequireAdmin } from "../lib/RequireAdmin";
import { RequireAuth } from "../lib/RequireAuth";
import { mutedClass, sidebarLinkClass } from "../lib/styles";

export function AdminLayout() {
  return (
    <RequireAuth>
      <RequireAdmin>
        <AdminShell />
      </RequireAdmin>
    </RequireAuth>
  );
}

function AdminShell() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const catalogActive =
    pathname.startsWith("/admin") && !pathname.startsWith("/admin/help");

  return (
    <TwoColumn
      centerPanel
      sidebar={
        <>
          <p className="font-semibold text-navy">Admin</p>
          <p className={`mb-4 mt-1 ${mutedClass}`}>Manage</p>
          <Link
            to="/admin"
            className={sidebarLinkClass}
            activeOptions={{ exact: true }}
            data-status={catalogActive ? "active" : undefined}
          >
            Catalog
          </Link>
          <Link to="/admin/help" className={sidebarLinkClass}>
            Guide
          </Link>
        </>
      }
    >
      <Outlet />
    </TwoColumn>
  );
}
