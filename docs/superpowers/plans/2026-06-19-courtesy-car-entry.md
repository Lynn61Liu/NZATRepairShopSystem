# Courtesy Car Customer Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a customer-facing courtesy car entry page with two paths: borrow goes straight into the existing draft flow, and return finds the matching agreement by plate and reuses the existing return action.

**Architecture:** Keep the new page thin. It will live outside the authenticated app frame, present two large entry cards, and call the existing courtesy-car agreement APIs instead of introducing new backend endpoints. A small shared helper will normalize plates and choose the most recent returnable agreement so the new page and any future callers can use the same matching rules.

**Tech Stack:** React 19, React Router, TypeScript, existing courtesy-car agreement API layer, existing UI primitives.

---

### Task 1: Add shared agreement lookup helper

**Files:**
- Create: `apps/shell/src/features/courtesyCarAgreements/plateLookup.ts`

- [ ] **Step 1: Write the lookup helper**

```ts
import type { CourtesyCarAgreementListItem } from "./types";

export function normalizeCourtesyCarPlate(raw: string) {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function findReturnableCourtesyCarAgreement(
  items: CourtesyCarAgreementListItem[],
  rawPlate: string
) {
  const plate = normalizeCourtesyCarPlate(rawPlate);
  return items
    .filter((item) => normalizeCourtesyCarPlate(item.jobVehiclePlate ?? "") === plate)
    .filter((item) => item.status === "active" || item.status === "submitted")
    .sort((left, right) => {
      const dateCompare = (right.updatedAt ?? right.createdAt).localeCompare(left.updatedAt ?? left.createdAt);
      if (dateCompare !== 0) return dateCompare;
      return right.id - left.id;
    })[0] ?? null;
}
```

- [ ] **Step 2: Use the helper from the new page and keep the matching rule centralized**

### Task 2: Create the customer-facing entry page

**Files:**
- Create: `apps/shell/src/pages/courtesyCarEntry/CourtesyCarEntryPage.tsx`
- Modify: `apps/shell/src/pages/courtesyCarAgreements/CourtesyCarAgreementPage.tsx`
- Modify: `apps/shell/src/features/courtesyCarAgreements/api.ts`

- [ ] **Step 1: Write the page component**

```tsx
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, CarFront, Undo2, Search } from "lucide-react";
import { Button, Card, Input, useToast } from "@/components/ui";
import { fetchCourtesyCarAgreementHistory, returnCourtesyCarAgreement } from "@/features/courtesyCarAgreements/api";
import { findReturnableCourtesyCarAgreement, normalizeCourtesyCarPlate } from "@/features/courtesyCarAgreements/plateLookup";

export function CourtesyCarEntryPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const [plate, setPlate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const agreementId = searchParams.get("agreementId");

  useEffect(() => {
    document.title = "Courtesy Car";
  }, []);

  const normalizedPlate = useMemo(() => normalizeCourtesyCarPlate(plate), [plate]);

  const handleReturn = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const historyRes = await fetchCourtesyCarAgreementHistory();
    if (!historyRes.ok) {
      setError(historyRes.error || "Failed to load agreement history.");
      setSubmitting(false);
      return;
    }

    const items = Array.isArray(historyRes.data?.items) ? historyRes.data.items : [];
    const match = findReturnableCourtesyCarAgreement(items, normalizedPlate);
    if (!match) {
      setError("No active courtesy car agreement was found for this plate.");
      setSubmitting(false);
      return;
    }

    const res = await returnCourtesyCarAgreement(match.id);
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error || "Return failed.");
      return;
    }

    toast.success(`Agreement #${match.id} returned.`);
    navigate(`/agreement-history?search=${encodeURIComponent(normalizedPlate)}`);
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)] px-4 py-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div>
          <div className="text-4xl font-bold tracking-[-0.04em] text-slate-900">Courtesy Car</div>
          <div className="mt-2 text-lg text-slate-500">Choose borrow or return.</div>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <Card onClick={() => navigate(agreementId ? `/courtesy-car-drafts/${agreementId}` : "/courtesy-car-drafts")} className="cursor-pointer">
            <div className="p-6">
              <CarFront />
              <div className="mt-4 text-2xl font-bold text-slate-900">Borrow</div>
              <div className="mt-2 text-sm text-slate-500">Open the draft agreement flow.</div>
              <Button className="mt-5 w-full" variant="primary" rightIcon={<ArrowRight className="h-4 w-4" />}>
                Go to drafts
              </Button>
            </div>
          </Card>
          <Card className="border-[rgba(0,0,0,0.08)]">
            <div className="p-6">
              <Undo2 />
              <div className="mt-4 text-2xl font-bold text-slate-900">Return</div>
              <div className="mt-2 text-sm text-slate-500">Enter the job plate and confirm the return.</div>
              <Input value={plate} onChange={(event) => setPlate(event.target.value)} className="mt-5" />
              <Button className="mt-4 w-full" variant="primary" onClick={handleReturn} disabled={submitting || normalizedPlate.length < 2}>
                Confirm return
              </Button>
              {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Point the existing customer launch button at this page and keep borrow flow landing on drafts**

### Task 3: Wire routes and launch paths

**Files:**
- Modify: `apps/shell/src/App.tsx`
- Modify: `apps/shell/src/features/courtesyCarAgreements/components/CourtesyCarAssignDialog.tsx`

- [ ] **Step 1: Add the `/courtesy-car` route outside `AppFrame`**
- [ ] **Step 2: Change the admin launch button to open `/courtesy-car?agreementId=...`**
- [ ] **Step 3: Keep the borrow card on the new page routing straight to `courtesy-car-drafts`**

### Task 4: Verify the build

**Files:**
- None

- [ ] **Step 1: Run the app typecheck/build**

```bash
pnpm --dir apps/shell build
```

- [ ] **Step 2: Fix any compile or route errors**
- [ ] **Step 3: Re-run the build until it passes**
