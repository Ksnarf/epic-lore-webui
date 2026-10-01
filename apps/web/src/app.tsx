import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router";
import { AdminPermissionsRoute } from "./routes/admin-permissions.js";
import { BranchHistoryRoute } from "./routes/branch-history.js";
import { BranchTreeRoute } from "./routes/branch-tree.js";
import { PermissionsRoute } from "./routes/permissions.js";
import { RepositoriesRoute } from "./routes/repositories.js";
import { RepositoryBranchesRoute } from "./routes/repository-branches.js";
import { RepositoryLocksRoute } from "./routes/repository-locks.js";
import { RevisionDiffRoute } from "./routes/revision-diff.js";
import { SignInRoute } from "./routes/sign-in.js";

// TanStack Query owns all server/RPC data (docs/design/stack-decision.md,
// "State management"). One shared client for the whole app.
const queryClient = new QueryClient();

// React Router v7, library mode (client-side routing only -- no
// framework/SSR mode; see docs/design/stack-decision.md, "Routing").
// Task 1 (repo browse + file tree): repository -> branch -> path is fully
// deep-linkable, each step its own route. Later v1 tasks (revision history,
// diffs, etc.) add routes here without disturbing these.
const router = createBrowserRouter([
  { path: "/", element: <RepositoriesRoute /> },
  { path: "/sign-in", element: <SignInRoute /> },
  { path: "/permissions", element: <PermissionsRoute /> },
  { path: "/admin/permissions", element: <AdminPermissionsRoute /> },
  { path: "/repositories/:repositoryId", element: <RepositoryBranchesRoute /> },
  { path: "/repositories/:repositoryId/locks", element: <RepositoryLocksRoute /> },
  {
    path: "/repositories/:repositoryId/branches/:branchId/diff/:from/:to/*",
    element: <RevisionDiffRoute />,
  },
  { path: "/repositories/:repositoryId/branches/:branchId/history/*", element: <BranchHistoryRoute /> },
  { path: "/repositories/:repositoryId/branches/:branchId/*", element: <BranchTreeRoute /> },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
