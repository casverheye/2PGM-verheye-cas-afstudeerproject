import { Link, Outlet } from "@tanstack/react-router";
import { useAuth } from "../lib/authContext";
import { RequireAuth } from "../lib/RequireAuth";
import { metaString } from "../lib/userMeta";
import { mutedClass, sidebarLinkClass } from "../lib/styles";
import { TwoColumn } from "../components/PageFrame";

export function SettingsLayout() {
  return (
    <RequireAuth>
      <SettingsShell />
    </RequireAuth>
  );
}

function SettingsShell() {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  const fullName = `${metaString(user, "first_name")} ${metaString(user, "last_name")}`.trim();

  return (
    <TwoColumn
      centerPanel
      sidebar={
        <>
          <p className="font-semibold text-navy">{fullName || user.email}</p>
          <p className={`mb-4 mt-1 ${mutedClass}`}>Settings</p>
          <Link to="/settings/course" className={sidebarLinkClass}>
            Course
          </Link>
          <Link to="/settings/profile" className={sidebarLinkClass}>
            Profile
          </Link>
          <Link to="/settings/password" className={sidebarLinkClass}>
            Password
          </Link>
        </>
      }
    >
      <Outlet />
    </TwoColumn>
  );
}
