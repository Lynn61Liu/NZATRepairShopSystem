import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Car,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  Mail,
  MapPin,
  Paintbrush,
  Phone,
  Send,
  ShieldCheck,
  User,
} from "lucide-react";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { useToast } from "@/components/ui";
import { useJobSheetPrinter } from "@/features/printing/useJobSheetPrinter";
import type { SilentPrintRouteKey } from "@/features/printing/silentPrint.routes";
import { fetchJob } from "@/features/jobDetail/api/jobDetailApi";
import { withApiBase } from "@/utils/api";
import {
  buildSelfServiceJobPayload,
  getCustomerSelfServiceSteps,
  type CustomerSelfServiceFormState,
  type CustomerSelfServiceStep,
} from "./customerSelfServiceNewJobPage.utils";

type ServicePath = "wof" | "mechPaint";
type Step = CustomerSelfServiceStep;
type FormState = CustomerSelfServiceFormState;

type VehicleInfo = {
  plate?: string | null;
  make?: string | null;
  model?: string | null;
  year?: number | string | null;
  vin?: string | null;
  fuelType?: string | null;
  bodyStyle?: string | null;
  nzFirstRegistration?: string | null;
  wofExpiry?: string | null;
  odometer?: number | string | null;
  updatedAt?: string | null;
};

type LinkedCustomer = {
  source?: string;
  jobId?: number | string | null;
  customer?: {
    id?: number | string;
    type?: string | null;
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
  } | null;
} | null;

type PlateLookupResponse = {
  matchedJob?: boolean;
  importQueued?: boolean;
  vehicle?: VehicleInfo | null;
  linkedCustomer?: LinkedCustomer;
  error?: string;
};

type SubmitResponse = {
  jobId?: number | string;
  error?: string;
  errors?: string[];
};

type CustomerSelfPrintJob = {
  vehicle?: {
    plate?: string | null;
    make?: string | null;
    model?: string | null;
    year?: number | string | null;
    nzFirstRegistration?: string | null;
    vin?: string | null;
  } | null;
  customer?: {
    businessCode?: string | null;
    name?: string | null;
    notes?: string | null;
  } | null;
  createdAt?: string | null;
  hasWofService?: boolean | null;
  notes?: string | null;
};

type CustomerSelfPrintJobResponse = CustomerSelfPrintJob & {
  job?: CustomerSelfPrintJob | null;
};

type PrintStatus =
  | { phase: "idle"; message: string }
  | { phase: "sending"; message: string }
  | { phase: "sent"; message: string }
  | { phase: "error"; message: string };

const CUSTOMER_SELF_WOF_PRINT_PROMISES = new Map<string, Promise<unknown>>();

function getOrCreateCustomerSelfPrintPromise<T>(
  jobId: string,
  task: () => Promise<T>
): Promise<T> {
  const existing = CUSTOMER_SELF_WOF_PRINT_PROMISES.get(jobId);
  if (existing) {
    return existing as Promise<T>;
  }

  const next = task().finally(() => {
    CUSTOMER_SELF_WOF_PRINT_PROMISES.delete(jobId);
  }) as Promise<T>;
  CUSTOMER_SELF_WOF_PRINT_PROMISES.set(jobId, next);
  return next;
}

const initialForm: FormState = {
  plate: "",
  hasWof: false,
  name: "",
  phone: "",
  email: "",
  quoteEmail: "",
  quotePartsContent: "",
  notes: "",
  address: "",
  requiresQuote: false,
};

// CHANGED: image paths used by the landing page, WOF path, and Repair path.
// Files under apps/shell/public/images should be referenced from the browser as /images/filename.
const NZAT_LOGO_SRC = "/images/nzat-logo.jpg";
const WOF_LOGO_SRC = "/images/nzta-logo.png";
const REPAIR_CARD_IMAGE_SRC = "/images/car-repair-log.jpeg";

function normalizePlate(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
}

function countDigits(value: string) {
  return value.replace(/\D/g, "").length;
}

export function CustomerSelfServiceNewJobPage() {
  const [selectedPath, setSelectedPath] = useState<ServicePath | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const [vehicleInfo, setVehicleInfo] = useState<VehicleInfo | null>(null);
  const [plateLookup, setPlateLookup] = useState<PlateLookupResponse | null>(null);
  const [plateLookupLoading, setPlateLookupLoading] = useState(false);
  const [plateLookupError, setPlateLookupError] = useState("");
  const [matchedCustomerId, setMatchedCustomerId] = useState<string>("");
  const [customerLocked, setCustomerLocked] = useState(false);
  const [customerEdited, setCustomerEdited] = useState(false);
  const [step, setStep] = useState<Step>("plate");
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [createdJobId, setCreatedJobId] = useState("");
  const [printStatus, setPrintStatus] = useState<PrintStatus>({ phase: "idle", message: "等待发送机修单" });
  const toast = useToast();
  const customerSelfResolveById = useCallback(async (jobId: string) => {
    const res = await fetchJob(jobId);
    if (!res.ok) return null;

    const data = res.data as CustomerSelfPrintJobResponse | null | undefined;
    const job = data?.job ?? data ?? {};
    const row = {
      plate: job?.vehicle?.plate ?? "",
      vehicleModel: [job?.vehicle?.make, job?.vehicle?.model, job?.vehicle?.year]
        .filter(Boolean)
        .join(" "),
      customerCode: job?.customer?.businessCode ?? "",
      customerName: job?.customer?.name ?? "",
      createdAt: job?.createdAt ?? "",
      panels: null,
      nzFirstRegistration: job?.vehicle?.nzFirstRegistration ?? "",
      vin: job?.vehicle?.vin ?? "",
    };

    const routeKey = (job?.hasWofService ? "job-wof" : "job-mech") as SilentPrintRouteKey;

    return {
      row,
      notes: job?.notes ?? job?.customer?.notes ?? "",
      routeKey,
    };
  }, []);
  const { printById } = useJobSheetPrinter({
    printMode: "silent",
    onError: (message) => toast.error(message),
    resolveById: customerSelfResolveById,
  });
  const autoPrintTriggeredJobIdRef = useRef<string>("");

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "NZTA - New Job Request";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  const steps = useMemo(() => getCustomerSelfServiceSteps({ hasWof: form.hasWof }), [form.hasWof]);
  const currentStepIndex = Math.max(
    0,
    steps.findIndex((item) => item.id === step)
  );

  const updateForm = (updates: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...updates }));
    setSubmitError("");
  };

  const selectPath = (path: ServicePath) => {
    setSelectedPath(path);
    setForm((prev) => ({ ...prev, hasWof: path === "wof" }));
    setStep("plate");
    setTouched(false);
    setPlateLookupError("");
  };

  const goTo = (nextStep: Step) => {
    setTouched(false);
    setSubmitError("");
    setStep(nextStep);
  };

  const goBack = () => {
    if (step === "plate") {
      setSelectedPath(null);
      return;
    }
    if (step === "contact") goTo("plate");
    if (step === "quote") goTo("contact");
    if (step === "address") goTo("contact");
    if (step === "review") goTo(form.hasWof ? "address" : "quote");
  };

  const applyLinkedCustomer = (linkedCustomer: LinkedCustomer) => {
    const customer = linkedCustomer?.customer;
    if (!customer) return;

    setMatchedCustomerId(customer.id ? String(customer.id) : "");
    setCustomerLocked(Boolean(customer.id));
    setCustomerEdited(false);
    setForm((prev) => ({
      ...prev,
      name: String(customer.name || prev.name || ""),
      phone: String(customer.phone || prev.phone || ""),
      email: String(customer.email || prev.email || ""),
      quoteEmail: String(customer.email || prev.quoteEmail || ""),
      address: String(customer.address || prev.address || ""),
    }));
  };

  const lookupPlate = async () => {
    const normalized = normalizePlate(form.plate);
    if (normalized.length < 2 || plateLookupLoading) return;

    setTouched(true);
    setPlateLookupLoading(true);
    setPlateLookupError("");
    setSubmitError("");

    try {
      const res = await fetch(
        withApiBase(`/api/customer-self-service/jobs/plate-lookup?plate=${encodeURIComponent(normalized)}`)
      );
      const data = (await res.json().catch(() => null)) as PlateLookupResponse | null;
      if (!res.ok) {
        throw new Error(data?.error || "Plate lookup failed. Please try again.");
      }

      setPlateLookup(data);
      setVehicleInfo(data?.vehicle ?? null);
      if (data?.matchedJob) {
        applyLinkedCustomer(data.linkedCustomer ?? null);
      } else {
        setMatchedCustomerId("");
        setCustomerLocked(false);
        setCustomerEdited(false);
        setForm((prev) => ({
          ...prev,
          name: "",
          phone: "",
          email: "",
          quoteEmail: "",
          quotePartsContent: "",
          requiresQuote: false,
          address: "",
          notes: "",
        }));
      }
      goTo("contact");
    } catch (err) {
      setPlateLookupError(err instanceof Error ? err.message : "Plate lookup failed. Please try again.");
    } finally {
      setPlateLookupLoading(false);
    }
  };

  useEffect(() => {
    if (!plateLookup?.importQueued || vehicleInfo || !form.plate) return;

    let attempts = 0;
    let cancelled = false;
    const poll = async () => {
      attempts += 1;
      try {
        const res = await fetch(withApiBase(`/api/vehicles/by-plate?plate=${encodeURIComponent(form.plate)}`));
        if (!res.ok) return;
        const data = (await res.json().catch(() => null)) as { vehicle?: VehicleInfo | null } | null;
        if (!cancelled && data?.vehicle) {
          setVehicleInfo(data.vehicle);
        }
      } catch {
        // The review page still works while the background import is catching up.
      }
    };

    const timer = window.setInterval(() => {
      if (attempts >= 8) {
        window.clearInterval(timer);
        return;
      }
      void poll();
    }, 2500);

    void poll();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [form.plate, plateLookup?.importQueued, vehicleInfo]);

  useEffect(() => {
    if (step !== "success") return;
    if (selectedPath !== "wof") return;
    if (!createdJobId) return;
    if (autoPrintTriggeredJobIdRef.current === createdJobId) return;
    autoPrintTriggeredJobIdRef.current = createdJobId;
    setPrintStatus((prev) =>
      prev.phase === "sending" || prev.phase === "sent"
        ? prev
        : { phase: "sending", message: "正在发送机修单到打印机" }
    );

    let cancelled = false;
    void (async () => {
      const result = await getOrCreateCustomerSelfPrintPromise(createdJobId, () => printById(createdJobId, "mech"));
      if (cancelled) return;

      if (result.ok) {
        setPrintStatus({ phase: "sent", message: "已发送，正在等待打印完成" });
        return;
      }

      setPrintStatus({ phase: "error", message: result.error || "打印失败，请重试" });
    })();

    return () => {
      cancelled = true;
    };
  }, [createdJobId, printById, selectedPath, step]);

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError("");

    try {
      const res = await fetch(withApiBase("/api/customer-self-service/jobs"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildSelfServiceJobPayload({ form, matchedCustomerId, customerEdited })),
      });
      const data = (await res.json().catch(() => null)) as SubmitResponse | null;
      if (!res.ok) {
        throw new Error(data?.error || "Submission failed. Please try again.");
      }

      setCreatedJobId(data?.jobId ? String(data.jobId) : "");
      setStep("success");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    autoPrintTriggeredJobIdRef.current = "";
    setSelectedPath(null);
    setForm(initialForm);
    setVehicleInfo(null);
    setPlateLookup(null);
    setPlateLookupLoading(false);
    setPlateLookupError("");
    setMatchedCustomerId("");
    setCustomerLocked(false);
    setCustomerEdited(false);
    setStep("plate");
    setTouched(false);
    setSubmitting(false);
    setSubmitError("");
    setCreatedJobId("");
    setPrintStatus({ phase: "idle", message: "等待发送机修单" });
    CUSTOMER_SELF_WOF_PRINT_PROMISES.delete(createdJobId);
  };

  const serviceLabel = selectedPath === "wof" ? "WOF" : "Repair";
  // CHANGED: homepage + Repair use nzat.jpg; WOF keeps the old logo.
  const headerLogoSrc = selectedPath === "wof" ? WOF_LOGO_SRC : NZAT_LOGO_SRC;
  // CHANGED: keep the white header only for the transparent WOF logo.
  // CHANGED: the NZ Auto Tech logo background was sampled as #000000, so homepage + Repair use exact black.
  const useDarkHeader = selectedPath !== "wof";
  const headerShellClassName = [
    "mb-6 flex items-center justify-center rounded-3xl border shadow-2xl shadow-black/30 backdrop-blur-md",
    useDarkHeader
      ? "border-black bg-black px-6 py-5"
      : "border-white/15 bg-white/90 px-6 py-5",
  ].join(" ");
  return (
    <main
      className="min-h-screen w-screen bg-slate-950 bg-cover bg-center bg-no-repeat text-slate-900"
      style={{ backgroundImage: "url('/images/nzta-bg.jpg')" }}
    >
      <div className="min-h-screen w-full bg-slate-950/55 backdrop-blur-[2px]">
        <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-5 sm:px-8 sm:py-8">
          {step !== "success" ? (
            <header className={headerShellClassName}>
              <img
                src={headerLogoSrc}
                alt={selectedPath === "wof" ? "NZTA Waka Kotahi" : "NZ Auto Tech"}
                className="h-16 w-auto max-w-full object-contain sm:h-20"
              />
            </header>
          ) : null}

          <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-white/40 bg-white/95 shadow-2xl shadow-black/40 backdrop-blur-md">
            {selectedPath && step !== "success" ? <ProgressBar steps={steps} currentStepIndex={currentStepIndex} /> : null}

            <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-8 sm:py-8">
              {!selectedPath ? <PathSelection onSelect={selectPath} /> : null}

              {selectedPath && step === "plate" ? (
                <PlateStep
                  plate={form.plate}
                  touched={touched}
                  loading={plateLookupLoading}
                  error={plateLookupError}
                  serviceLabel={serviceLabel}
                  onPlateChange={(plate) => {
                    updateForm({ plate });
                    setVehicleInfo(null);
                    setPlateLookup(null);
                    setPlateLookupError("");
                  }}
                  onBack={goBack}
                  onNext={() => void lookupPlate()}
                />
              ) : null}

              {selectedPath && step === "contact" ? (
                <ContactStep
                  form={form}
                  touched={touched}
                  locked={customerLocked}
                  onChange={updateForm}
                  onEdit={() => {
                    setCustomerLocked(false);
                    setCustomerEdited(true);
                  }}
                  onBack={goBack}
                  onNext={() => {
                    setTouched(true);
                    if (form.name.trim().length >= 2 && countDigits(form.phone) >= 7) {
                      goTo(form.hasWof ? "address" : "quote");
                    }
                  }}
                />
              ) : null}

              {selectedPath && !form.hasWof && step === "quote" ? (
                <QuoteStep
                  form={form}
                  onChange={updateForm}
                  onBack={goBack}
                  onNext={() => goTo("review")}
                />
              ) : null}

              {selectedPath && form.hasWof && step === "address" ? (
                <AddressStep
                  form={form}
                  touched={touched}
                  locked={customerLocked}
                  onChange={updateForm}
                  onEdit={() => {
                    setCustomerLocked(false);
                    setCustomerEdited(true);
                  }}
                  onBack={goBack}
                  onNext={() => {
                    setTouched(true);
                    if (!form.hasWof || form.address.trim()) goTo("review");
                  }}
                />
              ) : null}

              {selectedPath && step === "review" ? (
                <ReviewStep
                  form={form}
                  vehicleInfo={vehicleInfo}
                  submitError={submitError}
                  submitting={submitting}
                  onBack={goBack}
                  onSubmit={submit}
                />
              ) : null}

              {step === "success" ? (
                <SuccessStep
                  jobId={createdJobId}
                  form={form}
                  serviceLabel={serviceLabel}
                  printStatus={printStatus}
                  onRetryPrint={() => {
                    setPrintStatus({ phase: "sending", message: "正在发送机修单到打印机" });
                    void (async () => {
                      const result = await getOrCreateCustomerSelfPrintPromise(createdJobId, () =>
                        printById(createdJobId, "mech")
                      );
                      if (result.ok) {
                        setPrintStatus({ phase: "sent", message: "已发送，正在等待打印完成" });
                        return;
                      }
                      setPrintStatus({ phase: "error", message: result.error || "打印失败，请重试" });
                    })();
                  }}
                  onReset={reset}
                />
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function PathSelection({ onSelect }: { onSelect: (path: ServicePath) => void }) {
  return (
    <StepShell title="Choose service" subtitle="Select the job path you want to create.">
      <div className="grid gap-4 sm:grid-cols-2">
        <PathCard
          title="WOF"
          icon={<ShieldCheck size={26} />}
          imageUrl="/images/nzta-bg.jpg"
          onClick={() => onSelect("wof")}
        />
        <PathCard
          title="Repair"
          icon={<Paintbrush size={26} />}
          imageUrl={REPAIR_CARD_IMAGE_SRC}
          onClick={() => onSelect("mechPaint")}
        />
      </div>
    </StepShell>
  );
}

function PathCard({
  title,
  icon,
  imageUrl,
  onClick,
}: {
  title: string;
  icon: ReactNode;
  imageUrl?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group overflow-hidden rounded-2xl border-2 border-slate-200 bg-white text-left shadow-lg shadow-slate-200/70 transition hover:-translate-y-0.5 hover:border-red-400 hover:shadow-xl"
    >
      <div
        className="flex aspect-[4/3] items-center justify-center bg-slate-900 bg-cover bg-center text-white"
        style={imageUrl ? { backgroundImage: `url('${imageUrl}')` } : undefined}
      >
        {imageUrl ? (
          <div className="flex h-full w-full items-center justify-center bg-slate-950/20 text-white">{icon}</div>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-slate-100 text-slate-500">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">{icon}</div>
            <div className="text-sm font-bold uppercase tracking-[0.14em] text-slate-400">Company logo</div>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between px-5 py-4">
        <div className="text-xl font-black text-slate-900">{title}</div>
        <ArrowRight className="text-red-500 transition group-hover:translate-x-1" size={22} />
      </div>
    </button>
  );
}

function ProgressBar({ steps, currentStepIndex }: { steps: { id: string; label: string }[]; currentStepIndex: number }) {
  return (
    <div className="border-b border-slate-200/80 bg-white/70 px-4 py-5 sm:px-8">
      <div className="relative flex items-start justify-between">
        <div className="absolute left-4 right-4 top-4 h-0.5 bg-slate-200" />
        <div
          className="absolute left-4 top-4 h-0.5 bg-red-500 transition-all"
          style={{ width: `${steps.length <= 1 ? 0 : (currentStepIndex / (steps.length - 1)) * 100}%` }}
        />
        {steps.map((item, index) => {
          const done = index < currentStepIndex;
          const active = index === currentStepIndex;
          return (
            <div key={item.id} className="relative z-10 flex min-w-12 flex-col items-center gap-1">
              <div
                className={[
                  "flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold",
                  done ? "border-red-500 bg-red-500 text-white" : "",
                  active ? "border-red-500 bg-white text-red-600" : "",
                  !done && !active ? "border-slate-200 bg-white text-slate-400" : "",
                ].join(" ")}
              >
                {done ? <CheckCircle2 size={16} /> : index + 1}
              </div>
              <span className={["hidden text-xs font-semibold sm:block", active ? "text-red-600" : "text-slate-400"].join(" ")}>
                {item.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PlateStep({
  plate,
  touched,
  loading,
  error,
  serviceLabel,
  onPlateChange,
  onBack,
  onNext,
}: {
  plate: string;
  touched: boolean;
  loading: boolean;
  error: string;
  serviceLabel: string;
  onPlateChange: (value: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const valid = plate.length >= 2;
  return (
    <StepShell icon={<Car size={34} />} title="Enter your plate" subtitle={serviceLabel}>
      <form
        className="flex flex-col items-center gap-5"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          onNext();
        }}
      >
        <div className={["w-full max-w-xs rounded-xl border-4 shadow-lg", touched && !valid ? "border-red-400" : "border-slate-900"].join(" ")}>
          <div className="rounded-md bg-yellow-400 px-4 py-3">
            <div className="mb-1 flex justify-between px-1 text-xs font-black text-blue-900/70">
              <span>NZ</span>
              <span>NZTA</span>
            </div>
            <input
              value={plate}
              onChange={(event) => onPlateChange(normalizePlate(event.target.value))}
              autoFocus
              inputMode="text"
              autoComplete="off"
              placeholder="ABC123"
              className="w-full bg-transparent py-2 text-center font-mono text-4xl font-black tracking-[0.22em] text-slate-900 outline-none placeholder:text-slate-500/60"
            />
          </div>
        </div>
        {touched && !valid ? <p className="text-sm font-medium text-red-600">Please enter a valid plate.</p> : null}
        {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
        <div className="flex w-full max-w-sm gap-3">
          <button type="button" onClick={onBack} className="flex h-14 items-center justify-center rounded-2xl border-2 border-slate-200 px-5 text-slate-600">
            <ArrowLeft size={20} />
          </button>
          <button
            className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-red-500 text-base font-bold text-white shadow-lg shadow-red-200 disabled:bg-slate-300"
            disabled={!valid || loading}
          >
            {loading ? "Checking..." : "Continue"} <ArrowRight size={20} />
          </button>
        </div>
      </form>
    </StepShell>
  );
}

function ContactStep({
  form,
  touched,
  locked,
  onChange,
  onEdit,
  onBack,
  onNext,
}: {
  form: FormState;
  touched: boolean;
  locked: boolean;
  onChange: (updates: Partial<FormState>) => void;
  onEdit: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const nameValid = form.name.trim().length >= 2;
  const phoneValid = countDigits(form.phone) >= 7;
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const focusAfterEditRef = useRef(false);

  const handleEdit = () => {
    focusAfterEditRef.current = true;
    onEdit();
    window.requestAnimationFrame(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    });
  };

  useEffect(() => {
    if (locked || !focusAfterEditRef.current) return;
    focusAfterEditRef.current = false;
    nameInputRef.current?.focus();
    nameInputRef.current?.select();
  }, [locked]);

  return (
    <StepShell icon={<User size={34} />} title="Your details" subtitle="So the workshop can contact you about this job.">
      <div className="flex flex-col gap-4">
        <CustomerLockNotice locked={locked} onEdit={handleEdit} />
        <Field label="Full name" icon={<User size={17} />} error={touched && !nameValid ? "Please enter your full name." : ""}>
          <input
            ref={nameInputRef}
            value={form.name}
            onChange={(event) => onChange({ name: event.target.value })}
            disabled={locked}
            autoComplete="name"
            placeholder="Jane Smith"
            className={fieldClass(touched && !nameValid, locked)}
          />
        </Field>
        <Field label="Phone number" icon={<Phone size={17} />} error={touched && !phoneValid ? "Please enter a valid phone number." : ""}>
          <input
            value={form.phone}
            onChange={(event) => onChange({ phone: event.target.value.replace(/[^\d\s\-+()]/g, "").slice(0, 20) })}
            disabled={locked}
            autoComplete="tel"
            inputMode="tel"
            placeholder="021 123 4567"
            className={fieldClass(touched && !phoneValid, locked)}
          />
        </Field>
        <StepActions onBack={onBack} onNext={onNext} nextDisabled={!nameValid || !phoneValid} />
      </div>
    </StepShell>
  );
}

function QuoteStep({
  form,
  onChange,
  onBack,
  onNext,
}: {
  form: FormState;
  onChange: (updates: Partial<FormState>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <StepShell icon={<ClipboardCheck size={34} />} title="Quote / 报价" subtitle="Choose whether this repair job needs a quote first. / 选择这个维修单是否需要先报价。">
      <div className="flex flex-col gap-4">
        <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <input
            type="checkbox"
            checked={form.requiresQuote}
            onChange={(event) => onChange({ requiresQuote: event.target.checked })}
            className="h-5 w-5 rounded border-slate-300 text-red-500 focus:ring-red-400"
          />
          <span className="text-base font-bold text-slate-800">Need a quote / 是否报价</span>
        </label>
        {form.requiresQuote ? (
          <>
            <Field label="报价内容 Quotation Details" icon={<ClipboardCheck size={17} />}>
              <textarea
                value={form.quotePartsContent}
                onChange={(event) => onChange({ quotePartsContent: event.target.value })}
                placeholder="报价内容（选填）Quotation Details (Optional)"
                className={`${fieldClass(false)} min-h-24 resize-y`}
              />
            </Field>
            <Field label="Email address" icon={<Mail size={17} />}>
              <input
                value={form.quoteEmail}
                onChange={(event) => onChange({ quoteEmail: event.target.value })}
                autoComplete="email "
                inputMode="email"
                placeholder="name@example.com (选填 Optional)"
                className={fieldClass(false)}
              />
            </Field>
          </>
        ) : null}

        <StepActions onBack={onBack} onNext={onNext} />
      </div>
    </StepShell>
  );
}

function AddressStep({
  form,
  touched,
  locked,
  onChange,
  onEdit,
  onBack,
  onNext,
}: {
  form: FormState;
  touched: boolean;
  locked: boolean;
  onChange: (updates: Partial<FormState>) => void;
  onEdit: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const addressValid = !form.hasWof || Boolean(form.address.trim());
  return (
    <StepShell icon={<MapPin size={34} />} title="Email and address" subtitle={form.hasWof ? "Vehicle address is required for WOF." : "Address is optional for this request."}>
      <div className="flex flex-col gap-4">
        <CustomerLockNotice locked={locked} onEdit={onEdit} />
        <Field label="Email address" icon={<Mail size={17} />}>
          <input
            value={form.email}
            onChange={(event) => onChange({ email: event.target.value })}
            disabled={locked}
            autoComplete="email"
            inputMode="email"
            placeholder="name@example.com"
            className={fieldClass(false, locked)}
          />
        </Field>
        <Field label="Address" icon={<MapPin size={17} />} error={touched && !addressValid ? "Vehicle address is required for WOF." : ""}>
          <AddressAutocomplete
            value={form.address}
            onChange={(address) => onChange({ address })}
            placeholder="Start typing the address"
            className={fieldClass(touched && !addressValid, locked)}
            maxSuggestions={10}
            disabled={locked}
          />
        </Field>
        <StepActions onBack={onBack} onNext={onNext} nextDisabled={!addressValid} />
      </div>
    </StepShell>
  );
}

function ReviewStep({
  form,
  vehicleInfo,
  submitting,
  submitError,
  onBack,
  onSubmit,
}: {
  form: FormState;
  vehicleInfo: VehicleInfo | null;
  submitting: boolean;
  submitError: string;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const contactRows: [string, ReactNode][] = form.hasWof
    ? [
        ["Name名字", form.name],
        ["Phone电话", form.phone],
        ["Email邮箱", valueOrDash(form.email)],
        ["Address地址", valueOrDash(form.address)],
      ]
    : [
        ["Name名字", form.name],
        ["Phone电话", form.phone],
        ["Quote报价", form.requiresQuote ? "是Yes" : "否No"],
      ];

  if (!form.hasWof && form.requiresQuote) {
    contactRows.push(
      ["报价内容QuoteDetails", valueOrDash(form.quotePartsContent)],
      ["Email邮箱", valueOrDash(form.quoteEmail)]
    );
  }

  return (
    <StepShell icon={<ClipboardCheck size={34} />} title="Review and submit" subtitle="Please check the details before creating the job.">
      <div className="flex flex-col gap-4">
        <ReviewBlock label="Vehicle">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex rounded-lg bg-yellow-400 px-4 py-2 font-mono text-2xl font-black tracking-[0.16em] text-slate-900">
              {form.plate}
            </span>
            <span className="text-base font-bold text-slate-800">{formatVehicleSummary(vehicleInfo)}</span>
          </div>
        </ReviewBlock>
        <ReviewBlock label="Contact">
          <DetailsTable rows={contactRows} />
        </ReviewBlock>
        {submitError ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{submitError}</div> : null}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            disabled={submitting}
            onClick={onBack}
            className="flex h-14 items-center justify-center rounded-2xl border-2 border-slate-200 px-5 text-slate-600 disabled:opacity-50"
          >
            <ArrowLeft size={20} />
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={onSubmit}
            className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-red-500 text-base font-bold text-white shadow-lg shadow-red-200 disabled:opacity-60"
          >
            {submitting ? "Submitting..." : "Submit job"} <Send size={20} />
          </button>
        </div>
      </div>
    </StepShell>
  );
}

function SuccessStep({
  jobId,
  form,
  serviceLabel,
  printStatus,
  onRetryPrint,
  onReset,
}: {
  jobId: string;
  form: FormState;
  serviceLabel: string;
  printStatus: PrintStatus;
  onRetryPrint: () => void;
  onReset: () => void;
}) {
  return (
    <div className="flex min-h-[620px] flex-col items-center justify-center gap-6 py-8 text-center">
      <div className="flex h-24 w-24 items-center justify-center rounded-full bg-green-500 text-white shadow-xl shadow-green-100">
        <CheckCircle2 size={52} />
      </div>
      <div>
        <h2 className="text-3xl font-black text-slate-900">Job submitted</h2>
        <p className="mt-2 text-slate-500">Your request has been received by NZAT Workshop.</p>
      </div>
      <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-8 py-5">
        <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Job ID</div>
        <div className="mt-1 font-mono text-4xl font-black text-slate-900">{jobId || "-"}</div>
      </div>
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-sm">
        <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">打印提示</div>
        <div className="mt-3 flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-500">
            {printStatus.phase === "sending" ? <Loader2 size={20} className="animate-spin" /> : <ClipboardCheck size={20} />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-base font-bold text-slate-900">{printStatus.message}</div>
            <div className="mt-1 text-sm leading-6 text-slate-500">WOF 提交已完成，系统会自动发送机修单到打印机。</div>
            {printStatus.phase === "error" ? (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={onRetryPrint}
                  className="h-10 rounded-xl bg-red-500 px-4 text-sm font-bold text-white shadow-sm shadow-red-200"
                >
                  重试发送
                </button>
                <span className="text-sm text-red-600">{printStatus.message}</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div className="grid w-full max-w-md grid-cols-2 gap-3 text-left">
        <div className="rounded-2xl bg-red-50 p-4">
          <div className="text-xs font-semibold uppercase text-red-500">Plate</div>
          <div className="mt-1 font-mono text-lg font-black tracking-widest">{form.plate}</div>
        </div>
        <div className="rounded-2xl bg-blue-50 p-4">
          <div className="text-xs font-semibold uppercase text-blue-500">Service</div>
          <div className="mt-1 font-bold">{serviceLabel}</div>
        </div>
      </div>
      <button
        type="button"
        onClick={onReset}
        className="mt-2 h-14 w-full max-w-md rounded-2xl border-2 border-slate-200 text-base font-bold text-slate-600"
      >
        Submit another job
      </button>
    </div>
  );
}

function StepShell({ icon, title, subtitle, children }: { icon?: ReactNode; title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <div className="flex flex-col items-center gap-3 text-center">
        {icon ? <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 text-red-500 shadow-inner">{icon}</div> : null}
        <div>
          <h2 className="text-2xl font-black text-slate-900">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function StepActions({ onBack, onNext, nextDisabled }: { onBack: () => void; onNext: () => void; nextDisabled?: boolean }) {
  return (
    <div className="flex gap-3 pt-2">
      <button type="button" onClick={onBack} className="flex h-14 items-center justify-center rounded-2xl border-2 border-slate-200 px-5 text-slate-600">
        <ArrowLeft size={20} />
      </button>
      <button
        type="button"
        disabled={nextDisabled}
        onClick={onNext}
        className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-red-500 text-base font-bold text-white shadow-lg shadow-red-200 disabled:bg-slate-300 disabled:shadow-none"
      >
        Continue <ArrowRight size={20} />
      </button>
    </div>
  );
}

function Field({ label, icon, error, children }: { label: string; icon?: ReactNode; error?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="flex items-center gap-2 text-sm font-bold text-slate-700">
        {icon ? <span className="text-slate-400">{icon}</span> : null}
        {label}
      </span>
      {children}
      {error ? <span className="text-xs font-semibold text-red-600">{error}</span> : null}
    </label>
  );
}

function ReviewBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <div className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-slate-400">{label}</div>
      <div className="whitespace-pre-wrap text-base text-slate-700">{children}</div>
    </div>
  );
}

function DetailsTable({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      {rows.map(([label, value]) => (
        <div key={label} className="grid grid-cols-[130px_minmax(0,1fr)] border-b border-slate-100 last:border-b-0">
          <div className="bg-slate-50 px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] text-slate-400">{label}</div>
          <div className="min-w-0 px-3 py-2 text-sm font-semibold text-slate-800">{value}</div>
        </div>
      ))}
    </div>
  );
}

function CustomerLockNotice({
  locked,
  onEdit,
}: {
  locked: boolean;
  onEdit: () => void;
}) {
  if (!locked) return null;

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
      <span>请确认个人信息无误。   如需修改，请点击 Edit。</span>
      <button type="button" onClick={onEdit} className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-bold text-white">
        Edit
      </button>
    </div>
  );
}

function fieldClass(hasError: boolean, disabled = false) {
  return [
    "h-14 w-full rounded-xl border-2 bg-white px-4 text-base text-slate-900 outline-none transition",
    disabled ? "cursor-not-allowed bg-slate-100 text-slate-500" : "",
    hasError ? "border-red-400 bg-red-50" : "border-slate-200 focus:border-red-400 focus:ring-4 focus:ring-red-100",
  ].join(" ");
}

function formatVehicleSummary(vehicle: VehicleInfo | null) {
  if (!vehicle) return "Vehicle details loading";
  const parts = [vehicle.year, vehicle.make, vehicle.model, vehicle.fuelType]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  return parts.length ? parts.join(" - ") : "Vehicle details loading";
}

function valueOrDash(value: unknown) {
  const text = String(value ?? "").trim();
  return text || "-";
}
