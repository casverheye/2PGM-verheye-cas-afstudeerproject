import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { RootLayout } from "./components/RootLayout";
import { RegisterPage } from "./pages/Register";
import { LoginPage } from "./pages/Login";
import { LearnHomePage } from "./pages/LearnHome";
import { LearnPage } from "./pages/Learn";
import { CourseTopicPage } from "./pages/CourseTopic";
import { SettingsLayout } from "./pages/Settings";
import { SettingsProfilePage } from "./pages/SettingsProfile";
import { SettingsPasswordPage } from "./pages/SettingsPassword";
import { SettingsCoursePage } from "./pages/SettingsCourse";
import { AdminLayout } from "./pages/AdminLayout";
import { AdminHomePage } from "./pages/AdminHome";
import { AdminCoursePage } from "./pages/AdminCourse";
import { AdminTopicPage } from "./pages/AdminTopic";
import { AdminKpPage } from "./pages/AdminKp";
import { AdminHelpPage } from "./pages/AdminHelp";
import { QuizPage } from "./pages/Quiz";
import { DiagnosticPage } from "./pages/Diagnostic";
import { HomeRedirect, RedirectToLearn } from "./pages/HomeRedirect";
import { GraphPage } from "./pages/Graph";

const rootRoute = createRootRoute({
  component: RootLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomeRedirect,
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

const coursesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/courses",
  component: RedirectToLearn,
});

const courseDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/courses/$courseId",
  component: RedirectToLearn,
});

const courseTopicRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/courses/$courseId/$topicId",
  component: CourseTopicPage,
});

const graphRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/graph",
  component: GraphPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsLayout,
});

const settingsProfileRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "profile",
  component: SettingsProfilePage,
});

const settingsPasswordRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "password",
  component: SettingsPasswordPage,
});

const settingsCourseRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "course",
  component: SettingsCoursePage,
});

const quizRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/quiz/$quizId",
  component: QuizPage,
});

const diagnosticRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/diagnostic",
  component: DiagnosticPage,
});

const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin",
  component: AdminLayout,
});

const adminIndexRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: "/",
  component: AdminHomePage,
});

const adminCourseRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: "courses/$courseId",
  component: AdminCoursePage,
});

const adminTopicRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: "courses/$courseId/topics/$topicId",
  component: AdminTopicPage,
});

const adminKpRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: "kps/$kpId",
  component: AdminKpPage,
});

const adminHelpRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: "help",
  component: AdminHelpPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  registerRoute,
  learnHomeRoute,
  learnRoute,
  coursesRoute,
  courseDetailRoute,
  courseTopicRoute,
  graphRoute,
  settingsRoute.addChildren([
    settingsProfileRoute,
    settingsCourseRoute,
    settingsPasswordRoute,
  ]),
  quizRoute,
  diagnosticRoute,
  adminRoute.addChildren([
    adminIndexRoute,
    adminHelpRoute,
    adminCourseRoute,
    adminTopicRoute,
    adminKpRoute,
  ]),
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
