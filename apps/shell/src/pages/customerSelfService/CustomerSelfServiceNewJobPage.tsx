import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Car,
  CheckCircle2,
  ClipboardCheck,
  MapPin,
  Phone,
  Send,
  ShieldCheck,
  User,
  Wrench,
} from "lucide-react";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { withApiBase } from "@/utils/api";

type Step = "plate" | "wof" | "contact" | "address" | "review" | "success";

type FormState = {
  plate: string;
  hasWof: boolean | null;
  name: string;
  phone: string;
  notes: string;
  address: string;
};

type SubmitResponse = {
  jobId?: number | string;
  error?: string;
  errors?: string[];
};

const initialForm: FormState = {
  plate: "",
  hasWof: null,
  name: "",
  phone: "",
  notes: "",
  address: "",
};

function normalizePlate(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
}

function countDigits(value: string) {
  return value.replace(/\D/g, "").length;
}

export function CustomerSelfServiceNewJobPage() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [step, setStep] = useState<Step>("plate");
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [createdJobId, setCreatedJobId] = useState("");

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "NZAT Workshop - New Job";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  const steps = useMemo(
    () =>
      form.hasWof
        ? [
            { id: "plate", label: "Plate" },
            { id: "wof", label: "WOF" },
            { id: "contact", label: "Contact" },
            { id: "address", label: "Address" },
            { id: "review", label: "Review" },
          ]
        : [
            { id: "plate", label: "Plate" },
            { id: "wof", label: "WOF" },
            { id: "contact", label: "Contact" },
            { id: "review", label: "Review" },
          ],
    [form.hasWof]
  );
  const currentStepIndex = Math.max(
    0,
    steps.findIndex((item) => item.id === step)
  );

  const updateForm = (updates: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...updates }));
    setSubmitError("");
  };

  const goTo = (nextStep: Step) => {
    setTouched(false);
    setSubmitError("");
    setStep(nextStep);
  };

  const goBack = () => {
    if (step === "wof") goTo("plate");
    if (step === "contact") goTo("wof");
    if (step === "address") goTo("contact");
    if (step === "review") goTo(form.hasWof ? "address" : "contact");
  };

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError("");

    try {
      const res = await fetch(withApiBase("/api/customer-self-service/jobs"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plate: form.plate,
          hasWof: form.hasWof === true,
          name: form.name,
          phone: form.phone,
          notes: form.notes,
          address: form.hasWof ? form.address : undefined,
        }),
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
    setForm(initialForm);
    setStep("plate");
    setTouched(false);
    setSubmitting(false);
    setSubmitError("");
    setCreatedJobId("");
  };

  return (
    <main className="min-h-screen w-screen bg-slate-950 text-slate-900">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-5 sm:px-8 sm:py-8">
        {step !== "success" ? (
          <header className="mb-5 flex items-center justify-center gap-3 text-white">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-500 shadow-lg shadow-red-950/30">
              <Wrench size={26} />
            </div>
            <div>
              <h1 className="text-2xl font-black leading-tight">NZAT Workshop</h1>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">New job request</p>
            </div>
          </header>
        ) : null}

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl shadow-black/40">
          {step !== "success" ? <ProgressBar steps={steps} currentStepIndex={currentStepIndex} /> : null}

          <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-8 sm:py-8">
            {step === "plate" ? (
              <PlateStep
                plate={form.plate}
                touched={touched}
                onPlateChange={(plate) => updateForm({ plate })}
                onNext={() => {
                  setTouched(true);
                  if (form.plate.length >= 2) goTo("wof");
                }}
              />
            ) : null}

            {step === "wof" ? (
              <WofStep
                value={form.hasWof}
                onSelect={(hasWof) => updateForm({ hasWof })}
                onBack={goBack}
                onNext={() => {
                  setTouched(true);
                  if (form.hasWof !== null) goTo("contact");
                }}
                touched={touched}
              />
            ) : null}

            {step === "contact" ? (
              <ContactStep
                form={form}
                touched={touched}
                onChange={updateForm}
                onBack={goBack}
                onNext={() => {
                  setTouched(true);
                  if (form.name.trim().length >= 2 && countDigits(form.phone) >= 7) {
                    goTo(form.hasWof ? "address" : "review");
                  }
                }}
              />
            ) : null}

            {step === "address" ? (
              <AddressStep
                form={form}
                touched={touched}
                onChange={updateForm}
                onBack={goBack}
                onNext={() => {
                  setTouched(true);
                  if (form.address.trim()) goTo("review");
                }}
              />
            ) : null}

            {step === "review" ? (
              <ReviewStep
                form={form}
                submitError={submitError}
                submitting={submitting}
                onBack={goBack}
                onSubmit={submit}
              />
            ) : null}

            {step === "success" ? <SuccessStep jobId={createdJobId} form={form} onReset={reset} /> : null}
          </div>
        </section>
      </div>
    </main>
  );
}

function ProgressBar({ steps, currentStepIndex }: { steps: { id: string; label: string }[]; currentStepIndex: number }) {
  return (
    <div className="border-b border-slate-100 px-4 py-4 sm:px-8">
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
  onPlateChange,
  onNext,
}: {
  plate: string;
  touched: boolean;
  onPlateChange: (value: string) => void;
  onNext: () => void;
}) {
  const valid = plate.length >= 2;
  return (
    <StepShell icon={<Car size={34} />} title="Enter your plate" subtitle="Type your vehicle registration number.">
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
        <button className="flex h-14 w-full max-w-sm items-center justify-center gap-2 rounded-2xl bg-red-500 text-base font-bold text-white shadow-lg shadow-red-200 disabled:bg-slate-300" disabled={!valid}>
          Continue <ArrowRight size={20} />
        </button>
      </form>
    </StepShell>
  );
}

function WofStep({
  value,
  touched,
  onSelect,
  onBack,
  onNext,
}: {
  value: boolean | null;
  touched: boolean;
  onSelect: (value: boolean) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <StepShell icon={<ShieldCheck size={34} />} title="WOF inspection" subtitle="Does this job include a WOF inspection?">
      <div className="flex flex-col gap-4">
        <ChoiceButton
          selected={value === true}
          icon={<ShieldCheck size={30} />}
          title="Yes, include WOF"
          subtitle="We will also ask for the vehicle location."
          onClick={() => onSelect(true)}
        />
        <ChoiceButton
          selected={value === false}
          icon={<Wrench size={30} />}
          title="No WOF"
          subtitle="This will be created as a mechanical job."
          onClick={() => onSelect(false)}
        />
        {touched && value === null ? <p className="text-center text-sm font-medium text-red-600">Please choose one option.</p> : null}
        <StepActions onBack={onBack} onNext={onNext} nextDisabled={value === null} />
      </div>
    </StepShell>
  );
}

function ContactStep({
  form,
  touched,
  onChange,
  onBack,
  onNext,
}: {
  form: FormState;
  touched: boolean;
  onChange: (updates: Partial<FormState>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const nameValid = form.name.trim().length >= 2;
  const phoneValid = countDigits(form.phone) >= 7;
  return (
    <StepShell icon={<User size={34} />} title="Your details" subtitle="So the workshop can contact you about this job.">
      <div className="flex flex-col gap-4">
        <Field label="Full name" icon={<User size={17} />} error={touched && !nameValid ? "Please enter your full name." : ""}>
          <input
            value={form.name}
            onChange={(event) => onChange({ name: event.target.value })}
            autoComplete="name"
            placeholder="Jane Smith"
            className={fieldClass(touched && !nameValid)}
          />
        </Field>
        <Field label="Phone number" icon={<Phone size={17} />} error={touched && !phoneValid ? "Please enter a valid phone number." : ""}>
          <input
            value={form.phone}
            onChange={(event) => onChange({ phone: event.target.value.replace(/[^\d\s\-+()]/g, "").slice(0, 20) })}
            autoComplete="tel"
            inputMode="tel"
            placeholder="021 123 4567"
            className={fieldClass(touched && !phoneValid)}
          />
        </Field>
        <Field label="Notes" icon={<ClipboardCheck size={17} />}>
          <textarea
            value={form.notes}
            onChange={(event) => onChange({ notes: event.target.value })}
            rows={4}
            placeholder="Tell us what you need help with."
            className={`${fieldClass(false)} h-28 resize-none py-3`}
          />
        </Field>
        <StepActions onBack={onBack} onNext={onNext} nextDisabled={!nameValid || !phoneValid} />
      </div>
    </StepShell>
  );
}

function AddressStep({
  form,
  touched,
  onChange,
  onBack,
  onNext,
}: {
  form: FormState;
  touched: boolean;
  onChange: (updates: Partial<FormState>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const addressValid = Boolean(form.address.trim());
  return (
    <StepShell icon={<MapPin size={34} />} title="Vehicle address" subtitle="Required because this request includes WOF.">
      <div className="flex flex-col gap-4">
        <Field label="Vehicle address" icon={<MapPin size={17} />} error={touched && !addressValid ? "Vehicle address is required for WOF." : ""}>
          <AddressAutocomplete
            value={form.address}
            onChange={(address) => onChange({ address })}
            placeholder="Start typing the vehicle address"
            className={fieldClass(touched && !addressValid)}
            maxSuggestions={10}
          />
        </Field>
        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          Type a few letters, then choose the matching address from the list.
        </div>
        <StepActions onBack={onBack} onNext={onNext} nextDisabled={!addressValid} />
      </div>
    </StepShell>
  );
}

function ReviewStep({
  form,
  submitting,
  submitError,
  onBack,
  onSubmit,
}: {
  form: FormState;
  submitting: boolean;
  submitError: string;
  onBack: () => void;
  onSubmit: () => void;
}) {
  return (
    <StepShell icon={<ClipboardCheck size={34} />} title="Review and submit" subtitle="Please check the details before creating the job.">
      <div className="flex flex-col gap-4">
        <ReviewBlock label="Vehicle">
          <span className="inline-flex rounded-lg bg-yellow-400 px-4 py-2 font-mono text-2xl font-black tracking-[0.16em] text-slate-900">
            {form.plate}
          </span>
        </ReviewBlock>
        <ReviewBlock label="Service">
          {form.hasWof ? "WOF inspection" : "Mechanical job"}
        </ReviewBlock>
        <ReviewBlock label="Contact">
          <div className="font-semibold text-slate-900">{form.name}</div>
          <div className="text-slate-600">{form.phone}</div>
        </ReviewBlock>
        {form.hasWof ? (
          <ReviewBlock label="Vehicle address">
            {form.address}
          </ReviewBlock>
        ) : null}
        {form.notes.trim() ? <ReviewBlock label="Notes">{form.notes}</ReviewBlock> : null}
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

function SuccessStep({ jobId, form, onReset }: { jobId: string; form: FormState; onReset: () => void }) {
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
      <div className="grid w-full max-w-md grid-cols-2 gap-3 text-left">
        <div className="rounded-2xl bg-red-50 p-4">
          <div className="text-xs font-semibold uppercase text-red-500">Plate</div>
          <div className="mt-1 font-mono text-lg font-black tracking-widest">{form.plate}</div>
        </div>
        <div className="rounded-2xl bg-blue-50 p-4">
          <div className="text-xs font-semibold uppercase text-blue-500">Service</div>
          <div className="mt-1 font-bold">{form.hasWof ? "WOF" : "Mechanical"}</div>
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

function StepShell({ icon, title, subtitle, children }: { icon: ReactNode; title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 text-red-500">{icon}</div>
        <div>
          <h2 className="text-2xl font-black text-slate-900">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function ChoiceButton({
  selected,
  icon,
  title,
  subtitle,
  onClick,
}: {
  selected: boolean;
  icon: ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex w-full items-center gap-4 rounded-2xl border-2 p-5 text-left transition",
        selected ? "border-red-500 bg-red-50 shadow-lg shadow-red-100" : "border-slate-200 bg-white hover:border-slate-300",
      ].join(" ")}
    >
      <div className={["flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl", selected ? "bg-red-500 text-white" : "bg-slate-100 text-slate-600"].join(" ")}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-lg font-black text-slate-900">{title}</div>
        <div className="mt-1 text-sm text-slate-500">{subtitle}</div>
      </div>
      <div className={["h-7 w-7 rounded-full border-2", selected ? "border-red-500 bg-red-500" : "border-slate-300"].join(" ")} />
    </button>
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

function fieldClass(hasError: boolean) {
  return [
    "h-14 w-full rounded-xl border-2 bg-white px-4 text-base text-slate-900 outline-none transition",
    hasError ? "border-red-400 bg-red-50" : "border-slate-200 focus:border-red-400 focus:ring-4 focus:ring-red-100",
  ].join(" ");
}
