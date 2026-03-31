import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AppFrame } from "./layout/AppFrame";
import { DashboardPage } from "./pages/DashboardPage";
import { JobsPage } from "./pages/jobs/JobsPage";
import { JobDetailPage } from "./pages/jobDetail/JobDetailPage";
import { InvoicePage } from "./pages/InvoicePage";
import { NewJobPage } from "./pages/NewJobPage";
import { TagsPage } from "./pages/tags/TagsPage";
import { CustomersPage } from "./pages/customers/CustomersPage";
import { CustomerProfilePage } from "./pages/customers/CustomerProfilePage";
import { WofFailReasonsPage } from "./pages/wofFails/WofFailReasonsPage";
import { XeroItemCodesPage } from "./pages/settings/XeroItemCodesPage";
import { ServiceCatalogPage } from "./pages/settings/ServiceCatalogPage";
import { IntegrationsPage } from "./pages/settings/IntegrationsPage";
import { PartFlowPage } from "./pages/PartFlowPages/PartFlowPage";
import { PaintBoardPage } from "./pages/paint/PaintBoardPage";
import { PaintTechBoardPage } from "./pages/paint/PaintTechBoardPage";
import { WorklogPage } from "./pages/worklog/WorklogPage";
import { PoDashboardPreviewPage } from "./pages/PoDashboardPreviewPage";
import { WofSchedulePage } from "./pages/WofSchedulePage";
import { ToastProvider } from "@/components/ui";

const router = createBrowserRouter([
  { path: "/paint-tech", element: <PaintTechBoardPage /> },
  {
    path: "/",
    element: <AppFrame />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "jobs", element: <JobsPage /> },
      { path: "paint-board", element: <PaintBoardPage /> },
      { path: "wof-schedule", element: <WofSchedulePage /> },
      { path: "po-dashboard-preview", element: <PoDashboardPreviewPage /> },
      { path: "worklog", element: <WorklogPage /> },
      { path: "parts-flow", element: <PartFlowPage /> },
      { path: "jobs/:id", element: <JobDetailPage /> },
      { path: "invoice", element: <InvoicePage /> },
      { path: "tags", element: <TagsPage /> },
      { path: "customers", element: <CustomersPage /> },
      { path: "customers/new", element: <CustomerProfilePage /> },
      { path: "customers/:id", element: <CustomerProfilePage /> },
      { path: "wof-fails", element: <WofFailReasonsPage /> },
      { path: "xero-item-codes", element: <XeroItemCodesPage /> },
      { path: "service-settings", element: <ServiceCatalogPage /> },
      { path: "integrations", element: <IntegrationsPage /> },
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
