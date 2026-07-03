import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { createPortal } from "react-dom";
import { ArrowLeft, Camera, CheckCircle2, CarFront, FileText, ShieldCheck } from "lucide-react";
import { Alert, Button, Card, EmptyState, Input, TagPill } from "@/components/ui";
import {
  fetchCourtesyCarAgreement,
  submitCourtesyCarAgreement,
  validateCourtesyCarAgreementPreview,
  updateCourtesyCarAgreement,
  uploadCourtesyCarAttachment,
} from "@/features/courtesyCarAgreements/api";
import { getSubmitErrorMessage } from "@/features/courtesyCarAgreements/submitErrorMessage";
import type {
  CourtesyCarAgreementAttachment,
  CourtesyCarAgreementDetail,
  CourtesyCarAgreementStep,
} from "@/features/courtesyCarAgreements/types";
import { SignaturePad } from "@/features/courtesyCarAgreements/components/SignaturePad";

type StepKey = CourtesyCarAgreementStep;
type PhotoCaptureKind = "license_front" | "license_back";

const steps: Array<{ key: StepKey; label: string; hint: string }> = [
  { key: "contact", label: "驾驶人信息", hint: "填写 contact details 并上传驾照照片" },
  { key: "vehicle", label: "车辆信息", hint: "核对 Courtesy Car" },
  { key: "terms", label: "条款确认", hint: "阅读并勾选" },
  { key: "signature", label: "电子签名", hint: "签名并保存" },
  { key: "review", label: "最终预览", hint: "提交协议" },
];

type TermsChecklistItem = {
  id: string;
  en: string;
  zh: string;
};

const termsChecklist: TermsChecklistItem[] = [
  {
    id: "driver-authorised",
    en: "I confirm that I am the authorised driver named in this agreement and that I hold a current and valid driver licence for the courtesy vehicle.",
    zh: "我确认本人是本协议列明的授权驾驶人，并持有适用于本代步车的当前有效驾照。",
  },
  {
    id: "vehicle-details",
    en: "I confirm that I have checked the courtesy vehicle details, including the rego, WOF expiry, registration expiry, odometer, fuel level, keys released, and Agreed Vehicle Value of NZ$[Agreed Vehicle Value].",
    zh: "我确认本人已核对代步车信息，包括车牌、WOF 到期日、车辆注册到期日、公里数、油量、交付钥匙数量，以及约定车辆价值 NZ$[Agreed Vehicle Value]。",
  },
  {
    id: "no-insurance",
    en: "I understand that NZ AUTO TECH does not provide insurance cover for my benefit.",
    zh: "我理解 NZ AUTO TECH 不为本人利益提供保险保障。",
  },
  {
    id: "own-insurance",
    en: "I understand that I may arrange my own insurance before using the courtesy vehicle.",
    zh: "我理解本人可以在使用代步车前自行安排保险。",
  },
  {
    id: "liability-damage",
    en: "I accept responsibility for damage, accident, theft, loss, fines, tolls, third-party claims, insurance recovery action, legal consequences, and costs arising while the courtesy vehicle is in my possession or control, except where NZ AUTO TECH is legally responsible and that responsibility cannot be excluded.",
    zh: "我同意承担代步车在本人占有或控制期间产生的损坏、事故、盗窃、丢失、罚款、道路收费、第三方索赔、保险追偿、法律后果及费用，但 NZ AUTO TECH 依法必须承担且不能排除的责任除外。",
  },
  {
    id: "write-off-value",
    en: "I understand that if the courtesy vehicle is stolen, lost, written off, seized, impounded, or damaged beyond economical repair while in my possession or control, I may be required to pay NZ AUTO TECH the reasonable market value of the vehicle, up to the Agreed Vehicle Value stated in this agreement.",
    zh: "我理解，如代步车在本人占有或控制期间被盗、丢失、报废、扣押、拖走，或损坏至不具经济维修价值，本人可能需要向 NZ AUTO TECH 支付车辆的合理市场价值，最高不超过本协议列明的约定车辆价值。",
  },
  {
    id: "third-party-liability",
    en: "I understand that, as between me and NZ AUTO TECH, I am responsible for third-party property damage, claims, insurance recovery action, fines, tolls, legal liability, and costs arising from my possession, control, driving, parking, storage, or use of the courtesy vehicle, except where NZ AUTO TECH is legally responsible and that responsibility cannot be excluded.",
    zh: "我理解，在本人和 NZ AUTO TECH 之间，因本人占有、控制、驾驶、停放、存放或使用代步车而产生的第三方财产损失、索赔、保险追偿、罚款、道路收费、法律责任及费用，均由本人承担；但 NZ AUTO TECH 依法必须承担且不能排除的责任除外。",
  },
  {
    id: "auckland-only",
    en: "I understand that the courtesy vehicle must not be taken outside the Auckland Region without NZ AUTO TECH’s prior written approval.",
    zh: "我理解未经 NZ AUTO TECH 事先书面同意，不得将代步车带离奥克兰地区。",
  },
  {
    id: "roadside-limit",
    en: "I understand that NZ AUTO TECH’s roadside assistance, towing, recovery support, and repair arrangement for the courtesy vehicle are limited to the Auckland Region.",
    zh: "我理解 NZ AUTO TECH 对代步车提供的道路救援、拖车协助、救援支持及维修安排仅限于奥克兰地区内。",
  },
  {
    id: "no-daily-charge",
    en: "I understand that the courtesy vehicle is provided without a daily usage charge only if my vehicle repair, service, or assessment proceeds with NZ AUTO TECH.",
    zh: "我理解，只有在本人车辆最终由 NZ AUTO TECH 进行维修、保养或检测的情况下，代步车才不收取每日使用费用。",
  },
  {
    id: "daily-charge",
    en: "If I cancel, decline the quote, remove my vehicle, or do not proceed with the repair, service, or assessment through NZ AUTO TECH, I agree to pay NZ$20.00 including GST per calendar day or part day from Date Out until the courtesy vehicle is returned to and accepted by NZ AUTO TECH.",
    zh: "如本人取消预约、拒绝报价、取走车辆，或决定不通过 NZ AUTO TECH 进行维修、保养或检测，本人同意自代步车借出时间起至车辆归还并由 NZ AUTO TECH 接收为止，按每日或不足一日 NZ$20.00 含 GST 支付代步车使用费用。",
  },
  {
    id: "license-photos",
    en: "I understand that driver licence photos are collected for identity verification, driver confirmation, fines, tolls, accident, insurance, debt recovery, and legal compliance purposes only.",
    zh: "我理解驾照照片仅用于身份核验、驾驶人确认、罚款、道路收费、事故、保险、债务追讨及法律合规目的。",
  },
  {
    id: "email-agreement",
    en: "I agree that NZ AUTO TECH may email the signed agreement and return confirmation to the email address I have provided.",
    zh: "我同意 NZ AUTO TECH 可将已签署的协议及还车确认发送至本人提供的电子邮箱。",
  },
  {
    id: "english-prevails",
    en: "I confirm that I have read and understood the English version of this agreement. I understand the Chinese translation is provided for convenience only and the English version will prevail if there is any inconsistency.",
    zh: "我确认本人已阅读并理解本协议英文版本。我理解中文翻译仅为方便理解，如中英文内容存在任何不一致，应以英文版本为准。",
  },
];

function createTermsChecks(checked: boolean) {
  return Object.fromEntries(termsChecklist.map((item) => [item.id, checked])) as Record<string, boolean>;
}

const pageThemeStyle: CSSProperties & Record<string, string> = {
  "--ds-primary": "#2859d6",
  "--ds-border": "rgba(148, 163, 184, 0.26)",
};

const panelClass =
  "overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.06)]";

const buttonClass = "!h-12 rounded-[16px] px-5 text-[15px] font-semibold";
const secondaryButtonClass = `${buttonClass} border-slate-200 bg-white text-slate-700 hover:bg-slate-50`;
const primaryButtonClass = `${buttonClass} shadow-[0_14px_30px_rgba(40,89,214,0.18)]`;

function dataUrlToFile(dataUrl: string, fileName: string) {
  const [header, base64] = dataUrl.split(",");
  const mimeMatch = /data:(.*?);base64/.exec(header ?? "");
  const mimeType = mimeMatch?.[1] || "image/png";
  const binary = atob(base64 ?? "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], fileName, { type: mimeType });
}

function stepIndex(step: StepKey) {
  return Math.max(0, steps.findIndex((item) => item.key === step));
}

function attachmentKindList(agreement: CourtesyCarAgreementDetail | null, kind: string) {
  return (agreement?.attachments ?? []).filter((attachment) => attachment.kind === kind);
}

function revokeObjectUrl(url?: string) {
  if (!url?.startsWith("blob:") || typeof URL === "undefined") return;
  URL.revokeObjectURL(url);
}

function revokeObjectUrlAfterPaint(url?: string) {
  if (!url) return;
  if (typeof window === "undefined") {
    revokeObjectUrl(url);
    return;
  }
  window.setTimeout(() => revokeObjectUrl(url), 0);
}

function agreementStatusLabel(status: CourtesyCarAgreementDetail["status"]) {
  if (status === "in_progress" || status === "inprogress") return "In progress";
  if (status === "submitted") return "Submitted";
  if (status === "closed") return "Closed";
  if (status === "active") return "Active";
  if (status === "cancelled") return "Cancelled";
  return "Draft";
}

function agreementStatusVariant(status: CourtesyCarAgreementDetail["status"]) {
  if (status === "submitted") return "success";
  if (status === "active") return "warning";
  if (status === "in_progress" || status === "inprogress") return "primary";
  if (status === "closed") return "neutral";
  if (status === "cancelled") return "danger";
  return "neutral";
}

type CourtesyCarAgreementPageProps = {
  agreementIdOverride?: string;
  embedded?: boolean;
  onClose?: () => void;
};

export function CourtesyCarAgreementPage({
  agreementIdOverride,
  embedded = false,
  onClose,
}: CourtesyCarAgreementPageProps = {}) {
  const { agreementId: routeAgreementId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agreement, setAgreement] = useState<CourtesyCarAgreementDetail | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [contactForm, setContactForm] = useState({
    contactName: "",
    contactPhone: "",
    contactEmail: "",
    contactAddress: "",
  });
  const [licenseForm, setLicenseForm] = useState({
    emergencyContactName: "",
    emergencyContactPhone: "",
  });
  const [termsChecks, setTermsChecks] = useState<Record<string, boolean>>(() => createTermsChecks(false));
  const [signatureName, setSignatureName] = useState("");
  const [signatureDataUrl, setSignatureDataUrl] = useState("");
  const [pendingPhotoPreviews, setPendingPhotoPreviews] = useState<Partial<Record<PhotoCaptureKind, string>>>({});
  const pendingPhotoPreviewsRef = useRef(pendingPhotoPreviews);
  const [uploadingPhotoKinds, setUploadingPhotoKinds] = useState<Partial<Record<PhotoCaptureKind, boolean>>>({});
  const agreementId = agreementIdOverride ?? routeAgreementId;

  const activeStep = agreement?.currentStep ?? "contact";
  const activeStepIndex = stepIndex(activeStep);
  const termsConfirmed = termsChecklist.every((item) => Boolean(termsChecks[item.id]));
  const previewModalOpen = agreement?.currentStep === "review" && agreement?.status !== "submitted";

  useEffect(() => {
    pendingPhotoPreviewsRef.current = pendingPhotoPreviews;
  }, [pendingPhotoPreviews]);

  useEffect(() => {
    return () => {
      Object.values(pendingPhotoPreviewsRef.current).forEach(revokeObjectUrl);
    };
  }, []);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Courtesy Car Agreement";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    if (!previewModalOpen || typeof document === "undefined") return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [previewModalOpen]);

  useEffect(() => {
    let cancelled = false;
    if (!agreementId) return;

    setLoading(true);
    setError(null);
    void (async () => {
      const res = await fetchCourtesyCarAgreement(agreementId);
      if (cancelled) return;
      if (!res.ok) {
        setAgreement(null);
        setError(res.error || "Failed to load agreement.");
      } else {
        const nextAgreement = res.data?.agreement ?? null;
        setAgreement(nextAgreement);
        if (nextAgreement) {
          setContactForm({
            contactName: nextAgreement.contactName ?? nextAgreement.jobCustomerName ?? "",
            contactPhone: nextAgreement.contactPhone ?? nextAgreement.jobCustomerPhone ?? "",
            contactEmail: nextAgreement.contactEmail ?? nextAgreement.jobCustomerEmail ?? "",
            contactAddress: nextAgreement.contactAddress ?? nextAgreement.jobCustomerAddress ?? "",
          });
          setLicenseForm({
            emergencyContactName: nextAgreement.emergencyContactName ?? "",
            emergencyContactPhone: nextAgreement.emergencyContactPhone ?? "",
          });
          setTermsChecks(createTermsChecks(Boolean(nextAgreement.termsConfirmed)));
          setSignatureName(nextAgreement.signatureName ?? "");
          setSignatureDataUrl("");
        }
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [agreementId]);

  const refreshAgreement = async () => {
    if (!agreementId) return;
    const res = await fetchCourtesyCarAgreement(agreementId);
    if (!res.ok) {
      setActionError(res.error || "Failed to refresh agreement.");
      return false;
    }
    const nextAgreement = res.data?.agreement ?? null;
    setAgreement(nextAgreement);
    if (nextAgreement) {
      setContactForm({
        contactName: nextAgreement.contactName ?? nextAgreement.jobCustomerName ?? "",
        contactPhone: nextAgreement.contactPhone ?? nextAgreement.jobCustomerPhone ?? "",
        contactEmail: nextAgreement.contactEmail ?? nextAgreement.jobCustomerEmail ?? "",
        contactAddress: nextAgreement.contactAddress ?? nextAgreement.jobCustomerAddress ?? "",
      });
      setLicenseForm({
        emergencyContactName: nextAgreement.emergencyContactName ?? "",
        emergencyContactPhone: nextAgreement.emergencyContactPhone ?? "",
      });
      setTermsChecks(createTermsChecks(Boolean(nextAgreement.termsConfirmed)));
      setSignatureName(nextAgreement.signatureName ?? "");
      setSignatureDataUrl("");
    }
    return true;
  };

  const saveStep = async (payload: Record<string, unknown>, nextStep: StepKey) => {
    if (!agreementId || !agreement || saving) return;
    setSaving(true);
    setActionError(null);
    const res = await updateCourtesyCarAgreement(agreementId, { ...payload, currentStep: nextStep });
    setSaving(false);
    if (!res.ok) {
      setActionError(res.error || "Save failed.");
      return;
    }
    setAgreement(res.data?.agreement ?? null);
  };

  const mergeUploadedAttachment = (attachment: CourtesyCarAgreementAttachment) => {
    setAgreement((prev) => {
      if (!prev) return prev;
      const attachments = [...(prev.attachments ?? []).filter((item) => item.id !== attachment.id), attachment];
      return { ...prev, attachments, updatedAt: attachment.createdAt || prev.updatedAt };
    });
  };

  const uploadAttachment = async (kind: string, file: File) => {
    if (!agreementId) return false;
    setActionError(null);
    try {
      const res = await uploadCourtesyCarAttachment(agreementId, kind, file);
      if (!res.ok) {
        setActionError(res.error || "Attachment upload failed.");
        return false;
      }
      if (res.data?.attachment) {
        mergeUploadedAttachment(res.data.attachment);
        return true;
      }
      return refreshAgreement();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Attachment upload failed.");
      return false;
    }
  };

  const setPendingPhotoPreview = (kind: PhotoCaptureKind, url: string) => {
    setPendingPhotoPreviews((prev) => {
      const previous = prev[kind];
      if (previous && previous !== url) revokeObjectUrlAfterPaint(previous);
      return { ...prev, [kind]: url };
    });
  };

  const clearPendingPhotoPreview = (kind: PhotoCaptureKind) => {
    setPendingPhotoPreviews((prev) => {
      const previous = prev[kind];
      if (!previous) return prev;
      const next = { ...prev };
      delete next[kind];
      revokeObjectUrlAfterPaint(previous);
      return next;
    });
  };

  const setPhotoUploading = (kind: PhotoCaptureKind, isUploading: boolean) => {
    setUploadingPhotoKinds((prev) => {
      const next = { ...prev };
      if (isUploading) {
        next[kind] = true;
      } else {
        delete next[kind];
      }
      return next;
    });
  };

  const handleLicensePhotoPick = async (kind: PhotoCaptureKind, file: File) => {
    const objectUrl = URL.createObjectURL(file);
    setPendingPhotoPreview(kind, objectUrl);
    setPhotoUploading(kind, true);
    const success = await uploadAttachment(kind, file);
    setPhotoUploading(kind, false);
    if (success) {
      clearPendingPhotoPreview(kind);
    }
  };

  const handleSubmit = async () => {
    if (!agreementId || submitting) return;
    setSubmitting(true);
    setActionError(null);
    const res = await submitCourtesyCarAgreement(agreementId);
    setSubmitting(false);
    if (!res.ok) {
      setActionError(getSubmitErrorMessage(res.error));
      await refreshAgreement();
      return;
    }
    setAgreement(res.data?.agreement ?? null);
  };

  const signatureFiles = useMemo(() => attachmentKindList(agreement, "signature"), [agreement]);
  const licenseFrontFiles = useMemo(() => attachmentKindList(agreement, "license_front"), [agreement]);
  const licenseBackFiles = useMemo(() => attachmentKindList(agreement, "license_back"), [agreement]);
  const vehicleFiles = useMemo(() => attachmentKindList(agreement, "vehicle_photo"), [agreement]);
  const licenseFrontLatest = licenseFrontFiles[licenseFrontFiles.length - 1] ?? null;
  const licenseBackLatest = licenseBackFiles[licenseBackFiles.length - 1] ?? null;
  const licenseFrontPreview = pendingPhotoPreviews.license_front ?? licenseFrontLatest?.downloadUrl ?? "";
  const licenseBackPreview = pendingPhotoPreviews.license_back ?? licenseBackLatest?.downloadUrl ?? "";
  const allTermsChecked = termsChecklist.every((item) => Boolean(termsChecks[item.id]));

  if (loading) {
    return <div className="py-12 text-center text-sm text-slate-500">Loading agreement...</div>;
  }

  if (!agreement) {
    return (
      <EmptyState
        title="Agreement not found"
        description={error || "This courtesy car agreement does not exist."}
        onAction={embedded && onClose ? onClose : () => navigate("/courtesy-car-drafts")}
        actionLabel={embedded && onClose ? "返回列表" : "Back to drafts"}
      />
    );
  }

  const reviewCreatedAt = new Date(agreement.createdAt).toLocaleString("en-NZ", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const reviewSignatureAt = new Date(agreement.updatedAt).toLocaleString("en-NZ", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const reviewCustomerName = contactForm.contactName || agreement.jobCustomerName || "—";
  const reviewCustomerPhone = contactForm.contactPhone || agreement.jobCustomerPhone || "—";
  const reviewCustomerEmail = contactForm.contactEmail || agreement.jobCustomerEmail || "—";
  const reviewCustomerAddress = contactForm.contactAddress || agreement.jobCustomerAddress || "—";
  const reviewVehicleLabel = agreement.vehiclePlate || "—";
  const reviewVehicleName = [agreement.vehicleMake, agreement.vehicleModel].filter(Boolean).join(" ") || "—";
  const reviewVehicleValue = `NZ$${Number(agreement.agreedVehicleValue || 0).toLocaleString("en-NZ")}`;
  const reviewLicenseStatus = licenseFrontFiles.length > 0 || licenseBackFiles.length > 0 ? "Uploaded" : "Not uploaded";
  const reviewSignatureUrl = signatureFiles[0]?.downloadUrl ?? "";
  const reviewIsActive = agreement.status === "active";
  const reviewIsSubmitted = agreement.status === "submitted";
  const reviewPrimaryLabel = reviewIsActive ? "Send Email" : "Confirm & Submit";

  return (
    <div
      className={
        embedded
          ? "min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#f3f5f9_56%,#eef2f7_100%)] px-4 py-5 sm:px-6 lg:px-8"
          : "min-h-[calc(100vh-3rem)] -mx-6 -my-6 bg-[linear-gradient(180deg,#f8fafc_0%,#f3f5f9_56%,#eef2f7_100%)] px-4 py-5 sm:px-6 lg:px-8"
      }
      style={pageThemeStyle}
    >
      <div className="mx-auto flex w-full max-w-[1140px] flex-col gap-5">
        <div className="flex flex-wrap items-center gap-3 text-sm font-medium text-slate-500">
          {steps.map((step, index) => {
            const completed = index < activeStepIndex;
            const active = index === activeStepIndex;
            return (
              <button
                key={step.key}
                type="button"
                onClick={() => setAgreement((prev) => (prev ? { ...prev, currentStep: step.key } : prev))}
                className="flex items-center gap-3 text-left"
              >
                <div
                  className={[
                    "flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold transition",
                    completed ? "bg-emerald-100 text-emerald-700" : active ? "bg-[var(--ds-primary)] text-white" : "bg-white text-slate-500 shadow-sm ring-1 ring-slate-200",
                  ].join(" ")}
                >
                  {completed ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                </div>
                <div className={["min-w-0", active ? "text-slate-900" : "text-slate-500"].join(" ")}>
                  <div className={["text-[15px] font-semibold", active ? "text-slate-900" : "text-slate-500"].join(" ")}>{step.label}</div>
                  <div className="text-xs text-slate-400">{step.hint}</div>
                </div>
                {index < steps.length - 1 ? <div className="hidden h-px w-10 bg-slate-300/80 md:block" /> : null}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            {embedded && onClose ? (
              <Button onClick={onClose} className="!h-9 rounded-[999px] px-4 text-sm font-semibold">
                <ArrowLeft className="h-4 w-4" />
                返回列表
              </Button>
            ) : (
              <Link to="/courtesy-car-drafts" className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--ds-primary)]">
                <ArrowLeft className="h-4 w-4" />
                Back to draft list
              </Link>
            )}
            <div className="mt-3 text-3xl font-bold tracking-[-0.04em] text-slate-900 md:text-4xl">
              {agreement.jobVehiclePlate || "Courtesy Car Agreement"}
            </div>
            <div className="mt-2 text-sm text-slate-500 md:text-lg">
              Customer: {agreement.jobCustomerName || "—"} · Courtesy car: {agreement.vehiclePlate || "—"}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <TagPill label={agreementStatusLabel(agreement.status)} variant={agreementStatusVariant(agreement.status)} />
          </div>
        </div>

        {actionError ? <Alert variant="error" description={actionError} onClose={() => setActionError(null)} /> : null}

        {agreement.currentStep === "contact" ? (
          <Card className={panelClass}>
            <div className="p-6 md:p-8">
              <div className="text-[22px] font-semibold tracking-[-0.03em] text-slate-900 md:text-[24px]">
                客户信息 / Customer Details
              </div>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <Field label="姓名 / Name *">
                  <Input
                    value={contactForm.contactName}
                    onChange={(e) => setContactForm((p) => ({ ...p, contactName: e.target.value }))}
                    placeholder="Wei Zhang"
                    className="h-12 rounded-[14px] border-slate-200 bg-slate-50 px-4 text-[15px] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] placeholder:text-slate-400"
                  />
                </Field>
                <Field label="电话 / Phone *">
                  <Input
                    value={contactForm.contactPhone}
                    onChange={(e) => setContactForm((p) => ({ ...p, contactPhone: e.target.value }))}
                    placeholder="021 456 7890"
                    className="h-12 rounded-[14px] border-slate-200 bg-slate-50 px-4 text-[15px] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] placeholder:text-slate-400"
                  />
                </Field>
                <Field label="邮箱 / Email">
                  <Input
                    value={contactForm.contactEmail}
                    onChange={(e) => setContactForm((p) => ({ ...p, contactEmail: e.target.value }))}
                    placeholder="email@example.com"
                    className="h-12 rounded-[14px] border-slate-200 bg-slate-50 px-4 text-[15px] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] placeholder:text-slate-400"
                  />
                </Field>
                <Field label="地址 / Address">
                  <Input
                    value={contactForm.contactAddress}
                    onChange={(e) => setContactForm((p) => ({ ...p, contactAddress: e.target.value }))}
                    placeholder="12 Queen St, Auckland"
                    className="h-12 rounded-[14px] border-slate-200 bg-slate-50 px-4 text-[15px] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] placeholder:text-slate-400"
                  />
                </Field>
              </div>
              <div className="mt-6 border-t border-slate-200 pt-6">
                <div className="text-[16px] font-semibold tracking-[-0.02em] text-slate-900">
                  驾驶执照 / Driver&apos;s Licence
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <UploadBox
                    title="执照正面 / Licence Front"
                    previewUrl={licenseFrontPreview}
                    isUploading={Boolean(uploadingPhotoKinds.license_front)}
                    isPendingPreview={Boolean(pendingPhotoPreviews.license_front)}
                    count={licenseFrontFiles.length}
                    onPick={(file) => handleLicensePhotoPick("license_front", file)}
                  />
                  <UploadBox
                    title="执照背面 / Licence Back"
                    previewUrl={licenseBackPreview}
                    isUploading={Boolean(uploadingPhotoKinds.license_back)}
                    isPendingPreview={Boolean(pendingPhotoPreviews.license_back)}
                    count={licenseBackFiles.length}
                    onPick={(file) => handleLicensePhotoPick("license_back", file)}
                  />
                </div>
              </div>

              <div className="mt-6 border-t border-slate-200 pt-6">
                <div className="text-[16px] font-semibold tracking-[-0.02em] text-slate-900">
                  紧急联系人 / Emergency Contact *
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <Field label="姓名 / Name *">
                    <Input
                      value={licenseForm.emergencyContactName}
                      onChange={(e) => setLicenseForm((p) => ({ ...p, emergencyContactName: e.target.value }))}
                      placeholder="Li Zhang"
                      className="h-12 rounded-[14px] border-slate-200 bg-slate-50 px-4 text-[15px] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] placeholder:text-slate-400"
                    />
                  </Field>
                  <Field label="电话 / Phone *">
                    <Input
                      value={licenseForm.emergencyContactPhone}
                      onChange={(e) => setLicenseForm((p) => ({ ...p, emergencyContactPhone: e.target.value }))}
                      placeholder="021 999 8877"
                      className="h-12 rounded-[14px] border-slate-200 bg-slate-50 px-4 text-[15px] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] placeholder:text-slate-400"
                    />
                  </Field>
                </div>
              </div>
              <div className="mt-6 flex justify-end">
                <Button
                  variant="primary"
                  onClick={() =>
                    void saveStep(
                      {
                        contactName: contactForm.contactName,
                        contactPhone: contactForm.contactPhone,
                        contactEmail: contactForm.contactEmail,
                        contactAddress: contactForm.contactAddress,
                        emergencyContactName: licenseForm.emergencyContactName,
                        emergencyContactPhone: licenseForm.emergencyContactPhone,
                      },
                      "vehicle"
                    )
                  }
                  disabled={saving}
                  className={primaryButtonClass}
                >
                  Save & continue
                </Button>
              </div>
            </div>
          </Card>
        ) : null}

        {agreement.currentStep === "vehicle" ? (
          <Card className={panelClass}>
            <div className="p-6 md:p-8">
              <SectionHeader
                icon={<CarFront className="h-4 w-4" />}
                title="汽车信息"
                description="The agreed value is highlighted because it is what the customer confirms."
              />
              <div className="mt-6 rounded-[22px] border border-slate-200 bg-slate-50 p-5">
                <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                  <div className="text-[15px] font-semibold text-slate-900">
                    {agreement.vehiclePlate || "—"}
                  </div>
                  <div className="text-sm text-slate-500">
                    {[agreement.vehicleMake, agreement.vehicleModel].filter(Boolean).join(" ") || "—"}
                  </div>
                  <div className="text-sm text-slate-500">
                    {agreement.vehicleYear ? String(agreement.vehicleYear) : "—"}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 text-sm">
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-700">
                    Colour: <span className="font-semibold text-slate-900">{agreement.vehicleColor || "—"}</span>
                  </span>
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-700">
                    WOF: <span className="font-semibold text-slate-900">{agreement.vehicleWofExpiry || "—"}</span>
                  </span>
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-700">
                    Rego: <span className="font-semibold text-slate-900">{agreement.vehicleRegoExpiry || "—"}</span>
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-amber-200/70 bg-gradient-to-br from-amber-50 to-amber-100/60 px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">Agreed Vehicle Value</div>
                  <div className="text-xl font-bold tracking-[-0.03em] text-amber-950">
                    ${Number(agreement.agreedVehicleValue || 0).toLocaleString("en-NZ")}
                  </div>
                </div>
              </div>
              <div className="mt-5">
                <div className="text-sm font-semibold text-slate-900">Vehicle photos optional</div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <Button
                    onClick={async () => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = "image/*";
                      input.multiple = true;
                      input.onchange = async () => {
                        const files = Array.from(input.files ?? []);
                        for (const file of files) {
                          await uploadAttachment("vehicle_photo", file);
                        }
                      };
                      input.click();
                    }}
                    className={secondaryButtonClass}
                  >
                    Upload vehicle photo
                  </Button>
                  <div className="text-sm text-slate-500">{vehicleFiles.length} photos saved</div>
                </div>
              </div>
              <div className="mt-7 flex justify-between gap-3">
                <Button onClick={() => setAgreement((prev) => (prev ? { ...prev, currentStep: "contact" } : prev))} className={secondaryButtonClass}>
                  Back
                </Button>
                <Button
                  variant="primary"
                  onClick={() =>
                    void saveStep(
                      {
                        currentStep: "terms",
                      },
                      "terms"
                    )
                  }
                  disabled={saving}
                  className={primaryButtonClass}
                >
                  Save & continue
                </Button>
              </div>
            </div>
          </Card>
        ) : null}

        {agreement.currentStep === "terms" ? (
          <Card className={panelClass}>
            <div className="p-6 md:p-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <SectionHeader
                  icon={<ShieldCheck className="h-4 w-4" />}
                  title="Key Terms Summary and Mandatory Checkboxes"
                  description="重点条款摘要及强制确认项。All boxes must be checked before continuing."
                />
                <Button
                  onClick={() => setTermsChecks(createTermsChecks(!allTermsChecked))}
                  className={`${secondaryButtonClass} self-start`}
                >
                  {allTermsChecked ? "取消全选 / Clear All" : "全选 / Select All"}
                </Button>
              </div>

              <div className="mt-6 overflow-hidden rounded-[22px] border border-slate-200 bg-white">
                <div className="grid grid-cols-2 gap-0 border-b border-slate-200 bg-slate-50 px-5 py-3 text-sm font-semibold text-slate-900">
                  <div>English</div>
                  <div>中文</div>
                </div>
                <div className="divide-y divide-slate-200">
                  {termsChecklist.map((item) => {
                    const checked = Boolean(termsChecks[item.id]);
                    return (
                      <div
                        key={item.id}
                        className={[
                          "grid grid-cols-1 gap-0 md:grid-cols-2",
                          checked ? "bg-[rgba(40,89,214,0.04)]" : "bg-white",
                        ].join(" ")}
                      >
                        <label className="flex items-start gap-3 px-5 py-4 text-sm leading-6 text-slate-800">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => setTermsChecks((prev) => ({ ...prev, [item.id]: e.target.checked }))}
                            className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-[var(--ds-primary)]"
                          />
                          <span className="min-w-0">{item.en}</span>
                        </label>
                        <div className="border-t border-slate-200 px-5 py-4 text-sm leading-6 text-slate-500 md:border-l md:border-t-0">
                          {item.zh}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-5 rounded-[18px] border border-slate-200 bg-white p-4 text-sm text-slate-600">
                Please confirm every mandatory item to continue to signature.
              </div>
              <div className="mt-7 flex justify-between gap-3">
                <Button onClick={() => setAgreement((prev) => (prev ? { ...prev, currentStep: "vehicle" } : prev))} className={secondaryButtonClass}>
                  Back
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    if (!termsConfirmed) {
                      setActionError("Please confirm all mandatory checkboxes before continuing.");
                      return;
                    }
                    void saveStep({ termsConfirmed }, "signature");
                  }}
                  disabled={saving || !termsConfirmed}
                  className={primaryButtonClass}
                >
                  Save & continue
                </Button>
              </div>
            </div>
          </Card>
        ) : null}

        {agreement.currentStep === "signature" ? (
          <Card className={panelClass}>
            <div className="p-6 md:p-8">
              <div className="text-[22px] font-semibold tracking-[-0.03em] text-slate-900 md:text-[24px]">
                电子签名 / Electronic Signature
              </div>
              <div className="mt-6 rounded-[22px] border border-slate-200 bg-white p-5 md:p-6">
                <div className="text-[18px] font-semibold tracking-[-0.02em] text-slate-900">
                  {signatureName || agreement.contactName || agreement.jobCustomerName || "Borrower"} 确认已阅读并同意以上全部借车协议条款，并将代步车{" "}
                  {agreement.vehiclePlate || "—"} ({[agreement.vehicleMake, agreement.vehicleModel].filter(Boolean).join(" ") || "—"}) 借走。
                </div>
                <div className="mt-1 text-[18px] font-semibold tracking-[-0.02em] text-slate-500">
                  By signing, the borrower confirms they have read and agree to all terms for vehicle {agreement.vehiclePlate || "—"}.
                </div>
                <div className="mt-5">
                  <SignaturePad value={signatureDataUrl} onChange={setSignatureDataUrl} />
                </div>
              </div>
              <div className="mt-5 rounded-[22px] border border-slate-200 bg-white p-5 md:p-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <InfoLine label="日期 / Date" value={new Date(agreement.createdAt).toLocaleString("en-NZ", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })} />
                  <InfoLine label="代步车 / Vehicle" value={`${agreement.vehiclePlate || "—"} · ${[agreement.vehicleMake, agreement.vehicleModel].filter(Boolean).join(" ") || "—"}`} />
                  <InfoLine label="客户 / Customer" value={signatureName || agreement.contactName || agreement.jobCustomerName || "—"} />
                  <InfoLine label="电话 / Phone" value={contactForm.contactPhone || agreement.jobCustomerPhone || "—"} />
                  <InfoLine label="驾照 / Licence" value={licenseFrontFiles.length > 0 || licenseBackFiles.length > 0 ? "Uploaded" : "—"} />
                  <InfoLine label="约定价值 / Value" value={`$${Number(agreement.agreedVehicleValue || 0).toLocaleString("en-NZ")}`} />
                </div>
              </div>
              <div className="mt-7 flex items-center justify-between gap-3">
                <Button onClick={() => setAgreement((prev) => (prev ? { ...prev, currentStep: "terms" } : prev))} className={secondaryButtonClass}>
                  Back
                </Button>
                <Button
                  variant="primary"
                  onClick={async () => {
                    if (previewing) return;
                    setPreviewing(true);
                    setActionError(null);
                    if (!signatureDataUrl) {
                      setActionError("Please draw a signature first.");
                      setPreviewing(false);
                      return;
                    }
                    await saveStep({ signatureName }, "signature");
                    const file = dataUrlToFile(signatureDataUrl, `signature-${agreement.id}.png`);
                    const uploadOk = await uploadAttachment("signature", file);
                    if (!uploadOk) {
                      setPreviewing(false);
                      return;
                    }

                    const validationRes = await validateCourtesyCarAgreementPreview(agreement.id);
                    if (!validationRes.ok) {
                      setActionError(validationRes.error || "Failed to validate agreement readiness.");
                      setPreviewing(false);
                      return;
                    }

                    const validation = validationRes.data?.validation ?? null;
                    if (!validation?.isValid) {
                      setPreviewing(false);
                      const message = validation?.message || "The agreement is not ready for preview.";
                      if (embedded) {
                        setActionError(message);
                      } else {
                        navigate(`/courtesy-car-drafts/${agreement.id}/message`, {
                          state: { message },
                        });
                      }
                      return;
                    }

                    await saveStep({ currentStep: "review" }, "review");
                    setPreviewing(false);
                  }}
                  disabled={saving || previewing}
                  className={primaryButtonClass}
                  leftIcon={<FileText className="h-4 w-4" />}
                >
                  {previewing ? "Checking..." : "Preview Agreement"}
                </Button>
              </div>
            </div>
          </Card>
        ) : null}

        {previewModalOpen && typeof document !== "undefined"
          ? createPortal(
              <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-slate-950/60 px-0 py-0 backdrop-blur-[2px] sm:px-4 sm:py-4">
                <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-[#f4f5f9] sm:h-[calc(100dvh-2rem)] sm:max-w-[980px] sm:rounded-[28px] sm:border sm:border-slate-200 sm:shadow-[0_30px_100px_rgba(15,23,42,0.24)]">
                  <div className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4 md:px-6">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Agreement Preview</div>
                      <div className="mt-1 text-[22px] font-semibold tracking-[-0.03em] text-slate-900">Final English draft</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void saveStep({ currentStep: "signature" }, "signature")}
                      className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                    >
                      Close
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-6">
                    <div className="mx-auto max-w-[820px]">
                      <div className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.08)]">
                        <div className="px-6 py-8 sm:px-12 sm:py-12">
                          <div className="text-center">
                            <div className="text-[28px] font-semibold tracking-[-0.04em] text-slate-950 sm:text-[32px]">NZ AUTO TECH</div>
                            <div className="mt-2 text-[12px] font-medium uppercase tracking-[0.26em] text-slate-500 sm:text-[12px]">
                              Courtesy Vehicle Loan Agreement
                            </div>
                            <div className="mt-2 text-sm text-slate-500">English version only</div>
                          </div>

                          <PreviewDocumentSection title="Agreement Information">
                            <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
                              <PreviewFact label="Agreement Date" value={reviewCreatedAt} />
                              <PreviewFact label="Courtesy Vehicle" value={`${reviewVehicleLabel} · ${reviewVehicleName}`} />
                              <PreviewFact label="Agreed Vehicle Value" value={reviewVehicleValue} />
                              <PreviewFact label="WOF Expiry" value={agreement.vehicleWofExpiry || "—"} />
                              <PreviewFact label="Rego Expiry" value={agreement.vehicleRegoExpiry || "—"} />
                              <PreviewFact
                                label="Mileage / Fuel Level"
                                value={[agreement.vehicleMileage ? `${agreement.vehicleMileage.toLocaleString("en-NZ")} km` : null, agreement.vehicleFuelLevel || null]
                                  .filter(Boolean)
                                  .join(" · ") || "—"}
                              />
                            </div>
                          </PreviewDocumentSection>

                          <PreviewDocumentSection title="Borrower Details">
                            <div className="grid gap-x-10 gap-y-5 md:grid-cols-2">
                              <PreviewFact label="Full Name" value={reviewCustomerName} />
                              <PreviewFact label="Phone" value={reviewCustomerPhone} />
                              <PreviewFact label="Email" value={reviewCustomerEmail} />
                              <PreviewFact label="Address" value={reviewCustomerAddress} />
                              <PreviewFact label="Customer Plate" value={agreement.jobVehiclePlate || "—"} />
                              <PreviewFact
                                label="Emergency Contact"
                                value={[licenseForm.emergencyContactName || null, licenseForm.emergencyContactPhone || null].filter(Boolean).join(" · ") || "—"}
                              />
                            </div>
                          </PreviewDocumentSection>

                          <PreviewDocumentSection title="Vehicle Summary">
                            <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
                              <PreviewFact label="Plate" value={agreement.vehiclePlate || "—"} />
                              <PreviewFact label="Vehicle" value={reviewVehicleName} />
                              <PreviewFact label="Colour" value={agreement.vehicleColor || "—"} />
                              <PreviewFact label="Year" value={agreement.vehicleYear ? String(agreement.vehicleYear) : "—"} />
                              <PreviewFact label="Mileage" value={agreement.vehicleMileage ? `${agreement.vehicleMileage.toLocaleString("en-NZ")} km` : "—"} />
                              <PreviewFact label="Fuel Level" value={agreement.vehicleFuelLevel || "—"} />
                            </div>
                          </PreviewDocumentSection>

                          <PreviewDocumentSection title="Agreed Terms">
                            <div className="space-y-4">
                              {termsChecklist.map((item, index) => (
                                <div key={item.id} className="flex items-start gap-3 rounded-[18px] border border-slate-100 bg-slate-50/70 px-4 py-3 text-[15px] leading-7 text-slate-800">
                                  <div className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-[13px] font-bold leading-none text-emerald-700">✓</div>
                                  <div className="min-w-0">
                                    <span className="font-semibold text-slate-950">{index + 1}.</span> {item.en}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </PreviewDocumentSection>

                          <PreviewDocumentSection title="Borrower Signature">
                            <div>
                              <div className="text-[17px] font-semibold tracking-[-0.02em] text-slate-900">
                                {reviewCustomerName} confirms they have read and agree to all terms for vehicle {agreement.vehiclePlate || "—"}.
                              </div>
                              <div className="mt-2 text-sm text-slate-500">
                                By signing, the borrower confirms they accept the courtesy vehicle loan agreement in full.
                              </div>
                              <div className="mt-5 rounded-[24px] border-2 border-dashed border-slate-200 bg-slate-50 p-5">
                                {reviewSignatureUrl ? (
                                  <img src={reviewSignatureUrl} alt="Borrower signature" className="mx-auto max-h-32 w-full object-contain" />
                                ) : (
                                  <div className="flex h-36 items-center justify-center text-sm font-medium text-slate-400">
                                    Signature preview will appear here
                                  </div>
                                )}
                              </div>
                              <div className="mt-4 grid gap-4 md:grid-cols-2">
                                <PreviewFact label="Signed By" value={signatureName || reviewCustomerName} />
                                <PreviewFact label="Signed At" value={reviewSignatureAt} />
                              </div>
                            </div>
                          </PreviewDocumentSection>

                          <div className="mt-8 border-t border-slate-200 pt-5 text-xs leading-6 text-slate-500">
                            This English version is intended to be the legally operative agreement. Submitting will generate the PDF and email it to the customer automatically.
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="sticky bottom-0 border-t border-slate-200 bg-white/96 px-4 py-4 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur md:px-6">
                    <div className="mx-auto flex max-w-[820px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-sm text-slate-500">
                        {reviewIsSubmitted ? (
                          <span className="font-medium text-emerald-700">Agreement submitted. PDF emailed successfully.</span>
                        ) : reviewIsActive ? (
                          <span className="font-medium text-amber-700">PDF generated. Email is pending, click send email to retry.</span>
                        ) : (
                          <span>Licence: {reviewLicenseStatus} · Signature attachments: {signatureFiles.length} · Vehicle photos: {vehicleFiles.length}</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-3">
                        {agreement.pdfUrl ? (
                          <Button href={agreement.pdfUrl} target="_blank" rel="noreferrer" className={secondaryButtonClass}>
                            Open PDF
                          </Button>
                        ) : null}
                        {reviewIsSubmitted ? null : (
                          <Button onClick={() => void saveStep({ currentStep: "signature" }, "signature")} className={secondaryButtonClass}>
                            Back
                          </Button>
                        )}
                        {reviewIsSubmitted ? null : (
                          <Button variant="primary" onClick={() => void handleSubmit()} disabled={submitting} className={primaryButtonClass}>
                            {submitting ? "Sending..." : reviewPrimaryLabel}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>,
              document.body
            )
          : null}

        {agreement.status === "submitted" ? (
          <Card className={panelClass}>
            <div className="p-6 md:p-8">
              <SectionHeader
                icon={<CheckCircle2 className="h-4 w-4" />}
                title="Agreement submitted"
                description="The PDF has been emailed to the customer. Please ask them to check their inbox for the signed agreement."
              />
              <div className="mt-6 rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm leading-7 text-emerald-900">
                The agreement has been submitted successfully. Please ask the customer to check their email for the contract PDF.
              </div>
              <div className="mt-6 flex">
                <Button
                  variant="primary"
                  onClick={embedded && onClose ? onClose : () => navigate("/courtesy-car-drafts")}
                  className={primaryButtonClass}
                >
                  完成
                </Button>
              </div>
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function SectionHeader({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 rounded-[12px] border border-slate-200 bg-slate-50 p-2 text-[var(--ds-primary)]">{icon}</div>
      <div>
        <div className="text-[22px] font-semibold tracking-[-0.03em] text-slate-900">{title}</div>
        <div className="text-sm text-slate-500">{description}</div>
      </div>
    </div>
  );
}

function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={className}>
      <div className="mb-2 text-[15px] font-semibold text-slate-900">{label}</div>
      {children}
    </label>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1.5 text-sm">
      <div className="text-[15px] text-slate-500">{label}: <span className="font-semibold text-slate-900">{value}</span></div>
    </div>
  );
}

function PreviewSectionHeading({ title }: { title: string }) {
  return (
    <div className="border-b border-slate-200 pb-3 text-[18px] font-bold uppercase tracking-[0.12em] text-slate-950">
      {title}
    </div>
  );
}

function PreviewDocumentSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-7 rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.04)]">
      <PreviewSectionHeading title={title} />
      <div className="mt-5">{children}</div>
    </section>
  );
}

function PreviewFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className="text-[12px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="text-[15px] font-semibold leading-6 text-slate-900">{value}</div>
    </div>
  );
}

function UploadBox({
  title,
  count,
  previewUrl,
  isUploading,
  isPendingPreview,
  onPick,
}: {
  title: string;
  count: number;
  previewUrl?: string;
  isUploading?: boolean;
  isPendingPreview?: boolean;
  onPick: (file: File) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previewLabel = isUploading ? "上传中..." : isPendingPreview ? "照片未保存，请重新拍摄" : "已保存，可预览";
  const previewHint = isUploading ? "请稍等，不要关闭页面" : "点击重新拍摄 / Replace photo";

  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          try {
            await onPick(file);
          } catch (err) {
            console.error("Courtesy car photo upload failed", err);
          }
        }}
      />

      {previewUrl ? (
        <div className="overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-sm">
          <button
            type="button"
            disabled={isUploading}
            onClick={() => inputRef.current?.click()}
            className="block w-full overflow-hidden bg-slate-50 disabled:cursor-wait"
          >
            <div className="relative">
              <img src={previewUrl} alt={`${title} preview`} className="h-48 w-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/65 to-transparent px-3 py-2 text-left text-white">
                <div className="text-sm font-semibold">{previewLabel}</div>
                <div className="text-xs text-white/80">{previewHint}</div>
              </div>
            </div>
          </button>
          <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-3 py-3">
            <div className="text-xs text-slate-500">{count} file(s) saved</div>
            <button
              type="button"
              disabled={isUploading}
              onClick={() => inputRef.current?.click()}
              className="inline-flex h-9 items-center justify-center rounded-[10px] border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
            >
              重新拍摄
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex h-40 w-full flex-col items-center justify-center rounded-[20px] border-2 border-dashed border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:bg-slate-50"
        >
          <Camera className="h-7 w-7" />
          <div className="mt-2 text-[15px] font-semibold text-slate-600">拍照上传 / Take Photo</div>
          <div className="mt-1 text-xs text-slate-400">Use iPad camera to capture the licence</div>
        </button>
      )}

      <div className="text-xs text-slate-500">{count} file(s) saved</div>
    </div>
  );
}
