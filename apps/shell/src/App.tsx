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
import { WofSchedulePage } from "./pages/WofSchedulePage"; // 保留原有的 WofSchedule
import { ToastProvider } from "@/components/ui";
import { CustomerSelfServiceNewJobPage } from "./pages/customerSelfService/CustomerSelfServiceNewJobPage";
import { CourtesyCarsPage } from "./features/courtesyCars/CourtesyCarsPage";
import { CourtesyCarAgreementsPage } from "./pages/courtesyCarAgreements/CourtesyCarAgreementsPage";
import { CourtesyCarAgreementPage } from "./pages/courtesyCarAgreements/CourtesyCarAgreementPage";
import { CourtesyCarAgreementMessagePage } from "./pages/courtesyCarAgreements/CourtesyCarAgreementMessagePage";
import { AgreementHistoryPage } from "./pages/agreementHistory/AgreementHistoryPage";
import { CourtesyCarEntryPage } from "./pages/courtesyCarEntry/CourtesyCarEntryPage";
import { DeviceCommunicationPage } from "./pages/deviceCommunication/DeviceCommunicationPage";
import { LightFinderPage } from "./pages/LightFinderPage";
import { CarOnYardPage } from "./pages/carOnYard/CarOnYardPage";

// --- [从 Eric 版引入] 采购相关组件 ---
import Shopfront from "./components/Shopfront";
import { ProcurementAdmin } from "./pages/procurement/ProcurementAdmin";
// ----------------------------------

const router = createBrowserRouter([
  { path: "/paint-tech", element: <PaintTechBoardPage /> },
  { path: "/customer/new-job", element: <CustomerSelfServiceNewJobPage /> },
  { path: "/courtesy-car", element: <CourtesyCarEntryPage /> },
  { path: "/light-finder", element: <LightFinderPage /> },
  { path: "/staff-shop", element: <Shopfront /> },
  { path: "/car-on-yard-tv", element: <CarOnYardPage standalone /> },

  {
    path: "/",
    element: <AppFrame />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "jobs", element: <JobsPage /> },
      { path: "car-on-yard", element: <CarOnYardPage /> },
      { path: "paint-board", element: <PaintBoardPage /> },
      { path: "wof-schedule", element: <WofSchedulePage /> }, 
      { path: "courtesy-cars", element: <CourtesyCarsPage /> },
      { path: "courtesy-car-drafts", element: <CourtesyCarAgreementsPage /> },
      { path: "courtesy-car-drafts/:agreementId", element: <CourtesyCarAgreementPage /> },
      { path: "courtesy-car-drafts/:agreementId/message", element: <CourtesyCarAgreementMessagePage /> },
      { path: "agreement-history", element: <AgreementHistoryPage /> },
      { path: "po-dashboard-preview", element: <PoDashboardPreviewPage /> },
      { path: "device-communication", element: <DeviceCommunicationPage /> },
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
      
      // --- [新增] 采购系统路由 ---
      { path: "shop", element: <Shopfront /> },
      { path: "procurement-admin", element: <ProcurementAdmin /> },
      // -----------------------

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
