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

const buildPrintColumns = (data: WofPrintData) => {
  const summarySections = buildSummarySections(data);
  const checklistSections = buildChecklistSections();

  return [
    {
      className: "column column-left",
      sections: [summarySections[0], checklistSections[0], checklistSections[1], checklistSections[4]],
    },
    {
      className: "column column-middle",
      sections: [summarySections[1], checklistSections[2], checklistSections[3], checklistSections[5]],
    },
    {
      className: "column column-right",
      sections: [summarySections[2], summarySections[3], summarySections[4], summarySections[5], checklistSections[6]],
    },
  ];
};

export const buildWofHtml = (data: WofPrintData) => {
  const columns = buildPrintColumns(data);
  const columnsHtml = columns
    .map(
      (column) => `
        <div class="${column.className}">
          ${column.sections.map((section) => renderSection(section)).join("\n")}
        </div>`
    )
    .join("\n");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>WOF Print</title>
  <style>
    @page { size: legal portrait; margin: 0; }
    html, body {
      margin: 0;
      padding: 0;
      font-family: Arial, sans-serif;
      background: #fff;
      color: #111827;
    }
    body.debug {
      background: #f3f4f6;
    }
    .page {
      width: 8.5in;
      height: 14in;
      margin: 0 auto;
      padding: 0;
      box-sizing: border-box;
      overflow: hidden;
    }
    .sheet {
      position: relative;
      width: 100%;
      height: 100%;
      padding: 10px 12px 12px;
      box-sizing: border-box;
      background: transparent;
      overflow: hidden;
    }
    .reference-layer {
      display: none;
      position: absolute;
      inset: 10px 12px 12px;
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
    .content {
      position: relative;
      z-index: 1;
      width: calc(100% / 0.85);
      height: calc(100% / 0.85);
      transform-origin: top left;
      transform: scale(0.85);
      display: grid;
      grid-template-columns: 1.03fr 0.99fr 0.84fr;
      grid-template-rows: auto 1fr;
      gap: 8px;
      align-content: start;
    }
    .topline {
      grid-column: 1 / -1;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      padding: 0 2px 4px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.45);
    }
    .topline-title {
      font-size: 13px;
      line-height: 1.1;
      font-weight: 700;
      color: #6b7280;
      letter-spacing: 0.01em;
    }
    .meta {
      text-align: right;
      font-size: 11px;
      line-height: 1.35;
      color: #6b7280;
      white-space: nowrap;
    }
    .columns {
      display: grid;
      grid-column: 1 / -1;
      grid-template-columns: 1.03fr 0.99fr 0.84fr;
      gap: 8px;
      align-items: start;
    }
    .column {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 0;
    }
    .column-right {
      gap: 6px;
    }
    .section {
      border: 1px solid #dbe1e8;
      border-radius: 0;
      overflow: hidden;
      background: rgba(255, 255, 255, 0.16);
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .section-header {
      background: rgba(229, 234, 179, 0.68);
      padding: 6px 8px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #374151;
      border-bottom: 1px solid #dbe1e8;
    }
    .section-body {
      padding: 5px 6px 6px;
      background: transparent;
    }
    .row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 56px;
      gap: 6px;
      align-items: start;
      padding: 4px 0;
      border-bottom: 1px solid rgba(148, 163, 184, 0.18);
    }
    .row:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }
    .label {
      font-size: 9px;
      line-height: 1.2;
      color: #111827;
    }
    .value {
      font-size: 9px;
      line-height: 1.2;
      color: #111827;
      text-align: right;
      font-weight: 700;
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
      outline: 2px dashed rgba(185, 28, 28, 0.45);
    }
    .debug .reference-layer {
      display: block;
    }
    @media print {
      html, body {
        background: #fff;
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
      <div class="content">
        <div class="topline">
          <div class="topline-title">Please ensure the IO name appears or checksheet is invalid</div>
          <div class="meta">
            <div>${escapeHtml(data.recordStateLabel || "WOF")}</div>
            <div>${escapeHtml(data.rego || "")}</div>
          </div>
        </div>
        <div class="columns">
          ${columnsHtml}
        </div>
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
