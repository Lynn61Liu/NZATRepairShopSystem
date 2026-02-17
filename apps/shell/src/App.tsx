import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AppFrame } from "./layout/AppFrame";
import { DashboardPage } from "./pages/DashboardPage";
import { JobsPage } from "./pages/jobs/JobsPage";
import { JobDetailPage } from "./pages/jobDetail/JobDetailPage";
import { InvoicePage } from "./pages/InvoicePage";
import { NewJobPage } from "./pages/NewJobPage";
import { TagsPage } from "./pages/tags/TagsPage";
import { CustomersPage } from "./pages/customers/CustomersPage";
import { WofFailReasonsPage } from "./pages/wofFails/WofFailReasonsPage";
import { PartFlowPage } from "./pages/PartFlowPages/PartFlowPage";
import { ToastProvider } from "@/components/ui";

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppFrame />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "jobs", element: <JobsPage /> },
      { path: "parts-flow", element: <PartFlowPage /> },
      { path: "jobs/:id", element: <JobDetailPage /> },
      { path: "invoice", element: <InvoicePage /> },
      { path: "tags", element: <TagsPage /> },
      { path: "customers", element: <CustomersPage /> },
      { path: "wof-fails", element: <WofFailReasonsPage /> },
      {
        path: "/jobs/new",
        element: <NewJobPage />
      }
    ],
  },
]);

export default function App() {
  return (
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>
  );
}
