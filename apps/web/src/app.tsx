import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router";
import { RootRoute } from "./routes/root.js";

// TanStack Query owns all server/RPC data (docs/design/stack-decision.md,
// "State management"). One shared client for the whole app.
const queryClient = new QueryClient();

// React Router v7, library mode (client-side routing only -- no
// framework/SSR mode; see docs/design/stack-decision.md, "Routing").
// Real routes (repo browse, revision history, diff view, etc.) are added
// here per tasks.md v1 tasks 1-3; this is a single placeholder route.
const router = createBrowserRouter([
  {
    path: "/",
    element: <RootRoute />,
  },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
