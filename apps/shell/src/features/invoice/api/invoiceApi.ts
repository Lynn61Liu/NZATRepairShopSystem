import { requestJson } from "@/utils/api";

export type XeroDraftInvoiceUiResult = {
  jobId: number;
  contactName: string;
  reference?: string | null;
  customerType: string;
  xeroInvoiceId: string;
  invoiceNumber: string;
  status: string;
  scope: string;
  accessTokenExpiresIn: number;
  lineItemCount: number;
  latestRefreshToken: string;
  refreshTokenUpdated: boolean;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitAmount: number;
    accountCode?: string | null;
  }>;
};

export function createXeroDraftInvoice(jobId: string) {
  return requestJson<XeroDraftInvoiceUiResult>(`/api/jobs/${encodeURIComponent(jobId)}/xero-draft-invoice`, {
    method: "POST",
  });
}
