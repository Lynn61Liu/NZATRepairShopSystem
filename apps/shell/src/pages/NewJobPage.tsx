import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { AlertCircle, ArrowLeft, Boxes, FileText, Loader2, Plus, ReceiptText, X } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Alert, Button, Input, SectionCard, Textarea, useToast } from "@/components/ui";
import {
  type ChildServiceOption,
  CustomerSection,
  NotesSection,
  ServicesSection,
  VehicleSection,
  type ServiceOption,
  extractVehicleInfo,
  normalizePlateInput,
  serviceOptions as defaultServiceOptions,
  type BusinessOption,
  type CustomerType,
  type ImportState,
  type ServiceType,
  type VehicleInfo,
} from "@/features/newJob";
import {
  getCachedBusinessCustomers,
  getCachedCustomerProfile,
  getCachedInventoryItems,
  getCachedPersonalCustomers,
  getCachedServiceCatalog,
  loadBusinessCustomersCacheFirst,
  loadCustomerProfileCacheFirst,
  loadInventoryItemsCacheFirst,
  loadPersonalCustomersCacheFirst,
  loadServiceCatalogCacheFirst,
  type CachedPersonalCustomer,
  type CachedServiceCatalog,
} from "@/features/lookups/lookupCache";
import { withApiBase } from "@/utils/api";

const REQUIRED_ROOT_SERVICE_TYPES: ServiceType[] = ["wof", "mech", "paint"];

export function NewJobPage() {
  type PersonalCustomerOption = CachedPersonalCustomer;
  type CustomerMatchHint = {
    message: string;
  };
  type LinkedCustomerPayload = {
    source?: string;
    jobId?: number | null;
    customer?: {
      id?: number | string;
      type?: string;
      name?: string;
      phone?: string | null;
      email?: string | null;
      address?: string | null;
      businessCode?: string | null;
      notes?: string | null;
    } | null;
  };
  type VehicleLookupPayload = {
    vehicle?: unknown;
    linkedCustomer?: LinkedCustomerPayload | null;
  };

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const [rego, setRego] = useState("");
  const [vehicleInfo, setVehicleInfo] = useState<VehicleInfo | null>(null);
  const [importState, setImportState] = useState<ImportState>("idle");
  const [importError, setImportError] = useState("");
  const [lastRequestedPlate, setLastRequestedPlate] = useState("");
  const [serviceOptions, setServiceOptions] = useState<ServiceOption[]>(defaultServiceOptions);
  const [loadedServiceCatalog, setLoadedServiceCatalog] = useState<CachedServiceCatalog | null>(null);
  const [serviceCatalogReady, setServiceCatalogReady] = useState(false);
  const [serviceCatalogLoading, setServiceCatalogLoading] = useState(true);
  const [selectedServices, setSelectedServices] = useState<ServiceType[]>([]);
  const [wofOptionChoices, setWofOptionChoices] = useState<ChildServiceOption[]>([]);
  const [wofOptions, setWofOptions] = useState<string[]>([]);
  const [mechOptionChoices, setMechOptionChoices] = useState<ChildServiceOption[]>([]);
  const [paintOptionChoices, setPaintOptionChoices] = useState<ChildServiceOption[]>([]);
  const [customerType, setCustomerType] = useState<CustomerType>("personal");
  const [personalName, setPersonalName] = useState("");
  const [personalPhone, setPersonalPhone] = useState("");
  // const [personalWechat, setPersonalWechat] = useState("");
  const [personalEmail, setPersonalEmail] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [businessId, setBusinessId] = useState("");
  const [businessOptions, setBusinessOptions] = useState<BusinessOption[]>([]);
  const [personalCustomerOptions, setPersonalCustomerOptions] = useState<PersonalCustomerOption[]>([]);
  const [customerMatchHint, setCustomerMatchHint] = useState<CustomerMatchHint | null>(null);
  const [notes, setNotes] = useState("");
  const [needsPo, setNeedsPo] = useState(true);
  const [createNewInvoice, setCreateNewInvoice] = useState(true);
  const [existingInvoiceNumber, setExistingInvoiceNumber] = useState("");
  const [paintPanels, setPaintPanels] = useState("1");
  const [partsDescriptions, setPartsDescriptions] = useState<string[]>([""]);
  const [mechOptions, setMechOptions] = useState<string[]>([]);
  const [paintOptions, setPaintOptions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [formAlert, setFormAlert] = useState<{ variant: "error" | "success" | "warning"; message: string } | null>(
    null
  );
  const autoNotesRef = useRef("");
  const notesRef = useRef("");
  const appointmentPrefillAppliedRef = useRef("");
  const regoYearModelLabel = useMemo(() => {
    const parts = [rego, vehicleInfo?.year, vehicleInfo?.model]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
      .map((value) => value.replace(/\s+/g, ""));
    return parts.join("-");
  }, [rego, vehicleInfo?.year, vehicleInfo?.model]);

  const showNeedsPo = customerType === "business";
  const showPaintPanels = selectedServices.includes("paint");
  const selectedBusiness = useMemo(
    () => businessOptions.find((biz) => biz.id === businessId),
    [businessOptions, businessId]
  );
  const personalNameSuggestions = useMemo(
    () => personalCustomerOptions.map((item) => item.name),
    [personalCustomerOptions]
  );

  const serviceLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    serviceOptions.forEach((opt) => {
      map[opt.id] = opt.label;
    });
    return map;
  }, [serviceOptions]);
  const selectedWofOptionLabels = useMemo(
    () =>
      wofOptions
        .map((id) => wofOptionChoices.find((item) => item.id === id)?.label)
        .filter((value): value is string => Boolean(value)),
    [wofOptions, wofOptionChoices]
  );
  const selectedMechOptionLabels = useMemo(
    () =>
      mechOptions
        .map((id) => mechOptionChoices.find((item) => item.id === id)?.label)
        .filter((value): value is string => Boolean(value)),
    [mechOptions, mechOptionChoices]
  );
  const selectedPaintOptionLabels = useMemo(
    () =>
      paintOptions
        .map((id) => paintOptionChoices.find((item) => item.id === id)?.label)
        .filter((value): value is string => Boolean(value)),
    [paintOptions, paintOptionChoices]
  );
  const mechOptionsLine = useMemo(
    () => (selectedMechOptionLabels.length ? selectedMechOptionLabels.join("，") : ""),
    [selectedMechOptionLabels]
  );
  const normalizedPartsDescriptions = useMemo(
    () => partsDescriptions.map((item) => item.trim()).filter(Boolean),
    [partsDescriptions]
  );
  const partsSummaryLine = useMemo(() => {
    if (!normalizedPartsDescriptions.length) return "";
    return `配件：${normalizedPartsDescriptions.join("，")}`;
  }, [normalizedPartsDescriptions]);
  const selectedServiceSummaries = useMemo(() => {
    const rows: string[] = [];
    if (selectedServices.includes("wof")) {
      rows.push(
        selectedWofOptionLabels.length
          ? `WOF（${selectedWofOptionLabels.join("，")}）`
          : (serviceLabelMap.wof || "WOF")
      );
    }
    if (selectedServices.includes("mech")) {
      rows.push(
        selectedMechOptionLabels.length
          ? `机修（${selectedMechOptionLabels.join("，")}）`
          : (serviceLabelMap.mech || "机修")
      );
    }
    if (selectedServices.includes("paint")) {
      rows.push(
        selectedPaintOptionLabels.length
          ? `喷漆（${selectedPaintOptionLabels.join("，")}；${paintPanels || "1"}片）`
          : `喷漆（${paintPanels || "1"}片）`
      );
    }
    return rows;
  }, [selectedServices, serviceLabelMap, selectedWofOptionLabels, selectedMechOptionLabels, selectedPaintOptionLabels, paintPanels]);
  const customerTypeLabel = customerType === "business" ? "商户客户" : "个人客户";
  const customerDisplayName =
    customerType === "business"
      ? selectedBusiness?.label?.trim() || "未填写"
      : personalName.trim() || "未填写";
  const missingRequiredFields = useMemo(() => {
    const missing: string[] = [];
    if (!rego.trim()) missing.push("车牌号码");
    if (customerType === "business" && !businessId) missing.push("商户名称");
    if (showPaintPanels && !paintPanels.trim()) missing.push("喷漆片数");
    return missing;
  }, [rego, customerType, businessId, showPaintPanels, paintPanels]);

  const autoNotes = useMemo(() => {
    const items: string[] = [];
    if (selectedServices.includes("wof")) {
      items.push(selectedWofOptionLabels.length ? selectedWofOptionLabels.join("，") : (serviceLabelMap.wof || "WOF"));
    }
    if (selectedServices.includes("mech") && selectedMechOptionLabels.length) {
      items.push(selectedMechOptionLabels.join("，"));
    }
    if (selectedServices.includes("paint") && selectedPaintOptionLabels.length) {
      items.push(selectedPaintOptionLabels.join("，"));
    }
    if (items.length === 0) return "";
    return items.join("，");
  }, [
    selectedServices,
    serviceLabelMap,
    selectedWofOptionLabels,
    selectedMechOptionLabels,
    selectedPaintOptionLabels,
  ]);

  const applyServiceCatalog = useCallback((catalog: CachedServiceCatalog) => {
    setLoadedServiceCatalog(catalog);
    const roots = Array.isArray(catalog.rootServices) ? catalog.rootServices : [];
    const children = Array.isArray(catalog.childServices) ? catalog.childServices : [];

    const nextRootOptions = roots
      .filter((item) => item.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map<ServiceOption | null>((item) => {
        const fallback = defaultServiceOptions.find((opt) => opt.id === item.serviceType);
        return fallback
          ? {
              ...fallback,
              label: item.name,
              catalogItemId: String(item.id),
            }
          : null;
      })
      .filter((item): item is ServiceOption => Boolean(item));

    if (nextRootOptions.length) {
      setServiceOptions(nextRootOptions);
    }

    setWofOptionChoices(
      children
        .filter((item) => item.isActive && item.serviceType === "wof")
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((item) => ({
          id: String(item.id),
          label: item.name,
          personalLinkCode: item.personalLinkCode,
          dealershipLinkCode: item.dealershipLinkCode,
        }))
    );

    setMechOptionChoices(
      children
        .filter((item) => item.isActive && item.serviceType === "mech")
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((item) => ({
          id: String(item.id),
          label: item.name,
          personalLinkCode: item.personalLinkCode,
          dealershipLinkCode: item.dealershipLinkCode,
        }))
    );

    setPaintOptionChoices(
      children
        .filter((item) => item.isActive && item.serviceType === "paint")
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((item) => ({
          id: String(item.id),
          label: item.name,
          personalLinkCode: item.personalLinkCode,
          dealershipLinkCode: item.dealershipLinkCode,
        }))
    );

    const loadedRootTypes = new Set(nextRootOptions.map((item) => item.id));
    return REQUIRED_ROOT_SERVICE_TYPES.every((serviceType) => loadedRootTypes.has(serviceType));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadCustomers = async () => {
      const cachedBusinesses = getCachedBusinessCustomers();
      const cachedPersonals = getCachedPersonalCustomers();

      if (!cancelled) {
        setBusinessOptions(cachedBusinesses ?? []);
        setPersonalCustomerOptions(cachedPersonals ?? []);
      }

      if (cachedBusinesses && cachedPersonals) {
        return;
      }

      try {
        const [businesses, personals] = await Promise.all([
          loadBusinessCustomersCacheFirst(),
          loadPersonalCustomersCacheFirst(),
        ]);

        if (!cancelled) {
          setBusinessOptions(businesses);
          setPersonalCustomerOptions(personals);
        }
      } catch {
        if (!cancelled) {
          setPersonalCustomerOptions(cachedPersonals ?? []);
          setBusinessOptions(cachedBusinesses ?? []);
        }
      }
    };

    void loadCustomers();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadServiceCatalog = async () => {
      if (!cancelled) {
        setServiceCatalogLoading(true);
      }
      const cachedCatalog = getCachedServiceCatalog();
      if (cachedCatalog && !cancelled) {
        const isReady = applyServiceCatalog(cachedCatalog);
        setServiceCatalogReady(isReady);
        setServiceCatalogLoading(false);
        return;
      }

      try {
        const catalog = await loadServiceCatalogCacheFirst();
        if (!cancelled) {
          const isReady = applyServiceCatalog(catalog);
          setServiceCatalogReady(isReady);
        }
      } catch {
        if (!cancelled) {
          setServiceCatalogReady(false);
        }
      } finally {
        if (!cancelled) {
          setServiceCatalogLoading(false);
        }
      }
    };

    void loadServiceCatalog();
    return () => {
      cancelled = true;
    };
  }, [applyServiceCatalog]);

  useEffect(() => {
    if (getCachedInventoryItems()) {
      return;
    }

    void loadInventoryItemsCacheFirst().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (customerType !== "business" || !businessId) {
      return;
    }

    if (getCachedCustomerProfile(businessId)) {
      return;
    }

    void loadCustomerProfileCacheFirst(businessId).catch(() => undefined);
  }, [customerType, businessId]);

  useEffect(() => {
    if (showNeedsPo) {
      setNeedsPo(true);
    } else {
      setNeedsPo(false);
    }
  }, [showNeedsPo]);

  useEffect(() => {
    if (showPaintPanels) {
      setPaintPanels((prev) => (prev ? prev : "1"));
    } else {
      setPaintPanels("1");
    }
  }, [showPaintPanels]);

  useEffect(() => {
    if (!selectedServices.includes("wof")) {
      setWofOptions([]);
      return;
    }

    if (wofOptionChoices.length === 1) {
      const defaultWofChildId = wofOptionChoices[0]?.id;
      if (defaultWofChildId) {
        setWofOptions((prev) => (prev.includes(defaultWofChildId) ? prev : [defaultWofChildId]));
      }
    }
  }, [selectedServices, wofOptionChoices]);

  useEffect(() => {
    if (!selectedServices.includes("mech")) {
      setMechOptions([]);
    }
  }, [selectedServices]);

  useEffect(() => {
    if (!selectedServices.includes("paint")) {
      setPaintOptions([]);
    }
  }, [selectedServices]);

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  useEffect(() => {
    const prevAuto = autoNotesRef.current;
    const current = notesRef.current;
    if (!prevAuto) {
      if (!current.trim() && autoNotes) {
        setNotes(autoNotes);
      }
      autoNotesRef.current = autoNotes;
      return;
    }
    if (current.startsWith(prevAuto)) {
      const suffix = current.slice(prevAuto.length).trimStart();
      const next = autoNotes ? `${autoNotes}${suffix ? `\n${suffix}` : ""}` : suffix;
      if (next !== current) {
        setNotes(next);
      }
      autoNotesRef.current = autoNotes;
      return;
    }
    if (!current.trim() && autoNotes) {
      setNotes(autoNotes);
    }
    autoNotesRef.current = autoNotes;
  }, [autoNotes]);

  const toggleService = (service: ServiceType) => {
    setSelectedServices((prev) =>
      prev.includes(service) ? prev.filter((s) => s !== service) : [...prev, service]
    );
  };
  const toggleMechOption = (id: string) => {
    setMechOptions((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const togglePaintOption = (id: string) => {
    setPaintOptions((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const resetImportState = () => {
    setImportState("idle");
    setImportError("");
    setVehicleInfo(null);
  };

  const clearCustomerMatchHint = () => {
    setCustomerMatchHint(null);
  };

  const fetchVehicleFromDb = async (plate: string) => {
    const res = await fetch(withApiBase(`/api/vehicles/by-plate?plate=${encodeURIComponent(plate)}`));
    const data = await res.json().catch(() => null);

    if (res.ok) return data;
    if (res.status === 404) return null;
    throw new Error(data?.error || "读取数据库失败");
  };

  const applyPersonalCustomer = (customer: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
  }) => {
    setCustomerType("personal");
    setBusinessId("");
    setPersonalName(String(customer.name || ""));
    setPersonalPhone(String(customer.phone || ""));
    setPersonalEmail(String(customer.email || ""));
    setCustomerAddress(String(customer.address || ""));
  };

  const applyLinkedCustomer = (payload: LinkedCustomerPayload | null | undefined) => {
    const customer = payload?.customer;
    if (!customer?.name) return;

    const normalizedType = String(customer.type || "").toLowerCase();
    if (normalizedType === "business") {
      setCustomerType("business");
      setBusinessId(customer.id ? String(customer.id) : "");
      setPersonalName("");
      setPersonalPhone("");
      setPersonalEmail("");
      setCustomerAddress("");
      setCustomerMatchHint({
        message:
          payload?.source === "job"
            ? "已匹配历史工单里的商户客户信息。"
            : "已匹配这台车之前绑定的商户客户信息。",
      });
      return;
    }

    applyPersonalCustomer(customer);
    setCustomerMatchHint({
      message:
        payload?.source === "job"
          ? "已匹配历史工单里的客户信息。"
          : "已匹配这台车之前绑定的客户信息。",
    });
  };

  const handlePersonalNameBlur = () => {
    const normalized = personalName.trim().toLowerCase();
    if (!normalized) return;

    const matched = personalCustomerOptions.find((item) => item.name.trim().toLowerCase() === normalized);
    if (!matched) return;

    applyPersonalCustomer(matched);
    setCustomerMatchHint({ message: "已匹配现有客户资料并自动填充。"});
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

      // console.log("vehicle from db", dbData?.vehicle ?? dbData);
      setVehicleInfo(extractVehicleInfo(dbData));
      applyLinkedCustomer((dbData as VehicleLookupPayload | null)?.linkedCustomer);
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
        // console.log("vehicle from db", dbData?.vehicle ?? dbData);
        setVehicleInfo(extractVehicleInfo(dbData));
        applyLinkedCustomer((dbData as VehicleLookupPayload | null)?.linkedCustomer);
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
    clearCustomerMatchHint();
  };

  useEffect(() => {
    const prefillKey = searchParams.toString();
    if (appointmentPrefillAppliedRef.current === prefillKey) return;
    if (searchParams.get("source") !== "wof-appointment") return;

    appointmentPrefillAppliedRef.current = prefillKey;
    const prefillRego = normalizePlateInput(searchParams.get("rego") ?? "") ?? "";
    const prefillCustomerName = (searchParams.get("customerName") ?? "").trim();
    const prefillNotes = (searchParams.get("notes") ?? "").trim();

    if (prefillRego) {
      setRego(prefillRego);
      setImportState("idle");
      setImportError("");
      setVehicleInfo(null);
    }
    if (prefillCustomerName) {
      setCustomerType("personal");
      setBusinessId("");
      setPersonalName(prefillCustomerName);
      setCustomerMatchHint(null);
    }
    if (prefillNotes) {
      setNotes(prefillNotes);
      notesRef.current = prefillNotes;
    }
    setSelectedServices((prev) => (prev.includes("wof") ? prev : [...prev, "wof"]));
  }, [searchParams]);

  const handleSave = async () => {
    if (saving) return;
    setFormAlert(null);
    if (!rego) {
      setFormAlert({ variant: "error", message: "请输入车牌号" });
      return;
    }
    if (customerType === "business" && (!businessId || !selectedBusiness)) {
      setFormAlert({ variant: "error", message: "请选择有效的商户客户。" });
      return;
    }
    if (!createNewInvoice && !existingInvoiceNumber.trim()) {
      setFormAlert({ variant: "error", message: "关闭新建 Invoice 后，Invoice Number 为必填。" });
      return;
    }
    if (serviceCatalogLoading || !serviceCatalogReady) {
      setFormAlert({ variant: "error", message: "服务目录仍在加载，请稍后再保存。" });
      return;
    }

    const hasMech = selectedServices.includes("mech");
    const personalHasInfo = [
      personalName,
      personalPhone,
      // personalWechat,
      personalEmail,
      customerAddress,
    ].some((value) => value.trim());
    const fallbackName = regoYearModelLabel || rego.trim();
    const customerName =
      customerType === "personal"
        ? personalHasInfo
          ? personalName
          : fallbackName
        : selectedBusiness?.label ?? "";


 
    
    const customerPayload =
      customerType === "personal"
        ? {
            type: customerType,
            name: customerName,
            phone: personalPhone || undefined,
            email: personalEmail || undefined,
            address: customerAddress || undefined,
            notes: fallbackName,
          }
        : {
            type: customerType,
            name: customerName,
            businessCode: selectedBusiness?.businessCode ?? selectedBusiness?.id,
            notes: fallbackName,
          };
    const trimmedNotes = notes.trim();
    const baseNotes = trimmedNotes ? trimmedNotes : autoNotes;
    const partsText = partsSummaryLine;
    let notesPayload = baseNotes || "";
    if (partsText) {
      const hasPartsAlready = notesPayload.includes(partsText);
      if (!hasPartsAlready) {
        notesPayload = notesPayload ? `${notesPayload}\n${partsText}` : partsText;
      }
    }
    if (hasMech && mechOptionsLine) {
      const hasMechOptionsAlready = notesPayload.includes(mechOptionsLine);
      if (!hasMechOptionsAlready) {
        notesPayload = notesPayload ? `${notesPayload}\n${mechOptionsLine}` : mechOptionsLine;
      }
    }

//  console.log("===========save body============");
//   console.log(" plate:", rego);
//   console.log(" services:", selectedServices);
//   console.log(" notesPayload:", notesPayload);
//   console.log(" partsDescriptions:", normalizedPartsDescriptions.length ? normalizedPartsDescriptions : undefined);
//   console.log(" businessId:", customerType === "business" ? businessId : undefined);
//   console.log(" customer:", customerPayload);



    try {
      setSaving(true);
      const missingRootCatalogIds = selectedServices.filter(
        (serviceType) => !serviceOptions.find((option) => option.id === serviceType)?.catalogItemId
      );
      if (missingRootCatalogIds.length) {
        const missingLabels = missingRootCatalogIds
          .map((serviceType) => serviceLabelMap[serviceType] || serviceType)
          .join("、");
        throw new Error(`服务目录映射尚未准备好：${missingLabels}。请刷新后重试。`);
      }

      const rootServiceCatalogItemIds = selectedServices
        .map((serviceType) => serviceOptions.find((option) => option.id === serviceType)?.catalogItemId)
        .filter((value): value is string => Boolean(value))
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value));

      const resolveDefaultXeroCode = (personalLinkCode?: string | null, dealershipLinkCode?: string | null) =>
        customerType === "personal" ? personalLinkCode ?? null : dealershipLinkCode ?? null;

      const rootDebugRows = (["wof", "mech", "paint"] as const).map((serviceType) => {
        const rootCatalogItemId = serviceOptions.find((option) => option.id === serviceType)?.catalogItemId ?? null;
        const rootCatalogItem = loadedServiceCatalog?.rootServices.find(
          (item) => String(item.id) === String(rootCatalogItemId ?? "")
        );

        return {
          serviceType,
          serviceCatalogItemId: rootCatalogItemId,
          defaultXeroCode: resolveDefaultXeroCode(
            rootCatalogItem?.personalLinkCode,
            rootCatalogItem?.dealershipLinkCode
          ),
          rootCatalogItem: rootCatalogItem ?? null,
        };
      });

      const wofChildDebugRows = wofOptions.map((id) => {
        const catalogItem = loadedServiceCatalog?.childServices.find((item) => String(item.id) === id);
        return {
          serviceType: "wof-child",
          serviceCatalogItemId: id,
          defaultXeroCode: resolveDefaultXeroCode(
            catalogItem?.personalLinkCode,
            catalogItem?.dealershipLinkCode
          ),
          catalogItem: catalogItem ?? null,
        };
      });

      const mechChildDebugRows = mechOptions.map((id) => {
        const catalogItem = loadedServiceCatalog?.childServices.find((item) => String(item.id) === id);
        return {
          serviceType: "mech-child",
          serviceCatalogItemId: id,
          defaultXeroCode: resolveDefaultXeroCode(
            catalogItem?.personalLinkCode,
            catalogItem?.dealershipLinkCode
          ),
          catalogItem: catalogItem ?? null,
        };
      });

      const paintChildDebugRows = paintOptions.map((id) => {
        const catalogItem = loadedServiceCatalog?.childServices.find((item) => String(item.id) === id);
        return {
          serviceType: "paint-child",
          serviceCatalogItemId: id,
          defaultXeroCode: resolveDefaultXeroCode(
            catalogItem?.personalLinkCode,
            catalogItem?.dealershipLinkCode
          ),
          catalogItem: catalogItem ?? null,
        };
      });

      console.log("===========service mapping debug============");
      console.log(" customerType:", customerType);
      console.log(" rootServiceCatalogItemIds:", rootServiceCatalogItemIds);
      console.log(" rootMappings:", rootDebugRows);
      console.log(" wofChildMappings:", wofChildDebugRows);
      console.log(" mechChildMappings:", mechChildDebugRows);
      console.log(" paintChildMappings:", paintChildDebugRows);

      const res = await fetch(withApiBase("/api/newJob"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plate: rego,
          createNewInvoice,
          existingInvoiceNumber: createNewInvoice ? undefined : existingInvoiceNumber.trim(),
          useServiceCatalogMapping: true,
          services: selectedServices,
          rootServiceCatalogItemIds,
          wofServiceCatalogItemIds: selectedServices.includes("wof")
            ? wofOptions.map((id) => Number(id)).filter((value) => Number.isFinite(value))
            : [],
          needsPo: showNeedsPo ? needsPo : false,
          notes: notesPayload,
          // partsDescription: normalizedPartsDescriptions[0],
          partsDescriptions: normalizedPartsDescriptions,
          mechServiceCatalogItemIds: hasMech ? mechOptions.map((id) => Number(id)).filter((value) => Number.isFinite(value)) : [],
          mechItems: hasMech ? selectedMechOptionLabels : [],
          paintServiceCatalogItemIds: selectedServices.includes("paint")
            ? paintOptions.map((id) => Number(id)).filter((value) => Number.isFinite(value))
            : [],
          paintPanels: showPaintPanels ? Number(paintPanels) || 1 : undefined,
          businessId: customerType === "business" ? businessId : undefined,
          customer: customerPayload,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "工单保存失败，请稍后重试");
      }

      console.info("[new-job-performance]", {
        xResponseTime: res.headers.get("X-Response-Time"),
        newJobCoreTime: res.headers.get("X-NewJob-Core-Time"),
        newJobTotalTime: res.headers.get("X-NewJob-Total-Time"),
        invoiceKickTime: res.headers.get("X-NewJob-Invoice-Kick-Time"),
        invoiceProcessedInline: res.headers.get("X-NewJob-Invoice-Processed-Inline"),
        poKickTime: res.headers.get("X-NewJob-Po-Kick-Time"),
        poProcessedInline: res.headers.get("X-NewJob-Po-Processed-Inline"),
        payloadPerformance: data?.performance ?? null,
      });

     
      const invoiceCreated = data?.invoiceCreated === true;
      const invoiceLinked = data?.invoiceLinked === true;
      const invoiceQueued = data?.invoiceQueued === true;
      const invoiceMode = typeof data?.invoiceMode === "string" ? data.invoiceMode : "";
      const invoiceError = typeof data?.invoiceError === "string" ? data.invoiceError : "";
      const createdId = data?.jobId ? String(data.jobId) : "";

      if (invoiceCreated || invoiceLinked) {
        const successMessage = invoiceLinked ? "工单已创建，并已关联现有 Invoice！" : "工单和 Invoice 已创建成功！";
        setFormAlert({ variant: "success", message: successMessage });
        toast.success(successMessage);
        if (createdId) {
          navigate(`/jobs/${createdId}`);
        } else {
          navigate("/jobs");
        }
      } else if (invoiceQueued) {
        const successMessage =
          invoiceMode === "attach_existing"
            ? "工单已创建，现有 Invoice 正在后台关联。"
            : "工单已创建，Invoice 正在后台生成。";
        setFormAlert({ variant: "success", message: successMessage });
        toast.success(successMessage);
        if (createdId) {
          navigate(`/jobs/${createdId}`);
        } else {
          navigate("/jobs");
        }
      } else {
        const message = invoiceError
          ? `工单已创建（Job ID: ${createdId || "未知"}），但 Invoice 创建失败：${invoiceError}`
          : `工单已创建（Job ID: ${createdId || "未知"}），但 Invoice 没有创建成功。`;
        setFormAlert({ variant: "warning", message });
        toast.error(message);
        console.log("======error======", message);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "工单保存失败，请稍后重试");
      setFormAlert({
        variant: "error",
        message: err instanceof Error ? err.message : "工单保存失败，请稍后重试",
      });
    } finally {
      setSaving(false);
    }
  };

  const handlePaintPanelsChange = (value: string) => {
    if (value === "") {
      setPaintPanels("");
      return;
    }
    if (!/^\d+$/.test(value)) return;
    const num = Math.min(20, Math.max(1, Number(value)));
    setPaintPanels(String(num));
  };
  const updatePartDescription = (index: number, value: string) => {
    setPartsDescriptions((prev) => prev.map((item, idx) => (idx === index ? value : item)));
  };
  const addPartDescription = () => {
    setPartsDescriptions((prev) => [...prev, ""]);
  };
  const removePartDescription = (index: number) => {
    setPartsDescriptions((prev) => {
      if (prev.length === 1) return [""];
      return prev.filter((_, idx) => idx !== index);
    });
  };

  return (
    <div className="space-y-4 text-base">
      <div className="flex items-center gap-3">
        <Link to="/jobs" className="text-[rgba(0,0,0,0.45)] hover:text-[rgba(0,0,0,0.70)]">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-lg font-semibold text-[rgba(0,0,0,0.72)]">新建工单</h1>
      </div>

      {formAlert ? (
        <Alert
          variant={formAlert.variant}
          description={formAlert.message}
          onClose={() => setFormAlert(null)}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.9fr)_minmax(320px,1fr)]">
        <div className="space-y-4">
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
            onCustomerTypeChange={(next) => {
              clearCustomerMatchHint();
              setCustomerType(next);
            }}
            personalName={personalName}
            personalPhone={personalPhone}
            // personalWechat={personalWechat}
            personalEmail={personalEmail}
            onPersonalNameChange={(value) => {
              clearCustomerMatchHint();
              setPersonalName(value);
            }}
            onPersonalPhoneChange={(value) => {
              clearCustomerMatchHint();
              setPersonalPhone(value);
            }}
            // onPersonalWechatChange={setPersonalWechat}
            onPersonalEmailChange={(value) => {
              clearCustomerMatchHint();
              setPersonalEmail(value);
            }}
            customerAddress={customerAddress}
            onCustomerAddressChange={(value) => {
              clearCustomerMatchHint();
              setCustomerAddress(value);
            }}
            businessId={businessId}
            businessOptions={businessOptions}
            onBusinessChange={(value) => {
              clearCustomerMatchHint();
              setBusinessId(value);
            }}
            personalNameSuggestions={personalNameSuggestions}
            onPersonalNameBlur={handlePersonalNameBlur}
            matchHint={customerMatchHint?.message}
          />
          <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
            <ServicesSection
              selectedServices={selectedServices}
              onToggleService={toggleService}
              options={serviceOptions}
              mechOptionChoices={mechOptionChoices}
              mechOptions={mechOptions}
              onToggleMechOption={toggleMechOption}
              paintOptionChoices={paintOptionChoices}
              paintOptions={paintOptions}
              onTogglePaintOption={togglePaintOption}
              showPaintPanels={showPaintPanels}
              paintPanels={paintPanels}
              onPaintPanelsChange={handlePaintPanelsChange}
            />

            <div className="space-y-4">
              <SectionCard
                title="订配件"
                titleIcon={<Boxes size={18} />}
                titleClassName="text-lg font-semibold"
                actions={
                  <button
                    type="button"
                    onClick={addPartDescription}
                    className="inline-flex items-center gap-1 rounded-[8px] border border-[rgba(220,38,38,0.40)] bg-[rgba(220,38,38,0.05)] px-2.5 py-1.5 text-base font-medium text-[#b91c1c] hover:bg-[rgba(220,38,38,0.10)]"
                  >
                    <Plus size={14} />
                    配件
                  </button>
                }
              >
                <div className="space-y-3 mt-2">
                  {partsDescriptions.map((value, index) => (
                    <div
                      key={`part-item-${index}`}
                      className="rounded-[10px] border border-[rgba(0,0,0,0.08)] bg-white p-3"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <label className="text-base text-[rgba(0,0,0,0.65)]">配件 {index + 1}</label>
                        <button
                          type="button"
                          onClick={() => removePartDescription(index)}
                          className="inline-flex items-center gap-1 text-base text-[rgba(0,0,0,0.50)] hover:text-[#b91c1c]"
                        >
                          <X size={14} />
                          删除
                        </button>
                      </div>
                      <Textarea
                        rows={2}
                        placeholder="输入配件描述"
                        value={value}
                        onChange={(event) => updatePartDescription(index, event.target.value)}
                      />
                    </div>
                  ))}
                </div>
              </SectionCard>

              {showNeedsPo ? (
                <SectionCard
                  title="采购订单 (PO)"
                  titleIcon={<FileText size={18} />}
                  titleClassName="text-lg font-semibold"
                  actions={
                    <label className="inline-flex cursor-pointer items-center">
                      <input
                        type="checkbox"
                        checked={needsPo}
                        onChange={(event) => setNeedsPo(event.target.checked)}
                        className="peer sr-only"
                      />
                      <span className="relative h-7 w-12 rounded-full bg-[rgba(0,0,0,0.20)] transition peer-checked:bg-[#dc2626]">
                        <span className="absolute left-1 top-1 h-5 w-5 rounded-full bg-white transition peer-checked:translate-x-5" />
                      </span>
                    </label>
                  }
                >
                  {null}
                </SectionCard>
              ) : null}

              <SectionCard
                title="Invoice"
                titleIcon={<ReceiptText size={18} />}
                titleClassName="text-lg font-semibold"
                actions={
                  <label className="inline-flex cursor-pointer items-center gap-3 text-sm text-[rgba(0,0,0,0.70)]">
                    <span>{createNewInvoice ? "Create New Invoice" : "Use Existing Invoice"}</span>
                    <input
                      type="checkbox"
                      checked={createNewInvoice}
                      onChange={(event) => setCreateNewInvoice(event.target.checked)}
                      className="peer sr-only"
                    />
                    <span className="relative h-7 w-12 rounded-full bg-[rgba(0,0,0,0.20)] transition peer-checked:bg-[#dc2626]">
                      <span className="absolute left-1 top-1 h-5 w-5 rounded-full bg-white transition peer-checked:translate-x-5" />
                    </span>
                  </label>
                }
              >
                <div className="mt-3 space-y-3">
                  {!createNewInvoice ? (
                    <>
                      <Input
                        value={existingInvoiceNumber}
                        onChange={(event) => setExistingInvoiceNumber(event.target.value)}
                        placeholder="e.g. INV-00123"
                      />
                      <div className="text-sm text-[rgba(0,0,0,0.55)]">
                        The system will find this invoice in Xero and link it to the new job.
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-[rgba(0,0,0,0.55)]">
                      A new draft invoice will be created in Xero after the job is saved.
                    </div>
                  )}
                </div>
              </SectionCard>
            </div>
          </div>

          <NotesSection notes={notes} onNotesChange={setNotes} />
        </div>

        <div className="space-y-4 xl:sticky xl:top-4 xl:self-start ">
          <SectionCard
            title="订单摘要"
            titleIcon={<ReceiptText size={18} />}
            titleClassName="text-lg font-semibold"
          >
            <div className="mt-4 space-y-5">
              <div>
                <div className="text-base text-[rgba(0,0,0,0.50)]">车牌号码</div>
                <div className="text-base font-semibold text-[rgba(0,0,0,0.86)]">
                  {rego.trim() || "未填写"}
                </div>
              </div>
              <div>
                <div className="text-base text-[rgba(0,0,0,0.50)]">客户信息</div>
                <div className="text-base font-semibold text-[rgba(0,0,0,0.86)]">{customerDisplayName}</div>
                <div className="mt-1 inline-flex rounded-full border border-[rgba(0,0,0,0.12)] px-3 py-1 text-base text-[rgba(0,0,0,0.70)]">
                  {customerTypeLabel}
                </div>
              </div>
              <div>
                <div className="text-base text-[rgba(0,0,0,0.50)]">已选服务</div>
                {selectedServiceSummaries.length ? (
                  <ul className="mt-2 space-y-1 text-base text-[rgba(0,0,0,0.80)]">
                    {selectedServiceSummaries.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-base text-[rgba(0,0,0,0.45)]">未选择</div>
                )}
              </div>
              <div>
                <div className="text-base text-[rgba(0,0,0,0.50)]">喷漆片数</div>
                <div className="text-base font-semibold text-[rgba(0,0,0,0.80)]">
                  {showPaintPanels ? `${paintPanels || "1"} 片` : "不适用"}
                </div>
              </div>
              <div>
                <div className="text-base text-[rgba(0,0,0,0.50)]">配件信息</div>
                <div className="text-base font-semibold text-[rgba(0,0,0,0.80)]">
                  {normalizedPartsDescriptions.length} 个配件
                </div>
              </div>
              <div>
                <div className="text-base text-[rgba(0,0,0,0.50)]">Invoice 模式</div>
                <div className="text-base font-semibold text-[rgba(0,0,0,0.80)]">
                  {createNewInvoice ? "新建 Invoice" : `关联已有 Invoice${existingInvoiceNumber.trim() ? ` (${existingInvoiceNumber.trim()})` : ""}`}
                </div>
              </div>
              <div>
                <div className="text-base text-[rgba(0,0,0,0.50)]">PO 信息</div>
                <div className="text-base font-semibold text-[rgba(0,0,0,0.80)]">
                  {showNeedsPo ? (needsPo ? "需要 PO" : "不需要 PO") : "不适用"}
                </div>
              </div>
              {missingRequiredFields.length ? (
                <div className="border-t border-[rgba(220,38,38,0.15)] pt-4">
                  <div className="flex items-center gap-2 text-base font-semibold text-[#dc2626]">
                    <AlertCircle size={18} />
                    缺失必填项
                  </div>
                  <ul className="mt-2 space-y-1 text-base text-[#dc2626]">
                    {missingRequiredFields.map((field) => (
                      <li key={field}>• {field}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </SectionCard>
          <div>
            <Button
              variant="primary"
              className="w-full justify-center gap-2 text-center disabled:cursor-not-allowed disabled:bg-[rgba(0,0,0,0.18)] disabled:text-white/80"
              onClick={handleSave}
              disabled={saving || serviceCatalogLoading || !serviceCatalogReady}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {saving ? "保存中" : serviceCatalogLoading || !serviceCatalogReady ? "加载服务配置中..." : "保存"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
