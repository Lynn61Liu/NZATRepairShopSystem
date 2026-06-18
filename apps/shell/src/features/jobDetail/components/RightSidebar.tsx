import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronUp, Car, User, Calendar, FileText, Mail, Clock3 } from "lucide-react";
import type { CustomerInfo, VehicleInfo, CourtesyCarAgreementSummary } from "@/types";
import { JOB_DETAIL_TEXT } from "@/features/jobDetail/jobDetail.constants";
import { formatNzDateTime } from "@/utils/date";
import { TagPill } from "@/components/ui";

type RightSidebarProps = {
  vehicle: VehicleInfo;
  customer: CustomerInfo;
  courtesyCarAgreement?: CourtesyCarAgreementSummary | null;
  isOpen: boolean;
  onToggle: () => void;
  onOpenCourtesyCarAssign?: () => void;
};

export function RightSidebar({
  vehicle,
  customer,
  courtesyCarAgreement,
  isOpen,
  onToggle,
  onOpenCourtesyCarAssign,
}: RightSidebarProps) {
  const [vehicleExpanded, setVehicleExpanded] = useState(false);
  const [customerExpanded, setCustomerExpanded] = useState(false);
  const formatValue = (value: unknown, asJson = false) => {
    if (value === null || value === undefined || value === "") return "—";
    if (asJson) {
      if (typeof value === "string") return value;
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return String(value);
      }
    }
    if (typeof value === "object") {
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
    return String(value);
  };

  const renderField = (label: string, value: unknown, options?: { json?: boolean }) => (
    <div className="flex items-start gap-3">
      <span className="text-[var(--ds-muted)] shrink-0">{label}:</span>
      <span
        className={[
          "font-medium text-[var(--ds-text)] text-right break-words min-w-0 ml-auto",
          options?.json ? "text-xs whitespace-pre-wrap font-mono" : "",
        ].join(" ")}
      >
        {formatValue(value, options?.json)}
      </span>
    </div>
  );

  const agreementStatusVariant = (status?: string | null): "primary" | "danger" | "neutral" | "success" | "warning" => {
    if (status === "submitted") return "success";
    if (status === "active" || status === "in_progress") return "warning";
    if (status === "closed") return "neutral";
    if (status === "cancelled") return "danger";
    return "primary";
  };
  const courtesyCarLabel = [courtesyCarAgreement?.vehicleMake, courtesyCarAgreement?.vehicleModel].filter(Boolean).join(" ") || "—";

  return (
    <aside
      className={[
        "relative rounded-[12px] border border-[var(--ds-border)] bg-[var(--ds-panel)] shadow-sm transition-all",
        isOpen ? "lg:w-[360px]" : "lg:w-12",
      ].join(" ")}
    >
      <button
        onClick={onToggle}
        className="absolute -left-3 top-4 h-6 w-6 rounded-full border border-[var(--ds-border)] bg-[var(--ds-panel)] text-xs text-[var(--ds-muted)] shadow"
        aria-label="Toggle sidebar"
      >
        {isOpen ? "<" : ">"}
      </button>

      {isOpen ? (
        <div className="space-y-4 p-4">
          <div>
            <div className="mb-4 rounded-[12px] border border-[rgba(37,99,235,0.16)] bg-[rgba(37,99,235,0.06)] p-4">
              <div className="text-sm font-semibold text-[var(--ds-text)]">代步车</div>
              <div className="mt-1 text-xs text-[var(--ds-muted)]">
                所有 Job 都可以在这里关联可用代步车，系统会立即创建草稿协议。
              </div>
              <button
                type="button"
                onClick={onOpenCourtesyCarAssign}
                className="mt-3 inline-flex h-9 items-center justify-center rounded-[8px] bg-[var(--ds-primary)] px-3 text-sm font-medium text-white transition hover:opacity-95"
              >
                关联代步车
              </button>
            </div>

            {courtesyCarAgreement ? (
              <div className="mb-4 rounded-[16px] border border-[rgba(16,185,129,0.18)] bg-[linear-gradient(180deg,rgba(236,253,245,0.95),rgba(240,253,250,0.82))] p-4 shadow-[0_10px_28px_rgba(15,23,42,0.06)]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-[var(--ds-text)]">Courtesy Car Agreement</div>
                      <div className="mt-1 text-xs text-[var(--ds-muted)]">
                        Job {vehicle.plate} is linked to this agreement.
                    </div>
                  </div>
                  <TagPill label={courtesyCarAgreement.status} variant={agreementStatusVariant(courtesyCarAgreement.status)} />
                </div>

                <div className="mt-4 grid gap-2 text-sm">
                  <div className="flex items-start gap-2 text-[var(--ds-muted)]">
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ds-primary)]" />
                    <div className="min-w-0">
                      <div className="font-medium text-[var(--ds-text)]">
                        {courtesyCarAgreement.vehiclePlate || "—"} {courtesyCarLabel !== "—" ? "·" : ""} {courtesyCarLabel}
                      </div>
                      <div className="text-xs text-[var(--ds-muted)]">Current step: {courtesyCarAgreement.currentStep}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-[var(--ds-muted)]">
                    <User className="h-4 w-4 shrink-0 text-[var(--ds-primary)]" />
                    <span className="min-w-0 break-words">{courtesyCarAgreement.contactName || customer.name}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[var(--ds-muted)]">
                    <Mail className="h-4 w-4 shrink-0 text-[var(--ds-primary)]" />
                    <span className="min-w-0 break-words">{courtesyCarAgreement.contactEmail || customer.email || "—"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[var(--ds-muted)]">
                    <Clock3 className="h-4 w-4 shrink-0 text-[var(--ds-primary)]" />
                    <span className="min-w-0 break-words">
                      {courtesyCarAgreement.emailSentAt
                        ? `Emailed ${formatNzDateTime(courtesyCarAgreement.emailSentAt)}`
                        : courtesyCarAgreement.pdfGeneratedAt
                          ? `PDF generated ${formatNzDateTime(courtesyCarAgreement.pdfGeneratedAt)}`
                          : "Waiting for PDF generation"}
                    </span>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    to={`/courtesy-car-drafts/${courtesyCarAgreement.id}`}
                    className="inline-flex h-9 items-center justify-center rounded-[8px] bg-[var(--ds-primary)] px-3 text-sm font-medium text-white transition hover:opacity-95"
                  >
                    Open agreement
                  </Link>
                  {courtesyCarAgreement.pdfUrl ? (
                    <a
                      href={courtesyCarAgreement.pdfUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-9 items-center justify-center rounded-[8px] border border-[var(--ds-border)] bg-white px-3 text-sm font-medium text-[var(--ds-text)] transition hover:bg-[rgba(0,0,0,0.03)]"
                    >
                      Open PDF
                    </a>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="text-sm font-semibold">{JOB_DETAIL_TEXT.labels.infoTitle}</div>
            <div className="text-xs text-[var(--ds-muted)]">{JOB_DETAIL_TEXT.labels.infoSubtitle}</div>
          </div>

          <div>
            <button
              onClick={() => setVehicleExpanded((prev) => !prev)}
              className="w-full flex items-center justify-between rounded-[10px] border border-[var(--ds-border)] bg-[rgba(0,0,0,0.02)] px-3 py-3 hover:bg-[rgba(0,0,0,0.04)]"
            >
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-[10px] bg-[var(--ds-border)] flex items-center justify-center">
                  <Car className="h-4 w-4 text-[var(--ds-primary)]" />
                </div>
                <span className="text-sm font-semibold text-[var(--ds-text)]">
                  {JOB_DETAIL_TEXT.labels.vehicleDetails}
                </span>
              </div>
              {vehicleExpanded ? (
                <ChevronUp className="h-4 w-4 text-[var(--ds-muted)]" />
              ) : (
                <ChevronDown className="h-4 w-4 text-[var(--ds-muted)]" />
              )}
            </button>

            {vehicleExpanded ? (
              <div className="mt-3 rounded-[10px] border border-[var(--ds-border)] p-3 space-y-4">
                <div>
                  <div className="text-xs font-semibold text-[var(--ds-text)] mb-2">Basic Information</div>
                  <div className="space-y-2 text-sm">
                    {renderField(JOB_DETAIL_TEXT.labels.plateNumber, vehicle.plate)}
                    {renderField("Make", vehicle.make)}
                    {renderField("Model", vehicle.model)}
                    {renderField(JOB_DETAIL_TEXT.labels.year, vehicle.year)}
                    {renderField("Colour", vehicle.colour)}
                    {renderField("Body Style", vehicle.bodyStyle)}
                  </div>
                </div>

                <div className="border-t border-[var(--ds-border)] pt-3">
                  <div className="text-xs font-semibold text-[var(--ds-text)] mb-2">Identifiers</div>
                  <div className="space-y-2 text-sm">
                    {renderField("VIN", vehicle.vin)}
                    {renderField("Engine", vehicle.engine)}
                    {renderField("Engine No", vehicle.engineNo)}
                    {renderField("Chassis", vehicle.chassis)}
                  </div>
                </div>

                <div className="border-t border-[var(--ds-border)] pt-3">
                  <div className="text-xs font-semibold text-[var(--ds-text)] mb-2">Specifications</div>
                  <div className="space-y-2 text-sm">
                    {renderField("CC Rating", vehicle.ccRating)}
                    {renderField("Fuel Type", vehicle.fuelType)}
                    {renderField("Seats", vehicle.seats)}
                    {renderField("Country of Origin", vehicle.countryOfOrigin)}
                    {renderField("Gross Vehicle Mass", vehicle.grossVehicleMass)}
                    {renderField("Refrigerant", vehicle.refrigerant)}
                  </div>
                </div>

                <div className="border-t border-[var(--ds-border)] pt-3">
                  <div className="text-xs font-semibold text-[var(--ds-text)] mb-2">Capacity & Range</div>
                  <div className="space-y-2 text-sm">
                    {renderField("Fuel Tank Capacity (L)", vehicle.fuelTankCapacityLitres)}
                    {renderField("Full Combined Range (km)", vehicle.fullCombinedRangeKm)}
                    {renderField("Odometer", vehicle.odometer)}
                  </div>
                </div>

                <div className="border-t border-[var(--ds-border)] pt-3">
                  <div className="text-xs font-semibold text-[var(--ds-text)] mb-2 flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5" />
                    Dates
                  </div>
                  <div className="space-y-2 text-sm">
                    {renderField("Registration Expiry", vehicle.regoExpiry)}
                    {renderField(`${JOB_DETAIL_TEXT.labels.wof} Expiry`, vehicle.wofExpiry)}
                    {renderField("NZ First Registration", vehicle.nzFirstRegistration)}
                    {renderField("Updated At", formatNzDateTime(vehicle.updatedAt))}
                  </div>
                </div>

              </div>
            ) : null}
          </div>

          <div>
            <div className="rounded-[10px] border border-[var(--ds-border)] bg-[rgba(0,0,0,0.02)] px-3 py-3">
              <button
                onClick={() => setCustomerExpanded((prev) => !prev)}
                className="flex w-full min-w-0 items-center justify-between hover:bg-[rgba(0,0,0,0.04)]"
              >
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-[10px] bg-[var(--ds-border)] flex items-center justify-center">
                    <User className="h-4 w-4 text-[var(--ds-primary)]" />
                  </div>
                  <span className="text-sm font-semibold text-[var(--ds-text)]">
                    {JOB_DETAIL_TEXT.labels.customerDetails}
                  </span>
                </div>
                {customerExpanded ? (
                  <ChevronUp className="h-4 w-4 text-[var(--ds-muted)]" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-[var(--ds-muted)]" />
                )}
              </button>
            </div>

            {customerExpanded ? (
              <div className="mt-3 rounded-[10px] border border-[var(--ds-border)] p-3 space-y-4">
                <div>
                  <div className="text-xs font-semibold text-[var(--ds-text)] mb-2">Basic Information</div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-[var(--ds-muted)]">{JOB_DETAIL_TEXT.labels.type}:</span>
                      <span className="font-medium text-[var(--ds-text)]">{customer.type}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--ds-muted)]">{JOB_DETAIL_TEXT.labels.name}:</span>
                      <span className="font-medium text-[var(--ds-text)]">{customer.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--ds-muted)]">{JOB_DETAIL_TEXT.labels.phone}:</span>
                      <span className="font-medium text-[var(--ds-text)]">{customer.phone}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--ds-muted)]">{JOB_DETAIL_TEXT.labels.email}:</span>
                      <span className="font-medium text-[var(--ds-text)] text-xs">{customer.email}</span>
                    </div>
                  </div>
                </div>

                <div className="border-t border-[var(--ds-border)] pt-3">
                  <div className="text-xs font-semibold text-[var(--ds-text)] mb-2">Address</div>
                  <div className="text-sm text-[var(--ds-muted)]">{customer.address}</div>
                </div>

                {customer.type === "Business" && customer.accountTerms ? (
                  <div className="border-t border-[var(--ds-border)] pt-3">
                    <div className="text-xs font-semibold text-[var(--ds-text)] mb-2">Business Terms</div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-[var(--ds-muted)]">Account Terms:</span>
                        <span className="font-medium text-[var(--ds-text)]">{customer.accountTerms}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--ds-muted)]">Discount:</span>
                        <span className="font-medium text-[var(--ds-primary)]">{customer.discount}</span>
                      </div>
                    </div>
                  </div>
                ) : null}

                {customer.notes ? (
                  <div className="border-t border-[var(--ds-border)] pt-3">
                    <div className="text-xs font-semibold text-[var(--ds-text)] mb-2">Notes</div>
                    <div className="text-sm text-[var(--ds-muted)] bg-[rgba(255,214,64,0.14)] border border-[rgba(255,214,64,0.45)] rounded-[8px] p-3">
                      {customer.notes}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex h-full items-center justify-center text-xs text-[rgba(0,0,0,0.45)]">
          Info
        </div>
      )}
    </aside>
  );
}
