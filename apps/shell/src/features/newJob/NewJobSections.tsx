import { type ChangeEvent, useState } from "react";
import { CarFront, ClipboardList, UserRound, NotebookText } from "lucide-react";
import { Link } from "react-router-dom";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { Button, Input, SectionCard, Select } from "@/components/ui";
import { CustomerTypeToggle, VehicleInfoBanner } from "@/features/newJob/components";
import type {
  BusinessOption,
  ChildServiceOption,
  CustomerType,
  ImportState,
  ServiceOption,
  ServiceType,
  VehicleInfo,
} from "./newJob.types";

type VehicleSectionProps = {
  rego: string;
  importState: ImportState;
  importError: string;
  vehicleInfo: VehicleInfo | null;
  onRegoChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onImport: () => void;
};

export function VehicleSection({
  rego,
  importState,
  importError,
  vehicleInfo,
  onRegoChange,
  onImport,
}: VehicleSectionProps) {
  return (
    <SectionCard title="vehicle information" titleIcon={<CarFront size={18} />} titleClassName="text-lg font-semibold">
      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-[320px_minmax(0,1fr)] xl:items-start">
        <div className="min-w-0 space-y-1">
          <label className="text-base text-[rgba(0,0,0,0.55)] mb-1 block"> License plate number <span className="text-red-500">*</span>
          </label>
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-shrink-0">
              <Input
                placeholder="Enter license plate"
                value={rego}
                onChange={onRegoChange}
                className={[
                  "px-3 text-base font-semibold text-center rounded-[8px] border-2",
                  "bg-white tracking-widest",
                  "w-[140px]",
                  rego
                    ? "border-[var(--ds-primary)] text-[var(--ds-primary)]"
                    : "border-[rgba(0,0,0,0.10)] text-[rgba(0,0,0,0.70)]",
                ].join(" ")}
              />
            </div>
            <Button
              // variant="ghost"
              className="min-w-[72px] px-4 bg-[var(--ds-primary)] text-black hover:bg-[var(--ds-primary)] hover:text-white disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
              onClick={onImport}
              disabled={!rego || importState === "loading"}
            >
              {importState === "loading" ? "Fetching" : "crawl"}
            </Button>
          </div>
          {rego ? <div className="text-base text-[rgba(0,0,0,0.45)]">Length {rego.length}</div> : null} {importState ==="loading" && (
            <div className="text-base text-[rgba(37,99,235,0.85)] mt-1">Capturing vehicle information...</div> )} {importState ==="error" && <div className="text-base text-red-600 mt-1">{importError}</div>}
          <div className="text-base text-[rgba(0,0,0,0.45)] mt-1">Example: ABC1234</div> </div> {vehicleInfo && importState ==="success" && <VehicleInfoBanner info={vehicleInfo} />}
      </div>
    </SectionCard>
  );
}

type ServicesSectionProps = {
  selectedServices: ServiceType[];
  onToggleService: (service: ServiceType) => void;
  options: ServiceOption[];
  mechOptionChoices: ChildServiceOption[];
  mechOptions: string[];
  onToggleMechOption: (id: string) => void;
  paintOptionChoices: ChildServiceOption[];
  paintOptions: string[];
  onTogglePaintOption: (id: string) => void;
  showPaintPanels: boolean;
  paintPanels: string;
  onPaintPanelsChange: (value: string) => void;
};

export function ServicesSection({
  selectedServices,
  onToggleService,
  options,
  mechOptionChoices,
  mechOptions,
  onToggleMechOption,
  paintOptionChoices,
  paintOptions,
  onTogglePaintOption,
  showPaintPanels,
  paintPanels,
  onPaintPanelsChange,
}: ServicesSectionProps) {
 

  return (
    <SectionCard
      title="Service type"
      titleIcon={<ClipboardList size={18} />}
      titleClassName="text-lg font-semibold"
    >
      <div className="mt-4 space-y-4">
        {options.map((service) => {
          const selected = selectedServices.includes(service.id);
          return (
            <div
              key={service.id}
              className={[
                "rounded-[12px] border-2 p-4 transition-colors",
                selected
                  ? "border-[rgba(220,38,38,0.88)] bg-[rgba(220,38,38,0.08)]"
                  : "border-[rgba(0,0,0,0.12)] bg-white",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-4">
                <button type="button" onClick={() => onToggleService(service.id)} className="flex-1 text-left">
                  <div className="flex items-start gap-3">
                    <span
                      className={[
                        "mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-[6px] border text-[13px] font-semibold",
                        selected
                          ? "border-[#dc2626] bg-[#dc2626] text-white"
                          : "border-[rgba(0,0,0,0.20)] bg-white text-transparent",
                      ].join(" ")}
                      aria-hidden="true"
                    >
                      ✓
                    </span>
                    <div className="mt-0.5 text-[rgba(0,0,0,0.40)]">
                      <service.icon size={18} />
                    </div>
                    <div>
                      <div className="text-base font-semibold text-[rgba(0,0,0,0.88)]">{service.label}</div>
                      <div className="text-base text-[rgba(0,0,0,0.55)]">
                        {/*{serviceDescriptions[service.id] || "Please select the corresponding service"}*/}
                      </div>
                    </div>
                  </div>
                </button>
                {service.id === "paint" && selected && showPaintPanels ? (
                  <div className="ml-auto flex items-center justify-end gap-2">
                    <label className="text-base font-semibold whitespace-nowrap text-[rgba(0,0,0,0.88)]"> Number of paint chips <span className="text-red-500">*</span>
                    </label>
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      value={paintPanels}
                      onChange={(event) => onPaintPanelsChange(event.target.value)}
                      className="h-[30px] w-[120px] rounded-[10px] bg-white"
                      placeholder="Enter the number of slices"
                    />
                  </div>
                ) : null}
              </div>

              {service.id === "mech" && selected ? (
                <div className="mt-4 pl-9">
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {mechOptionChoices.map((opt) => (
                      <label
                        key={opt.id}
                        className="flex items-center gap-2 text-base text-[rgba(0,0,0,0.82)]"
                      >
                        <input
                          type="checkbox"
                          checked={mechOptions.includes(opt.id)}
                          onChange={() => onToggleMechOption(opt.id)}
                          className="h-4 w-4 accent-[#dc2626]"
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}

              {service.id === "paint" && selected ? (
                <div className="mt-4 pl-9">
                  {paintOptionChoices.length ? (
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      {paintOptionChoices.map((opt) => (
                        <label
                          key={opt.id}
                          className="flex items-center gap-2 text-base text-[rgba(0,0,0,0.82)]"
                        >
                          <input
                            type="checkbox"
                            checked={paintOptions.includes(opt.id)}
                            onChange={() => onTogglePaintOption(opt.id)}
                            className="h-4 w-4 accent-[#dc2626]"
                          />
                          {opt.label}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div className="text-base text-[rgba(0,0,0,0.50)]">There is currently no configured spray paint sub-service</div>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

type CustomerSectionProps = {
  customerType: CustomerType;
  onCustomerTypeChange: (next: CustomerType) => void;
  personalName: string;
  personalPhone: string;
  // personalWechat: string;
  personalEmail: string;
  onPersonalNameChange: (value: string) => void;
  onPersonalPhoneChange: (value: string) => void;
  // onPersonalWechatChange: (value: string) => void;
  onPersonalEmailChange: (value: string) => void;
  customerAddress: string;
  onCustomerAddressChange: (value: string) => void;
  businessId: string;
  businessOptions: BusinessOption[];
  onBusinessChange: (value: string) => void;
  personalNameSuggestions: string[];
  onPersonalNameBlur?: () => void;
  matchHint?: string;
};

export function CustomerSection({
  customerType,
  onCustomerTypeChange,
  personalName,
  personalPhone,
  // personalWechat,
  personalEmail,
  onPersonalNameChange,
  onPersonalPhoneChange,
  // onPersonalWechatChange,
  onPersonalEmailChange,
  customerAddress,
  onCustomerAddressChange,
  businessId,
  businessOptions,
  onBusinessChange,
  personalNameSuggestions,
  onPersonalNameBlur,
  matchHint,
}: CustomerSectionProps) {
  return (
    <SectionCard title="Customer information" titleIcon={<UserRound size={18} />} titleClassName="text-lg font-semibold">
      <div className="mt-3 space-y-4">
        <div>
          <label className="text-base text-[rgba(0,0,0,0.55)] mb-2 block"> Customer Type <span className="text-red-500">*</span>
          </label>
          <CustomerTypeToggle value={customerType} onChange={onCustomerTypeChange} />
        </div>

        {matchHint ? (
          <div className="rounded-[10px] border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
            {matchHint}
          </div>
        ) : null}

        {customerType === "personal" ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-base text-[rgba(0,0,0,0.55)] mb-1 block">Name</label>
              <Input
                placeholder="Enter customer name"
                value={personalName}
                list="new-job-personal-customer-options"
                onChange={(event) => onPersonalNameChange(event.target.value)}
                onBlur={onPersonalNameBlur}
              />
              <datalist id="new-job-personal-customer-options">
                {personalNameSuggestions.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="text-base text-[rgba(0,0,0,0.55)] mb-1 block">Phone</label>
              <Input
                placeholder="Enter phone number"
                value={personalPhone}
                onChange={(event) => onPersonalPhoneChange(event.target.value)}
              />
            </div>
            {/*<div> <label className="text-base text-[rgba(0,0,0,0.55)] mb-1 block">WeChat</label> <Input placeholder="Enter WeChat" value={personalWechat} onChange={(event) => onPersonalWechatChange(event.target.value)} /> </div>*/}
            <div>
              <label className="text-base text-[rgba(0,0,0,0.55)] mb-1 block">Email</label>
              <Input
                placeholder="Enter email"
                value={personalEmail}
                onChange={(event) => onPersonalEmailChange(event.target.value)}
              />
            </div>
            <div className="">
              <label className="text-base text-[rgba(0,0,0,0.55)] mb-1 block">Address</label>
              <AddressAutocomplete
                placeholder="Enter address"
                value={customerAddress}
                onChange={onCustomerAddressChange}
              />
            </div>
          </div>
        ) : (
          <div>
            <label className="text-base text-[rgba(0,0,0,0.55)] mb-1 block"> Select merchant <span className="text-red-500">*</span>
            </label>
            <Select value={businessId} onChange={(event) => onBusinessChange(event.target.value)}>
              <option value="">-- Please select --</option>
              {businessOptions.map((biz) => (
                <option key={biz.id} value={biz.id}>
                  {biz.label}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

type NotesSectionProps = {
  notes: string;
  onNotesChange: (value: string) => void;
};

export function NotesSection({ notes, onNotesChange }: NotesSectionProps) {
  const [isOpen, setIsOpen] = useState(true);
  return (
    <SectionCard title="Notes"
      titleIcon={<NotebookText size={18} />}
      titleClassName="text-lg font-semibold"
      actions={
        <button
          className="text-base text-[var(--ds-muted)] hover:text-[var(--ds-text)]"
          onClick={() => setIsOpen((prev) => !prev)}
        >
          {isOpen ? "close" : "Expand"}
        </button>
      }
    >
      {isOpen ? (
        <div className="mt-3">
          <label className="text-base text-[rgba(0,0,0,0.55)] mb-1 block">Remarks information (optional)</label>
          <textarea
            placeholder="Enter notes"
            value={notes}
            onChange={(event) => onNotesChange(event.target.value)}
            rows={4}
            className={[
              "w-full rounded-[8px] border border-[rgba(0,0,0,0.10)] bg-white px-3 py-2 text-base",
              "outline-none focus:border-[rgba(37,99,235,0.45)] focus:ring-2 focus:ring-[rgba(37,99,235,0.12)]",
              "resize-none",
            ].join(" ")}
          />
        </div>
      ) : null}
    </SectionCard>
  );
}

type ActionsRowProps = {
  onSave: () => void;
};

export function ActionsRow({ onSave }: ActionsRowProps) {
  return (
    <div className="flex gap-3 justify-end bg-transparent p-0">
      <Link to="/jobs">
        <Button variant="ghost">Cancel</Button> </Link> <Button variant="primary" onClick={onSave}>save</Button>
    </div>
  );
}
