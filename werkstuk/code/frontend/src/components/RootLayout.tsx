import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import type { User } from "@supabase/supabase-js";
import { useAuth } from "../lib/authContext";
import { apiGet } from "../lib/api";
import { useApiGet } from "../lib/useApiGet";
import { CoursesMegaPanel, CoursesNav } from "./CoursesNav";
import { navLinkClass } from "../lib/styles";

function userNameParts(user: User) {
  const first =
    typeof user.user_metadata.first_name === "string"
      ? user.user_metadata.first_name.trim()
      : "";
  const last =
    typeof user.user_metadata.last_name === "string"
      ? user.user_metadata.last_name.trim()
      : "";

  return { first, last };
}

function userInitials(user: User) {
  const { first, last } = userNameParts(user);

  if (first && last) {
    return `${first[0]}${last[0]}`.toUpperCase();
  }

  return (user.email ?? "?").slice(0, 2).toUpperCase();
}

function userFullName(user: User) {
  const { first, last } = userNameParts(user);
  return `${first} ${last}`.trim();
}

export function RootLayout() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const hideNav =
    pathname === "/diagnostic" ||
    pathname.startsWith("/quiz/") ||
    pathname.startsWith("/learn/");
  const adminShell = pathname.startsWith("/admin");
  const shellWidth = adminShell
    ? "mx-auto w-full max-w-[110rem] px-4 sm:px-6"
    : "mx-auto w-full max-w-6xl px-4 sm:px-6";
  const [menuOpen, setMenuOpen] = useState(false);
  const [coursesOpen, setCoursesOpen] = useState(false);
  const ignoreHover = useRef(false);
  const ignoreCoursesHover = useRef(false);

  // Only fetch /me while logged in; the flag only shows the Admin nav link.
  const { data: me } = useApiGet<{ admin: boolean }>(user ? "/me" : null);
  const isAdmin = user != null && me?.admin === true;

  useEffect(() => {
    if (!user || pathname.startsWith("/quiz/")) {
      return;
    }
    if (pathname === "/login" || pathname === "/register") {
      return;
    }
    let ignore = false;
    apiGet<{ active: boolean; quiz_id: number | null }>("/quizzes/active")
      .then((body) => {
        if (ignore || !body.active || body.quiz_id == null) {
          return;
        }
        void navigate({
          to: "/quiz/$quizId",
          params: { quizId: String(body.quiz_id) },
          replace: true,
        });
      })
      .catch(() => {
        // stay on the current page if the check fails
      });
    return () => {
      ignore = true;
    };
  }, [user, pathname, navigate]);

  function dismissMenu() {
    ignoreHover.current = true;
    setMenuOpen(false);
  }

  function dismissCourses() {
    ignoreCoursesHover.current = true;
    setCoursesOpen(false);
  }

  return (
    <div
      className={
        pathname === "/graph"
          ? "flex h-svh flex-col overflow-hidden bg-canvas text-ink"
          : "min-h-svh bg-canvas text-ink"
      }
    >
      {hideNav ? null : (
      <nav
        className="relative z-20 border-b border-line bg-surface"
        onMouseLeave={() => {
          ignoreCoursesHover.current = false;
          setCoursesOpen(false);
        }}
      >
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-6">
            {user ? (
              <>
                <Link to="/learn" className={navLinkClass}>
                  Learn
                </Link>
                <CoursesNav
                  open={coursesOpen}
                  onOpen={() => {
                    if (!ignoreCoursesHover.current) {
                      setCoursesOpen(true);
                    }
                  }}
                  onToggle={() => setCoursesOpen((value) => !value)}
                />
              </>
            ) : null}
          </div>
          {loading ? null : user ? (
            <div
              className="relative z-40"
              onMouseEnter={() => {
                setCoursesOpen(false);
                if (!ignoreHover.current) {
                  setMenuOpen(true);
                }
              }}
              onMouseLeave={() => {
                ignoreHover.current = false;
                setMenuOpen(false);
              }}
            >
              <Link
                to="/settings/profile"
                aria-label="Profile"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-soft text-xs font-semibold tracking-wide text-navy"
                onClick={dismissMenu}
              >
                {userInitials(user)}
              </Link>
              {menuOpen ? (
                <div className="absolute right-0 top-full z-40 pt-1">
                  <div className="min-w-44 rounded-lg border border-line bg-surface py-2">
                    <p className="px-3 text-sm font-semibold text-navy">
                      {userFullName(user) || user.email}
                    </p>
                    <div className="my-2 border-t border-line" />
                    <Link
                      to="/graph"
                      className="block px-3 py-1.5 text-sm text-muted hover:text-navy"
                      onClick={dismissMenu}
                    >
                      Graph
                    </Link>
                    <Link
                      to="/settings/profile"
                      className="block px-3 py-1.5 text-sm text-muted hover:text-navy"
                      onClick={dismissMenu}
                    >
                      Settings
                    </Link>
                    {isAdmin ? (
                      <Link
                        to="/admin"
                        className="block px-3 py-1.5 text-sm text-muted hover:text-navy"
                        onClick={dismissMenu}
                      >
                        Admin
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      className="block w-full cursor-pointer px-3 py-1.5 text-left text-sm text-muted hover:text-navy"
                      onClick={() => {
                        dismissMenu();
                        void signOut();
                      }}
                    >
                      Logout
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex items-center gap-5">
              <Link to="/login" className={navLinkClass}>
                Login
              </Link>
              <Link to="/register" className={navLinkClass}>
                Register
              </Link>
            </div>
          )}
        </div>
        {user ? (
          <CoursesMegaPanel open={coursesOpen} onDismiss={dismissCourses} />
        ) : null}
      </nav>
      )}
      <main
        className={
          pathname === "/graph"
            ? "min-h-0 flex-1 overflow-hidden bg-surface"
            : `py-8 sm:py-10 ${shellWidth}`
        }
      >
        <Outlet />
      </main>
    </div>
  );
}
