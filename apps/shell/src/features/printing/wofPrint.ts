export type WofPrintData = {
  jobId: string;
  recordId: string;
  recordStateLabel: string;
  rego: string;
  makeModel: string;
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
};

type FieldLayout = {
  key: keyof WofPrintData;
  x: number;
  y: number;
  w: number;
  h: number;
  size: number;
};

const PX_TO_CM = 2.54 / 96;
const CM_PX = 96 / 2.54;

const escapeHtml = (value?: string) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const toCm = (px: number) => (px * PX_TO_CM).toFixed(2);

const field = (layout: FieldLayout, text: string, pageW: number) => {
  const pos = `${layout.x},${layout.y},${layout.w},${layout.h}`;
  const topCm = toCm(layout.y);
  const rightCm = toCm(pageW - layout.x - layout.w);
  return `<div class="field" data-field="${layout.key}" data-pos="${pos}" data-topcm="${topCm}" data-rightcm="${rightCm}" style="left:${layout.x}px;top:${layout.y}px;width:${layout.w}px;height:${layout.h}px;font-size:${layout.size}pt;">${escapeHtml(
    text
  )}</div>`;
};

const FIELD_LAYOUTS: FieldLayout[] = [
  { key: "rego", x: 40, y: 40, w: 260, h: 22, size: 12 },
  { key: "makeModel", x: 40, y: 70, w: 360, h: 22, size: 12 },
  { key: "odoText", x: 40, y: 100, w: 200, h: 22, size: 12 },
  { key: "organisationName", x: 40, y: 130, w: 360, h: 22, size: 12 },
  { key: "customerName", x: 40, y: 160, w: 360, h: 22, size: 12 },
  { key: "customerPhone", x: 40, y: 190, w: 200, h: 22, size: 12 },
  { key: "customerEmail", x: 40, y: 220, w: 360, h: 22, size: 11 },
  { key: "customerAddress", x: 40, y: 250, w: 420, h: 60, size: 11 },

  { key: "jobId", x: 40, y: 330, w: 140, h: 22, size: 12 },
  { key: "msNumber", x: 200, y: 330, w: 140, h: 22, size: 12 },
  { key: "isNewWof", x: 40, y: 360, w: 120, h: 22, size: 12 },
  { key: "newWofDate", x: 170, y: 360, w: 160, h: 22, size: 12 },
  { key: "authCode", x: 40, y: 390, w: 200, h: 22, size: 12 },
  { key: "wofLabel", x: 260, y: 390, w: 140, h: 22, size: 12 },
  { key: "checkSheet", x: 40, y: 420, w: 180, h: 22, size: 12 },
  { key: "csNo", x: 240, y: 420, w: 160, h: 22, size: 12 },
  { key: "labelNo", x: 40, y: 450, w: 160, h: 22, size: 12 },

  { key: "inspectionDate", x: 40, y: 500, w: 160, h: 22, size: 12 },
  { key: "inspectionNumber", x: 220, y: 500, w: 160, h: 22, size: 12 },
  { key: "recordStateLabel", x: 40, y: 530, w: 160, h: 22, size: 12 },
  { key: "previousExpiryDate", x: 220, y: 530, w: 160, h: 22, size: 12 },

  { key: "recheckDate", x: 40, y: 580, w: 160, h: 22, size: 12 },
  { key: "recheckNumber", x: 220, y: 580, w: 160, h: 22, size: 12 },

  { key: "failReasons", x: 40, y: 640, w: 720, h: 80, size: 11 },
  { key: "failRecheckDate", x: 40, y: 730, w: 220, h: 22, size: 12 },
  { key: "note", x: 40, y: 760, w: 720, h: 120, size: 11 },
];

export const buildWofHtml = (data: WofPrintData) => {
  const pageTitle = "WOF Print";
  const pageW = 816;
  const pageH = 1344;
  const bgUrl = "/print_templates/wof.png";

  const getValue = (key: keyof WofPrintData) => {
    if (key === "isNewWof") {
      return data.isNewWof ? "Yes" : "No";
    }
    return String(data[key] ?? "");
  };

  const fieldsHtml = FIELD_LAYOUTS.map((layout) => field(layout, getValue(layout.key), pageW)).join("\n");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(pageTitle)}</title>
  <style>
    @page { size: 8.5in 14in; margin: 0; }
    html, body { margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; }
    body.debug{
      background: #f3f4f6;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      padding: 24px;
      box-sizing: border-box;
    }
    .page{
      position: relative;
      width: ${pageW}px;
      height: ${pageH}px;
      overflow: hidden;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      --cm: ${CM_PX}px;
    }
    .debug .page{
      outline: 2px solid rgba(0,0,0,0.45);
      box-shadow: 0 0 0 1px rgba(0,0,0,0.08) inset;
      background: #fff;
    }
    .bg{
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      background-image: url('${bgUrl}');
      background-size: ${pageW}px ${pageH}px;
      background-position: top left;
      background-repeat: no-repeat;
      z-index: -1;
    }
    .grid{
      position: absolute;
      inset: 0;
      pointer-events: none;
      opacity: 0;
    }
    .field{
      position:absolute;
      font-family: Arial, sans-serif;
      color:#000;
      white-space: pre-wrap;
      overflow:hidden;
      line-height: 1.2;
    }
    .debug .field{
      outline: 1px dashed rgba(220, 38, 38, 0.8);
      background: rgba(220, 38, 38, 0.08);
      overflow: visible;
      z-index: 2;
    }
    .debug .field::after{
      content: attr(data-field) " [" attr(data-pos) "] t:" attr(data-topcm) "cm r:" attr(data-rightcm) "cm";
      position: absolute;
      left: 0;
      top: 0;
      transform: translateY(-100%);
      font-size: 10px;
      line-height: 1.2;
      color: #b91c1c;
      background: rgba(255,255,255,0.9);
      border: 1px solid rgba(185, 28, 28, 0.35);
      padding: 1px 4px;
      white-space: nowrap;
      pointer-events: none;
    }
    .debug .grid{
      opacity: 1;
      background-image:
        linear-gradient(to right, rgba(0,0,0,0.28) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(0,0,0,0.28) 1px, transparent 1px),
        linear-gradient(to right, rgba(0,0,0,0.12) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(0,0,0,0.12) 1px, transparent 1px);
      background-size:
        calc(var(--cm) * 2) calc(var(--cm) * 2),
        calc(var(--cm) * 2) calc(var(--cm) * 2),
        var(--cm) var(--cm),
        var(--cm) var(--cm);
      background-position: 0 0;
    }
    .noprint{
      position: fixed;
      right: 12px;
      top: 12px;
      z-index: 9999;
    }
    .debug-toggle{
      right: 88px;
    }
    @media print {
      .noprint{ display:none; }
      .grid{ display:none; }
      .debug .field{
        outline: none;
        background: transparent;
      }
      .debug .field::after{
        content: "";
      }
      body.debug{
        background: transparent;
        display: block;
        padding: 0;
      }
      .debug .page{
        outline: none;
        box-shadow: none;
      }
    }
  </style>
</head>
<body class="debug">
  <button class="noprint debug-toggle" onclick="document.body.classList.toggle('debug')">Debug</button>
  <button class="noprint" onclick="window.print()">Print</button>
  <div class="page">
    <div class="bg"></div>
    <div class="grid"></div>
    ${fieldsHtml}
  </div>
  <script>
    (function () {
      try {
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
