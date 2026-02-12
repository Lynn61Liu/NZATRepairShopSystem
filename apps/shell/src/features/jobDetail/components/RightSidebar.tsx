import { useState } from "react";
import { ChevronDown, ChevronUp, Car, User, Calendar } from "lucide-react";
import type { CustomerInfo, VehicleInfo } from "@/types";
import { JOB_DETAIL_TEXT } from "@/features/jobDetail/jobDetail.constants";
import { formatNzDateTime } from "@/utils/date";

type RightSidebarProps = {
  vehicle: VehicleInfo;
  customer: CustomerInfo;
  isOpen: boolean;
  onToggle: () => void;
};

export function RightSidebar({ vehicle, customer, isOpen, onToggle }: RightSidebarProps) {
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
            <button
              onClick={() => setCustomerExpanded((prev) => !prev)}
              className="w-full flex items-center justify-between rounded-[10px] border border-[var(--ds-border)] bg-[rgba(0,0,0,0.02)] px-3 py-3 hover:bg-[rgba(0,0,0,0.04)]"
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
