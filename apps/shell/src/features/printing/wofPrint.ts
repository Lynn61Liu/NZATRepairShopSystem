export type WofPrintData = {
  jobId: string;
  recordId: string;
  recordStateLabel: string;
  rego: string;
  makeModel: string;
  nzFirstRegistration: string;
  vin: string;
  odoText: string;
  organisationName: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerAddress: string;
  inspectionDate: string;
  inspectionNumber: string;
  recheckDate: string;
  recheckNumber: string;
  recheckOdo: string;
  isNewWof: boolean;
  newWofDate: string;
  authCode: string;
  checkSheet: string;
  csNo: string;
  wofLabel: string;
  labelNo: string;
  msNumber: string;
  failReasons: string;
  previousExpiryDate: string;
  failRecheckDate: string;
  note: string;
  placeholderDash: string;
  placeholderCheck: string;
  placeholderMs: string;
  placeholderCode: string;
};

type SectionItem = {
  item: string;
  value: string;
};

type PrintSection = {
  title: string;
  items: SectionItem[];
};

const escapeHtml = (value?: string) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatValue = (value?: string | null) => {
  const text = String(value ?? "").trim();
  return text || "p";
};

const item = (label: string, value?: string | null): SectionItem => ({
  item: label,
  value: formatValue(value),
});

const pItems = (labels: string[]): SectionItem[] => labels.map((label) => item(label, "p"));

const renderSection = (section: PrintSection) => {
  const rows = section.items
    .map(
      (entry) => `
        <div class="row">
          <div class="label">${escapeHtml(entry.item)}</div>
          <div class="value">${escapeHtml(entry.value)}</div>
        </div>`
    )
    .join("");

  return `
    <section class="section">
      <div class="section-header">${escapeHtml(section.title)}</div>
      <div class="section-body">
        ${rows}
      </div>
    </section>`;
};

const buildCornerMarks = () =>
  ["top-left", "top-right", "bottom-left", "bottom-right"]
    .map((corner) => `<div class="corner-mark corner-mark-${corner}"></div>`)
    .join("");

const buildSummarySections = (data: WofPrintData): PrintSection[] => [
  {
    title: "Customer Detail Section",
    items: [
      item("Inspecting organisation", data.organisationName),
      item("Customer name", data.customerName),
      item("Phone", data.customerPhone),
      item("Email", data.customerEmail),
      item("Address", data.customerAddress),
    ],
  },
  {
    title: "Vehicle Section",
    items: [
      item("Make / model", data.makeModel),
      item("Registration plate", data.rego),
      item("Odometer", data.odoText),
      item("Chassis / VIN no", data.vin),
      item("NZ first registration", data.nzFirstRegistration),
      item("Record state", data.recordStateLabel),
      item("Previous expiry date", data.previousExpiryDate),
      item("New WoF date", data.newWofDate),
    ],
  },
  {
    title: "Customer Copy",
    items: [
      item("Job / tax invoice number", data.jobId),
      item("GST number", ""),
      item("MS number", data.msNumber),
      item("New WoF expiry date", data.newWofDate),
      item("System authorisation number", data.authCode),
      item("WoF label number", data.wofLabel),
      item("Signature", ""),
      item("Number", data.labelNo),
    ],
  },
  {
    title: "Initial Inspection",
    items: [
      item("Date of inspection", data.inspectionDate),
      item("Inspection number", data.inspectionNumber),
    ],
  },
  {
    title: "Recheck Inspection",
    items: [
      item("Date of re-inspection", data.recheckDate),
      item("Odometer reading", data.recheckOdo),
      item("Recheck number", data.recheckNumber),
    ],
  },
  {
    title: "Reasons For Rejection",
    items: [
      item("Fail reasons", data.failReasons),
      item("Fail recheck date", data.failRecheckDate),
      item("Note", data.note),
    ],
  },
];

const buildChecklistSections = (): PrintSection[] => [
  {
    title: "Instructions For Marking",
    items: pItems([
      "Item has passed",
      "Item has failed",
      "Item is not applicable to this vehicle",
      "Item is not applicable to trailers",
      "Item is not applicable to motorcycles",
    ]),
  },
  {
    title: "External Inspection",
    items: pItems([
      "E1 Direction indicator lamps (front)",
      "E2 Forward-facing position lamps",
      "E3 Headlamps",
      "E5 Front and rear fog lamps",
      "E6 Direction indicator lamps (rear)",
      "E7 Rearward facing position lamps",
      "E8 Stop lamps",
      "E9 High-mounted stop lamps",
      "E10 Registration plate lamps",
      "E11 Rear reflectors",
      "E12 Other lamps",
      "E13 Windscreen",
      "E14 Other glazing",
      "E15 Doors and hinged panels",
      "E16 Mudguards",
      "E17 External projections",
      "E18 Footrests (motorcycles only)",
      "E19 Structure/corrosion (panels, door pillars, etc)",
      "E20 Dimensions",
    ]),
  },
  {
    title: "Chassis Underbody",
    items: pItems([
      "C1 Wheels, hubs and axles",
      "C2 Steering mechanism and components",
      "C3 Suspension mechanism and components",
      "C4 Fuel tank and fuel lines",
      "C5 Brake components (incl controls, linkages, lines and hoses)",
      "C6 Exhaust system and visible smoke",
      "C7 Tyre condition",
      "C8 Tyre tread and depth",
      "C9 Towing connections",
      "C10 Safety chain (trailers <2000kg GVM)",
      "C11 Dual safety chain (trailers 2001kg-2500kg laden)",
      "C12 Structure/corrosion (chassis/floor pan, etc)",
    ]),
  },
  {
    title: "Road Brake Test",
    items: pItems([
      "Service brake reading",
      "Front",
      "Rear",
      "R1 Service brake performance",
      "R2 Service brake balance",
      "Parking brake reading",
      "OR stall test (tick)",
      "R3 Parking brake performance",
      "R4 Trailer breakaway brake",
      "R5 Speedometer",
    ]),
  },
  {
    title: "Internal Inspection",
    items: pItems([
      "I1 Wipers/operation",
      "I2 Washers/operation",
      "I3 Rear view mirrors",
      "I4 Sun visors",
      "I5 Seatbelts",
      "I6 Seatbelt anchorages",
      "I7 Seats and seat anchorages",
      "I8 Head restraints",
      "I9 Interior impact",
      "I10 Airbag self check",
      "I11 ABS self check",
      "I12 Audible warning device",
      "I13 Spare wheel security",
    ]),
  },
  {
    title: "Under Bonnet",
    items: pItems([
      "U1 A/F system in working order",
      "U2 A/F certificate current",
      "U3 A/F system safe",
      "U4 Modified vehicle (declaration certificate LVV plate)",
      "U5 Chassis/VIN number (present and recorded correctly)",
      "U6 Structure/corrosion (firewall/inner guards, etc)",
      "U7 Engine and drive train",
      "U8 Fuel system",
    ]),
  },
  {
    title: "Received Amount",
    items: pItems(["Amount", "Cash", "Card", "Cheque"]),
  },
];

export const buildWofHtml = (data: WofPrintData) => {
  const pageTitle = "WOF Print";
  const summarySections = buildSummarySections(data);
  const checklistSections = buildChecklistSections();
  const summarySectionsHtml = summarySections
    .map((section) => renderSection(section))
    .join("\n");
  const checklistSectionsHtml = checklistSections
    .map((section) => renderSection(section))
    .join("\n");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(pageTitle)}</title>
  <style>
    @page { size: 8.5in 14in; margin: 10mm; }
    html, body {
      margin: 0;
      padding: 0;
      font-family: Arial, sans-serif;
      background: #f3f4f6;
      color: #111827;
    }
    body.debug {
      background: #e5e7eb;
    }
    .page {
      max-width: 8.5in;
      margin: 0 auto;
      padding: 16px;
      box-sizing: border-box;
    }
    .sheet {
      position: relative;
      background: #fff;
      border: 1px solid #d1d5db;
      border-radius: 14px;
      padding: 18px;
      box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
    }
    .reference-layer {
      display: none;
      position: absolute;
      inset: 18px;
      pointer-events: none;
      z-index: 0;
    }
    .reference-grid {
      position: absolute;
      inset: 0;
      opacity: 0.35;
      background-image:
        linear-gradient(to right, rgba(148, 163, 184, 0.42) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(148, 163, 184, 0.42) 1px, transparent 1px);
      background-size: 20mm 20mm;
      background-position: 0 0;
      border-radius: 10px;
    }
    .corner-mark {
      position: absolute;
      width: 14mm;
      height: 14mm;
      border-color: rgba(71, 85, 105, 0.85);
      border-style: solid;
      border-width: 0;
    }
    .corner-mark-top-left {
      top: -1px;
      left: -1px;
      border-top-width: 1.5px;
      border-left-width: 1.5px;
    }
    .corner-mark-top-right {
      top: -1px;
      right: -1px;
      border-top-width: 1.5px;
      border-right-width: 1.5px;
    }
    .corner-mark-bottom-left {
      bottom: -1px;
      left: -1px;
      border-bottom-width: 1.5px;
      border-left-width: 1.5px;
    }
    .corner-mark-bottom-right {
      bottom: -1px;
      right: -1px;
      border-bottom-width: 1.5px;
      border-right-width: 1.5px;
    }
    .header {
      position: relative;
      z-index: 1;
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-start;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid #e5e7eb;
    }
    .title {
      margin: 0;
      font-size: 24px;
      line-height: 1.1;
      letter-spacing: 0.02em;
    }
    .subtitle {
      margin-top: 4px;
      color: #6b7280;
      font-size: 13px;
    }
    .meta {
      text-align: right;
      font-size: 12px;
      line-height: 1.5;
      color: #4b5563;
      white-space: nowrap;
    }
    .summary-grid {
      position: relative;
      z-index: 1;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }
    .section {
      border: 1px solid #dbe1e8;
      border-radius: 12px;
      overflow: hidden;
      background: #fff;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .section-header {
      background: linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%);
      padding: 10px 12px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #374151;
      border-bottom: 1px solid #dbe1e8;
    }
    .section-body {
      padding: 8px 12px 10px;
    }
    .row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 74px;
      gap: 12px;
      align-items: start;
      padding: 7px 0;
      border-bottom: 1px dotted #e5e7eb;
    }
    .row:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }
    .label {
      font-size: 12px;
      line-height: 1.35;
      color: #111827;
    }
    .value {
      font-size: 12px;
      line-height: 1.35;
      color: #111827;
      text-align: right;
      font-weight: 700;
    }
    .checklist {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .noprint {
      position: fixed;
      right: 12px;
      top: 12px;
      z-index: 9999;
      display: flex;
      gap: 8px;
    }
    .noprint button {
      border: 1px solid #cbd5e1;
      background: #fff;
      color: #111827;
      border-radius: 999px;
      padding: 8px 14px;
      font-size: 13px;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(15, 23, 42, 0.08);
    }
    .debug .sheet {
      outline: 2px dashed rgba(185, 28, 28, 0.65);
      box-shadow: none;
    }
    .debug .reference-layer {
      display: block;
    }
    .debug .section {
      outline: 1px dashed rgba(185, 28, 28, 0.35);
    }
    @media print {
      html, body {
        background: #fff;
      }
      .page {
        padding: 0;
      }
      .sheet {
        border: none;
        border-radius: 0;
        box-shadow: none;
        padding: 0;
      }
      .noprint {
        display: none;
      }
      .debug .reference-layer {
        display: block;
      }
      .summary-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .section,
      .row {
        break-inside: avoid;
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="noprint">
    <button onclick="document.body.classList.toggle('debug')">Debug</button>
    <button onclick="window.print()">Print</button>
  </div>
  <div class="page">
    <div class="sheet">
      <div class="reference-layer" aria-hidden="true">
        <div class="reference-grid"></div>
        ${buildCornerMarks()}
      </div>
      <div class="header">
        <div>
          <h1 class="title">Warrant of fitness checksheet</h1>
          <div class="subtitle">Customer copy</div>
        </div>
        <div class="meta">
          <div>${escapeHtml(data.recordStateLabel || "WOF")}</div>
          <div>${escapeHtml(data.rego || "")}</div>
        </div>
      </div>
      <div class="summary-grid">
        ${summarySectionsHtml}
      </div>
      <div class="checklist">
        ${checklistSectionsHtml}
      </div>
    </div>
  </div>
  <script>
    (function () {
      try {
        var params = new URLSearchParams(window.location.search || "");
        var flag = params.get("printDebug") || params.get("printdebug") || params.get("printerdebug") || (window.localStorage && window.localStorage.getItem("printDebug"));
        if (flag === "1" || flag === "true") {
          document.body.classList.add("debug");
        }
        document.addEventListener("keydown", function (event) {
          if (event.key === "d" || event.key === "D") {
            document.body.classList.toggle("debug");
          }
        });
      } catch {}
    })();
  </script>
</body>
</html>`;
};
