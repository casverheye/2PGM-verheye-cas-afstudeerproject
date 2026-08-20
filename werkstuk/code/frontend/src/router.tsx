import {
  Link,
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { useAuth } from "./lib/AuthProvider";
import { RegisterPage } from "./pages/Register";
import { LoginPage } from "./pages/Login";
import { DashboardPage } from "./pages/Dashboard";
import { LearnHomePage } from "./pages/LearnHome";
import { LearnPage } from "./pages/Learn";
import { ProfilePage } from "./pages/Profile";

function RootLayout() {
  const { user, loading, signOut } = useAuth();

  return (
    <>
      <nav className="flex flex-wrap gap-4 p-4">
        <Link to="/">Home</Link>
        {loading ? null : user ? (
          <>
            <Link to="/dashboard">Dashboard</Link>
            <Link to="/learn">Learn</Link>
            <Link to="/profile">Profile</Link>
            <button type="button" onClick={() => void signOut()}>
              Log out
            </button>
          </>
        ) : (
          <>
            <Link to="/login">Login</Link>
            <Link to="/register">Register</Link>
          </>
        )}
      </nav>
      <Outlet />
    </>
  );
}

const rootRoute = createRootRoute({
  component: RootLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => <h1 className="p-4 text-xl">Mathlete</h1>,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
});

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/register",
  component: RegisterPage,
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dashboard",
  component: DashboardPage,
});

const learnHomeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/learn",
  component: LearnHomePage,
});

const learnRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/learn/$topicId",
  component: LearnPage,
});

const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/profile",
  component: ProfilePage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  registerRoute,
  dashboardRoute,
  learnHomeRoute,
  learnRoute,
  profileRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
