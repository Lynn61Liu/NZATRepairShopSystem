import { useEffect, useState, type ChangeEvent } from "react";
import { ArrowLeft } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Alert, SectionCard, Textarea } from "@/components/ui";
import {
  ActionsRow,
  CustomerSection,
  NotesSection,
  ServicesSection,
  VehicleSection,
  extractVehicleInfo,
  normalizePlateInput,
  serviceOptions,
  type BusinessOption,
  type CustomerType,
  type ImportState,
  type ServiceType,
  type VehicleInfo,
} from "@/features/newJob";
import { withApiBase } from "@/utils/api";

export function NewJobPage() {
  const navigate = useNavigate();
  const [rego, setRego] = useState("");
  const [vehicleInfo, setVehicleInfo] = useState<VehicleInfo | null>(null);
  const [importState, setImportState] = useState<ImportState>("idle");
  const [importError, setImportError] = useState("");
  const [lastRequestedPlate, setLastRequestedPlate] = useState("");
  const [selectedServices, setSelectedServices] = useState<ServiceType[]>([]);
  const [customerType, setCustomerType] = useState<CustomerType>("personal");
  const [personalName, setPersonalName] = useState("");
  const [personalPhone, setPersonalPhone] = useState("");
  const [personalWechat, setPersonalWechat] = useState("");
  const [personalEmail, setPersonalEmail] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [businessId, setBusinessId] = useState("");
  const [businessOptions, setBusinessOptions] = useState<BusinessOption[]>([]);
  const [notes, setNotes] = useState("");
  const [partsDescription, setPartsDescription] = useState("");
  const [formAlert, setFormAlert] = useState<{ variant: "error" | "success"; message: string } | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;
    const loadBusinesses = async () => {
      try {
        const res = await fetch(withApiBase("/api/customers"));
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(data?.error || "加载商户失败");
        }
        if (!cancelled) {
          const list = Array.isArray(data) ? data : [];
          const businesses = list
            .filter((item) => String(item?.type || "").toLowerCase() === "business")
            .map((item) => ({
              id: String(item.id),
              label: String(item.name || ""),
              businessCode: item.businessCode ? String(item.businessCode) : undefined,
            }))
            .filter((item) => item.label);
          setBusinessOptions(businesses);
        }
      } catch {
        if (!cancelled) {
          setBusinessOptions([]);
        }
      }
    };
    loadBusinesses();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleService = (service: ServiceType) => {
    setSelectedServices((prev) =>
      prev.includes(service) ? prev.filter((s) => s !== service) : [...prev, service]
    );
  };

  const resetImportState = () => {
    setImportState("idle");
    setImportError("");
    setVehicleInfo(null);
  };

  const fetchVehicleFromDb = async (plate: string) => {
    const res = await fetch(withApiBase(`/api/vehicles/by-plate?plate=${encodeURIComponent(plate)}`));
    const data = await res.json().catch(() => null);

    if (res.ok) return data;
    if (res.status === 404) return null;
    throw new Error(data?.error || "读取数据库失败");
  };

  const importVehicle = async (plate: string) => {

    //  console.log('in importVehicle:', plate, lastRequestedPlate, importState);
    if (plate === lastRequestedPlate || importState === "loading") return;
    setLastRequestedPlate(plate);
    setImportState("loading");
    setImportError("");
    setVehicleInfo(null);

    try {
     
      const res = await fetch(withApiBase("/api/carjam/import"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plate }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || "导入失败，请稍后重试 or Link");
      }

      const dbData = await fetchVehicleFromDb(plate);
      if (!dbData) {
        throw new Error("已导入，但未在数据库中找到车辆");
      }

      console.log("vehicle from db", dbData?.vehicle ?? dbData);
      setVehicleInfo(extractVehicleInfo(dbData));
      setImportState("success");
    } catch (err) {
      setImportState("error");
      setImportError(err instanceof Error ? err.message : "导入失败，请稍后重试");
    }
  };

  const handleImportClick = async () => {
    const normalized = normalizePlateInput(rego);
    if (!normalized) return;

    try {
      setImportState("loading");
      setImportError("");
      setVehicleInfo(null);

      const dbData = await fetchVehicleFromDb(normalized);
      if (dbData) {
        console.log("vehicle from db", dbData?.vehicle ?? dbData);
        setVehicleInfo(extractVehicleInfo(dbData));
        setImportState("success");
        return;
      }

      setImportState("idle");
      await importVehicle(normalized);
    } catch (err) {
      setImportState("error");
      setImportError(err instanceof Error ? err.message : "导入失败，请稍后重试");
    }
  };

  const handleRegoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const normalized = normalizePlateInput(event.target.value);
    if (normalized === null) return;

    setRego(normalized);
    resetImportState();
  };

  const handleSave = async () => {
    setFormAlert(null);
    if (!rego) {
      setFormAlert({ variant: "error", message: "请输入车牌号" });
      return;
    }
    // if (customerType === "personal" && !personalName) {
    //   setFormAlert({ variant: "error", message: "请输入客户名字" });
    //   return;
    // }
    if (customerType === "business" && !businessId) {
      setFormAlert({ variant: "error", message: "请选择商户" });
      return;
    }

    const selectedBusiness = businessOptions.find((biz) => biz.id === businessId);
    const hasMech = selectedServices.includes("mech");
    const customerName = customerType === "personal" ? personalName : selectedBusiness?.label ?? "";

    // if (customerType === "personal") {

    // } else {
    //   console.log("Business ID:", businessId);
    // }
    // console.log("===========selectedServices============", selectedServices);


    
    const customerPayload =
      customerType === "personal"
        ? {
            type: customerType,
            name: customerName,
            phone: personalPhone || undefined,
            email: personalEmail || undefined,
            address: customerAddress || undefined,
            notes,
          }
        : {
            type: customerType,
            name: customerName,
            businessCode: selectedBusiness?.businessCode ?? selectedBusiness?.id,
          };

    try {
      const res = await fetch(withApiBase("/api/newJob"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plate: rego,
          services: selectedServices,
          notes,
          partsDescription: hasMech && partsDescription.trim() ? partsDescription.trim() : undefined,
          businessId: customerType === "business" ? businessId : undefined,
          customer: customerPayload,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "工单保存失败，请稍后重试");
      }

      console.log("++++++++++++++++++++job created", data);
      setFormAlert({ variant: "success", message: "工单保存成功！" });
      navigate("/jobs");
    } catch (err) {
      setFormAlert({
        variant: "error",
        message: err instanceof Error ? err.message : "工单保存失败，请稍后重试",
      });
    }
  };

  return (
    <div className="space-y-4 text-[14px]">
      <div className="flex items-center gap-3">
        <Link to="/jobs" className="text-[rgba(0,0,0,0.45)] hover:text-[rgba(0,0,0,0.70)]">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-2xl font-semibold text-[rgba(0,0,0,0.72)]">新建工单</h1>
      </div>

      {formAlert ? (
        <Alert
          variant={formAlert.variant}
          description={formAlert.message}
          onClose={() => setFormAlert(null)}
        />
      ) : null}

      <VehicleSection
        rego={rego}
        importState={importState}
        importError={importError}
        vehicleInfo={vehicleInfo}
        onRegoChange={handleRegoChange}
        onImport={handleImportClick}
      />

  

      <CustomerSection
        customerType={customerType}
        onCustomerTypeChange={setCustomerType}
        personalName={personalName}
        personalPhone={personalPhone}
        personalWechat={personalWechat}
        personalEmail={personalEmail}
        onPersonalNameChange={setPersonalName}
        onPersonalPhoneChange={setPersonalPhone}
        onPersonalWechatChange={setPersonalWechat}
        onPersonalEmailChange={setPersonalEmail}
        customerAddress={customerAddress}
        onCustomerAddressChange={setCustomerAddress}
        businessId={businessId}
        businessOptions={businessOptions}
        onBusinessChange={setBusinessId}
      />
    <ServicesSection
        selectedServices={selectedServices}
        onToggleService={toggleService}
        options={serviceOptions}
      />

      {selectedServices.includes("mech") ? (
        <SectionCard title="配件描述（可选）">
          <div className="mt-3">
            <label className="text-xs text-[rgba(0,0,0,0.55)] mb-1 block">配件描述</label>
            <Textarea
              rows={3}
              placeholder="输入配件描述"
              value={partsDescription}
              onChange={(event) => setPartsDescription(event.target.value)}
            />
          </div>
        </SectionCard>
      ) : null}
      <NotesSection notes={notes} onNotesChange={setNotes} />

      <ActionsRow onSave={handleSave} />
    </div>
  );
}
