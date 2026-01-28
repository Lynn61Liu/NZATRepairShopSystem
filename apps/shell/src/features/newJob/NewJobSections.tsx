import type React from "react";
import { Link } from "react-router-dom";
import { Button, Input, SectionCard, Select } from "@/components/ui";
import { CustomerTypeToggle, ServiceOptionButton, VehicleInfoBanner } from "@/components/newJob";
import type { BusinessOption, CustomerType, ImportState, ServiceOption, ServiceType, VehicleInfo } from "./newJob.types";
import { PLATE_MAX_LENGTH } from "./newJob.utils";

type VehicleSectionProps = {
  rego: string;
  importState: ImportState;
  importError: string;
  vehicleInfo: VehicleInfo | null;
  onRegoChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
};

export function VehicleSection({ rego, importState, importError, vehicleInfo, onRegoChange }: VehicleSectionProps) {
  return (
    <SectionCard title="车辆信息">
      <div className="mt-3 grid grid-cols-4 gap-3">
        <div className="col-span-1 space-y-1">
          <label className="text-xs text-[rgba(0,0,0,0.55)] mb-1 block">
            车牌号 <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-2 items-end">
            <div className="flex-shrink-0">
              <Input
                placeholder="输入车牌"
                value={rego}
                onChange={onRegoChange}
                maxLength={PLATE_MAX_LENGTH}
                className={[
                  "px-3 text-sm font-semibold text-center rounded-[8px] border-2",
                  "bg-white tracking-widest",
                  "w-[140px]",
                  rego
                    ? "border-[var(--ds-primary)] text-[var(--ds-primary)]"
                    : "border-[rgba(0,0,0,0.10)] text-[rgba(0,0,0,0.70)]",
                ].join(" ")}
              />
            </div>
            {rego && (
              <span className="text-xs text-[rgba(0,0,0,0.45)] flex-shrink-0">
                {rego.length}/{PLATE_MAX_LENGTH}
              </span>
            )}
          </div>
          {importState === "loading" && (
            <div className="text-xs text-[rgba(37,99,235,0.85)] mt-1">正在抓取车辆信息…</div>
          )}
          {importState === "error" && <div className="text-xs text-red-600 mt-1">{importError}</div>}
          <div className="text-xs text-[rgba(0,0,0,0.45)] mt-1">例：ABC1234</div>
        </div>

        {vehicleInfo && importState === "success" && <VehicleInfoBanner info={vehicleInfo} />}
      </div>
    </SectionCard>
  );
}

type ServicesSectionProps = {
  selectedServices: ServiceType[];
  onToggleService: (service: ServiceType) => void;
  options: ServiceOption[];
};

export function ServicesSection({ selectedServices, onToggleService, options }: ServicesSectionProps) {
  return (
    <SectionCard title="服务项目">
      <div className="mt-3 space-y-3">
        <label className="text-xs text-[rgba(0,0,0,0.55)] block">
          请选择服务 <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-3 gap-3">
          {options.map((service) => (
            <ServiceOptionButton
              key={service.id}
              label={service.label}
              icon={service.icon}
              selected={selectedServices.includes(service.id)}
              onClick={() => onToggleService(service.id)}
            />
          ))}
        </div>
      </div>
    </SectionCard>
  );
}

type CustomerSectionProps = {
  customerType: CustomerType;
  onCustomerTypeChange: (next: CustomerType) => void;
  personalName: string;
  personalPhone: string;
  personalWechat: string;
  personalEmail: string;
  onPersonalNameChange: (value: string) => void;
  onPersonalPhoneChange: (value: string) => void;
  onPersonalWechatChange: (value: string) => void;
  onPersonalEmailChange: (value: string) => void;
  businessId: string;
  businessOptions: BusinessOption[];
  onBusinessChange: (value: string) => void;
};

export function CustomerSection({
  customerType,
  onCustomerTypeChange,
  personalName,
  personalPhone,
  personalWechat,
  personalEmail,
  onPersonalNameChange,
  onPersonalPhoneChange,
  onPersonalWechatChange,
  onPersonalEmailChange,
  businessId,
  businessOptions,
  onBusinessChange,
}: CustomerSectionProps) {
  return (
    <SectionCard title="客户信息">
      <div className="mt-3 space-y-4">
        <div>
          <label className="text-xs text-[rgba(0,0,0,0.55)] mb-2 block">
            客户类型 <span className="text-red-500">*</span>
          </label>
          <CustomerTypeToggle value={customerType} onChange={onCustomerTypeChange} />
        </div>

        {customerType === "personal" ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[rgba(0,0,0,0.55)] mb-1 block">
                名字 <span className="text-red-500">*</span>
              </label>
              <Input
                placeholder="输入客户名字"
                value={personalName}
                onChange={(event) => onPersonalNameChange(event.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-[rgba(0,0,0,0.55)] mb-1 block">电话</label>
              <Input
                placeholder="输入电话"
                value={personalPhone}
                onChange={(event) => onPersonalPhoneChange(event.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-[rgba(0,0,0,0.55)] mb-1 block">微信</label>
              <Input
                placeholder="输入微信"
                value={personalWechat}
                onChange={(event) => onPersonalWechatChange(event.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-[rgba(0,0,0,0.55)] mb-1 block">邮箱</label>
              <Input
                placeholder="输入邮箱"
                value={personalEmail}
                onChange={(event) => onPersonalEmailChange(event.target.value)}
              />
            </div>
          </div>
        ) : (
          <div>
            <label className="text-xs text-[rgba(0,0,0,0.55)] mb-1 block">
              选择商户 <span className="text-red-500">*</span>
            </label>
            <Select value={businessId} onChange={(event) => onBusinessChange(event.target.value)}>
              <option value="">-- 请选择 --</option>
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
  return (
    <SectionCard title="备注">
      <div className="mt-3">
        <label className="text-xs text-[rgba(0,0,0,0.55)] mb-1 block">备注信息（选填）</label>
        <textarea
          placeholder="输入备注信息"
          value={notes}
          onChange={(event) => onNotesChange(event.target.value)}
          rows={4}
          className={[
            "w-full rounded-[8px] border border-[rgba(0,0,0,0.10)] bg-white px-3 py-2 text-sm",
            "outline-none focus:border-[rgba(37,99,235,0.45)] focus:ring-2 focus:ring-[rgba(37,99,235,0.12)]",
            "resize-none",
          ].join(" ")}
        />
      </div>
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
        <Button variant="ghost">取消</Button>
      </Link>
      <Button variant="primary" onClick={onSave}>
        保存
      </Button>
    </div>
  );
}
