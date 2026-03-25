import { useEffect, useState } from "react";
import { Alert, Button, Card, EmptyState, useToast } from "@/components/ui";
import { requestJson, withApiBase } from "@/utils/api";
import { ExternalLink, Mail, Power, RefreshCcw, ShieldCheck } from "lucide-react";

type GmailAccount = {
  id: number;
  email: string;
  isActive: boolean;
  isDefault: boolean;
  hasRefreshToken: boolean;
  updatedAt?: string | null;
};

type XeroAccount = {
  id: number;
  provider: string;
  tenantId?: string | null;
  tenantName?: string | null;
  isActive: boolean;
  isDefault: boolean;
  hasRefreshToken: boolean;
  scope?: string[];
  updatedAt?: string | null;
};

type GmailHealth = {
  configured: boolean;
  missing?: string[];
  apiReady: boolean;
  apiMissing?: string[];
  currentRedirectUri?: string | null;
  authorizedEmail?: string | null;
  activeAccountId?: number | null;
};

type XeroHealth = {
  configured: boolean;
  missing?: string[];
  apiReady: boolean;
  apiMissing?: string[];
  currentRedirectUri?: string | null;
  tenantId?: string | null;
  tenantName?: string | null;
};

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false }).replace(/\//g, "-");
}

function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "warning";
}) {
  const cls =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-[rgba(0,0,0,0.12)] bg-[rgba(0,0,0,0.04)] text-[rgba(0,0,0,0.62)]";

  return <span className={["rounded-full border px-2 py-0.5 text-[11px] font-semibold", cls].join(" ")}>{children}</span>;
}

export function IntegrationsPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [gmailHealth, setGmailHealth] = useState<GmailHealth | null>(null);
  const [xeroHealth, setXeroHealth] = useState<XeroHealth | null>(null);
  const [gmailAccounts, setGmailAccounts] = useState<GmailAccount[]>([]);
  const [xeroAccounts, setXeroAccounts] = useState<XeroAccount[]>([]);
  const [pageError, setPageError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const loadAll = async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setPageError(null);

    const [gmailHealthRes, gmailAccountsRes, xeroHealthRes, xeroAccountsRes] = await Promise.all([
      requestJson<GmailHealth>("/api/gmail/health"),
      requestJson<{ items: GmailAccount[] }>("/api/gmail/accounts"),
      requestJson<XeroHealth>("/api/xero/health"),
      requestJson<{ items: XeroAccount[] }>("/api/xero/accounts"),
    ]);

    if (!gmailHealthRes.ok || !xeroHealthRes.ok || !gmailAccountsRes.ok || !xeroAccountsRes.ok) {
      setPageError(
        gmailHealthRes.error ||
          gmailAccountsRes.error ||
          xeroHealthRes.error ||
          xeroAccountsRes.error ||
          "Failed to load integration settings."
      );
      setGmailHealth(gmailHealthRes.data);
      setXeroHealth(xeroHealthRes.data);
      setGmailAccounts(gmailAccountsRes.data?.items ?? []);
      setXeroAccounts(xeroAccountsRes.data?.items ?? []);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setGmailHealth(gmailHealthRes.data);
    setXeroHealth(xeroHealthRes.data);
    setGmailAccounts(gmailAccountsRes.data?.items ?? []);
    setXeroAccounts(xeroAccountsRes.data?.items ?? []);
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    void loadAll();
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const integration = url.searchParams.get("integration");
    const status = url.searchParams.get("status");
    const message = url.searchParams.get("message");
    if (!integration || !status || !message) return;

    if (status === "connected") toast.success(message);
    else toast.error(message);

    url.searchParams.delete("integration");
    url.searchParams.delete("status");
    url.searchParams.delete("message");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    void loadAll(true);
  }, [toast]);

  const openConnect = (provider: "gmail" | "xero") => {
    const returnUrl = `${window.location.origin}/integrations`;
    const path =
      provider === "gmail"
        ? `/api/gmail/connect?redirect=true&returnUrl=${encodeURIComponent(returnUrl)}`
        : `/api/xero/connect?redirect=true&returnUrl=${encodeURIComponent(returnUrl)}`;
    window.open(withApiBase(path), "_blank", "noopener,noreferrer");
  };

  const setDefaultGmail = async (id: number) => {
    setBusyKey(`gmail:${id}`);
    const res = await requestJson<{ message: string }>("/api/gmail/accounts/" + id + "/default", {
      method: "PUT",
    });
    setBusyKey(null);
    if (!res.ok) {
      toast.error(res.error || "Failed to switch Gmail account.");
      return;
    }
    toast.success("Default Gmail account updated");
    await loadAll(true);
  };

  const setDefaultXero = async (id: number) => {
    setBusyKey(`xero:${id}`);
    const res = await requestJson<{ message: string }>("/api/xero/accounts/" + id + "/default", {
      method: "PUT",
    });
    setBusyKey(null);
    if (!res.ok) {
      toast.error(res.error || "Failed to switch Xero account.");
      return;
    }
    toast.success("Default Xero account updated");
    await loadAll(true);
  };

  const disableGmail = async (id: number) => {
    setBusyKey(`gmail:disable:${id}`);
    const res = await requestJson<{ message: string }>(`/api/gmail/accounts/${id}/disable`, {
      method: "PUT",
    });
    setBusyKey(null);
    if (!res.ok) {
      toast.error(res.error || "Failed to disable Gmail account.");
      return;
    }
    toast.success("Gmail account disabled");
    await loadAll(true);
  };

  const disableXero = async (id: number) => {
    setBusyKey(`xero:disable:${id}`);
    const res = await requestJson<{ message: string }>(`/api/xero/accounts/${id}/disable`, {
      method: "PUT",
    });
    setBusyKey(null);
    if (!res.ok) {
      toast.error(res.error || "Failed to disable Xero account.");
      return;
    }
    toast.success("Xero account disabled");
    await loadAll(true);
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-sm font-semibold uppercase tracking-[0.08em] text-[rgba(0,0,0,0.42)]">Settings</div>
          <h1 className="text-2xl font-semibold text-[rgba(0,0,0,0.72)]">Account Switch</h1>
        
        </div>
        <Button
          onClick={() => void loadAll(true)}
          leftIcon={<RefreshCcw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />}
          disabled={refreshing || loading}
        >
          Refresh
        </Button>
      </div>

      {pageError ? <Alert variant="error" title="Load Failed" description={pageError} onClose={() => setPageError(null)} /> : null}

      <Card className="p-5">
        <div className="flex flex-col gap-4 border-b border-[rgba(0,0,0,0.06)] pb-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[18px] font-semibold text-[rgba(0,0,0,0.76)]">
              <Mail className="h-5 w-5 text-sky-600" />
              Gmail
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => openConnect("gmail")} variant="primary" leftIcon={<ExternalLink className="h-4 w-4" />}>
              Connect Gmail
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <Card className="border-[rgba(2,132,199,0.14)] bg-[rgba(2,132,199,0.03)] p-4 shadow-none">
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[rgba(0,0,0,0.44)]">OAuth App</div>
            <div className="mt-2 text-sm font-medium text-[rgba(0,0,0,0.7)]">{gmailHealth?.configured ? "Configured" : "Missing configuration"}</div>
            <div className="mt-1 text-xs text-[rgba(0,0,0,0.5)]">{gmailHealth?.currentRedirectUri || "Set Gmail__ClientId / Gmail__ClientSecret / Gmail__RedirectUri"}</div>
          </Card>
          <Card className="border-[rgba(5,150,105,0.14)] bg-[rgba(5,150,105,0.03)] p-4 shadow-none">
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[rgba(0,0,0,0.44)]">API Ready</div>
            <div className="mt-2 text-sm font-medium text-[rgba(0,0,0,0.7)]">{gmailHealth?.apiReady ? "Ready" : "Not ready"}</div>
            <div className="mt-1 text-xs text-[rgba(0,0,0,0.5)]">
              {gmailHealth?.apiReady ? `Active account: ${gmailHealth.authorizedEmail || "linked"}` : (gmailHealth?.apiMissing ?? []).join(", ") || "-"}
            </div>
          </Card>
          <Card className="border-[rgba(0,0,0,0.08)] p-4 shadow-none">
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[rgba(0,0,0,0.44)]">How It Works</div>
            <div className="mt-2 text-xs leading-5 text-[rgba(0,0,0,0.56)]">
              用户点击 connect 后，会跳到 Google 授权页。授权完成后，refresh token 写入 `gmail_accounts`，然后这里可以切默认账号。
            </div>
          </Card>
        </div>

        <div className="mt-5">
          {loading ? (
            <div className="py-6 text-sm text-[rgba(0,0,0,0.5)]">Loading Gmail accounts...</div>
          ) : gmailAccounts.length === 0 ? (
            <EmptyState message="No Gmail account has been connected yet." actionLabel="Connect Gmail" onAction={() => openConnect("gmail")} />
          ) : (
            <div className="space-y-3">
              {gmailAccounts.map((account) => (
                <Card key={account.id} className="p-4 shadow-none">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-[rgba(0,0,0,0.76)]">{account.email}</div>
                        {account.isDefault ? <Badge tone="success">Default</Badge> : null}
                        {account.isActive ? <Badge>Active</Badge> : <Badge tone="warning">Inactive</Badge>}
                        {account.hasRefreshToken ? <Badge>Refresh Token</Badge> : <Badge tone="warning">No Token</Badge>}
                      </div>
                      <div className="text-xs text-[rgba(0,0,0,0.5)]">Updated: {formatDate(account.updatedAt)}</div>
                    </div>
                    <Button
                      onClick={() => void setDefaultGmail(account.id)}
                      disabled={account.isDefault || busyKey === `gmail:${account.id}`}
                      leftIcon={<ShieldCheck className="h-4 w-4" />}
                    >
                      {busyKey === `gmail:${account.id}` ? "Switching..." : account.isDefault ? "Current Default" : "Set Default"}
                    </Button>
                    <Button
                      onClick={() => void disableGmail(account.id)}
                      disabled={!account.isActive || busyKey === `gmail:disable:${account.id}`}
                      leftIcon={<Power className="h-4 w-4" />}
                    >
                      {busyKey === `gmail:disable:${account.id}` ? "Disabling..." : "Disable"}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex flex-col gap-4 border-b border-[rgba(0,0,0,0.06)] pb-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[18px] font-semibold text-[rgba(0,0,0,0.76)]">
              <ShieldCheck className="h-5 w-5 text-indigo-600" />
              Xero
            </div>
        </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => openConnect("xero")} variant="primary" leftIcon={<ExternalLink className="h-4 w-4" />}>
              Connect Xero
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <Card className="border-[rgba(79,70,229,0.14)] bg-[rgba(79,70,229,0.03)] p-4 shadow-none">
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[rgba(0,0,0,0.44)]">OAuth App</div>
            <div className="mt-2 text-sm font-medium text-[rgba(0,0,0,0.7)]">{xeroHealth?.configured ? "Configured" : "Missing configuration"}</div>
            <div className="mt-1 text-xs text-[rgba(0,0,0,0.5)]">{xeroHealth?.currentRedirectUri || "Set Xero__ClientId / Xero__ClientSecret / Xero__RedirectUri"}</div>
          </Card>
          <Card className="border-[rgba(5,150,105,0.14)] bg-[rgba(5,150,105,0.03)] p-4 shadow-none">
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[rgba(0,0,0,0.44)]">API Ready</div>
            <div className="mt-2 text-sm font-medium text-[rgba(0,0,0,0.7)]">{xeroHealth?.apiReady ? "Ready" : "Not ready"}</div>
            <div className="mt-1 text-xs text-[rgba(0,0,0,0.5)]">
              {xeroHealth?.apiReady
                ? `${xeroHealth.tenantName || "Tenant"}${xeroHealth.tenantId ? ` · ${xeroHealth.tenantId}` : ""}`
                : (xeroHealth?.apiMissing ?? []).join(", ") || "-"}
            </div>
          </Card>
          <Card className="border-[rgba(0,0,0,0.08)] p-4 shadow-none">
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[rgba(0,0,0,0.44)]">How It Works</div>
            <div className="mt-2 text-xs leading-5 text-[rgba(0,0,0,0.56)]">
              用户授权后，refresh token 和 tenant 信息写入 `xero_tokens`。切换默认账号后，后端自动用默认 tenant 调 Xero API。
            </div>
          </Card>
        </div>

        <div className="mt-5">
          {loading ? (
            <div className="py-6 text-sm text-[rgba(0,0,0,0.5)]">Loading Xero accounts...</div>
          ) : xeroAccounts.length === 0 ? (
            <EmptyState message="No Xero tenant has been connected yet." actionLabel="Connect Xero" onAction={() => openConnect("xero")} />
          ) : (
            <div className="space-y-3">
              {xeroAccounts.map((account) => (
                <Card key={account.id} className="p-4 shadow-none">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-[rgba(0,0,0,0.76)]">{account.tenantName || account.tenantId || "Unnamed tenant"}</div>
                        {account.isDefault ? <Badge tone="success">Default</Badge> : null}
                        {account.isActive ? <Badge>Active</Badge> : <Badge tone="warning">Inactive</Badge>}
                        {account.hasRefreshToken ? <Badge>Refresh Token</Badge> : <Badge tone="warning">No Token</Badge>}
                      </div>
                      <div className="text-xs text-[rgba(0,0,0,0.5)]">
                        Tenant ID: {account.tenantId || "-"} · Updated: {formatDate(account.updatedAt)}
                      </div>
                    </div>
                    <Button
                      onClick={() => void setDefaultXero(account.id)}
                      disabled={account.isDefault || busyKey === `xero:${account.id}`}
                      leftIcon={<ShieldCheck className="h-4 w-4" />}
                    >
                      {busyKey === `xero:${account.id}` ? "Switching..." : account.isDefault ? "Current Default" : "Set Default"}
                    </Button>
                    <Button
                      onClick={() => void disableXero(account.id)}
                      disabled={!account.isActive || busyKey === `xero:disable:${account.id}`}
                      leftIcon={<Power className="h-4 w-4" />}
                    >
                      {busyKey === `xero:disable:${account.id}` ? "Disabling..." : "Disable"}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
