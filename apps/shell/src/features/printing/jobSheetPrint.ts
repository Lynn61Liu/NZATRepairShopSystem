export type JobSheetType = "mech" | "paint";

export type JobSheetRow = {
  plate?: string | null;
  vehicleModel?: string | null;
  customerCode?: string | null;
  customerName?: string | null;
  createdAt?: string | null;
  panels?: number | null;
  nzFirstRegistration?: string | null;
  vin?: string | null;
};

const escapeHtml = (value?: string) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const barcodeUrl = (text?: string) => {
  const t = String(text ?? "").trim();
  if (!t) return "";
  return `https://bwipjs-api.metafloor.com/?bcid=code128&text=${encodeURIComponent(
    t
  )}&scale=3&height=10&includetext=false`;
};

const toDDMMYYYY = (value?: string) => {
  const s = String(value ?? "").trim();
  if (!s) return "";

  // 兼容：ISO / "YYYY/MM/DD HH:mm" / "YYYY-MM-DD HH:mm"
  const normalized = s.replace(/\//g, "-").replace(" ", "T");
  const d = new Date(normalized);
  if (!isNaN(d.getTime())) {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = String(d.getFullYear());
    return `${dd}/${mm}/${yyyy}`;
  }

  // 兜底：从字符串切 YYYY-MM-DD
  const m = s.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) {
    const yyyy = m[1];
    const mm = String(m[2]).padStart(2, "0");
    const dd = String(m[3]).padStart(2, "0");
    return `${dd}/${mm}/${yyyy}`;
  }
  return "";
};

const field = (
  x: number,
  y: number,
  w: number,
  h: number,
  sizePt: number,
  text: string,
  rotate?: boolean
) => {
  if (rotate) {
    // 沿用旧系统 rotate 逻辑：width=h, height=w, rotate(90deg) translateY(-w)
    return `<div class="field" style="left:${x}px;top:${y}px;width:${h}px;height:${w}px;font-size:${sizePt}pt;transform-origin:top left;transform:rotate(90deg) translateY(-${w}px);">${escapeHtml(
      text
    )}</div>`;
  }
  return `<div class="field" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;font-size:${sizePt}pt;">${escapeHtml(
    text
  )}</div>`;
};

export const buildJobSheetHtml = (type: JobSheetType, row: JobSheetRow, notes: string) => {
  const isMech = type === "mech";

  // 新系统字段映射（只用 row）
  const rego = String(row?.plate ?? "").trim().toUpperCase();
  const makeModel = String(row?.vehicleModel ?? "").trim();
  const customer = String(row?.customerCode || row?.customerName || "").trim();
  const dateStr = toDDMMYYYY(String(row?.createdAt ?? ""));
  const comments = String(notes ?? "").trim();
  const panels = row?.panels === null || row?.panels === undefined ? "" : String(row.panels);

  // 新增字段（MECH 模板）
  const nzFirstReg = String(row?.nzFirstRegistration ?? "").trim();

  const vin = String(row?.vin ?? "").trim();

  const bgUrl = isMech
    ? "/print_templates/mech.png"
    : "/print_templates/pnp.png";

  // 旧系统像素尺寸（用于坐标对齐）
  const pageW = isMech ? 794 : 1123;
  const pageH = isMech ? 1123 : 794;

  const pageTitle = isMech ? "MECH Job Sheet" : "PNP Job Sheet";

  const barcode = barcodeUrl(rego);
  const barcodeHtml = barcode
    ? isMech
      ? `<img src="${barcode}" style="position:absolute;left:570px;top:40px;height:60px;" />`
      : `<img src="${barcode}" style="position:absolute;left:864px;top:125px;height:60px;" />`
    : "";

  // 坐标完全沿用旧系统 + 新增两格（只加在 MECH）
  const fieldsHtml = isMech
    ? [
        field(560, 176, 360, 26, 16, customer),
        field(563, 218, 400, 26, 16, makeModel),
        field(220, 163, 180, 26, 16, dateStr),
        field(220, 214, 180, 26, 16, rego),
        field(560, 283, 180, 20, 14, nzFirstReg),
        field(560, 330, 300, 20, 14, vin),
        field(80, 507, 640, 700, 20, comments),
        barcodeHtml,
      ].join("\n")
    : [
        field(160, 97, 320, 24, 16, customer),
        field(479, 97, 150, 24, 16, dateStr),
        field(944, 84, 80, 24, 20, panels),
        field(160, 142, 200, 24, 16, rego),
        field(563, 142, 360, 24, 16, makeModel),
        field(817, 246, 250, 520, 18, comments, true),
        barcodeHtml,
      ].join("\n");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(pageTitle)}</title>
  <style>
    @page { size: A4 ${isMech ? "portrait" : "landscape"}; margin: 0; }
    html, body { margin: 0; padding: 0; }

    /* 强制打印背景 */
    .page{
      position: relative;
      width: ${pageW}px;
      height: ${pageH}px;
      overflow: hidden;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
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
    .field{
      position:absolute;
      font-family: Arial, sans-serif;
      color:#000;
      white-space: pre-wrap;
      overflow:hidden;
      line-height: 1.2;
    }
    .noprint{
      position: fixed;
      right: 12px;
      top: 12px;
      z-index: 9999;
    }
    @media print { .noprint{ display:none; } }
  </style>
</head>
<body>
  <button class="noprint" onclick="window.print()">Print</button>
  <div class="page">
    <div class="bg"></div>
    ${fieldsHtml}
  </div>
</body>
</html>`;
};

export const openJobSheetPopup = (onPopupBlocked?: () => void) => {
  const popup = window.open("", "_blank", "width=900,height=650");
  if (!popup) {
    onPopupBlocked?.();
    return null;
  }
  popup.document.write("<html><body>Loading...</body></html>");
  popup.document.close();
  return popup;
};

export const renderJobSheetPopup = (popup: Window, html: string, delayMs = 50) => {
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.focus();
  window.setTimeout(() => popup.print(), delayMs);
};
