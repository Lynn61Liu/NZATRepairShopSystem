const COMPANY_NAME = "AUTO TECH REPAIR & SERVICES";
const COMPANY_ADDRESS = "486 Ellerslie Panmure Highway, Mount Wellington, Auckland 1060";
const COMPANY_PHONE = "021 029 88666  |  09 213 1988";
const SIGN_OFF_NAME = "Eric Zhao";
const DISCLAIMER_TEXT =
  "This email may contain confidential and/or privileged material and the information contained in this message and or attachments is intended only for the person or entity to which it is addressed. If you are not the intended recipient, please notify the sender and delete the email. If you no longer wish to receive emails from Auto Tech Repair & Services or if this message is a commercial electronic message for the purposes of the Unsolicited Electronic Messages Act 2007, please let the sender of this email know.";

export function buildSharedEmailSignatureHtml() {
  return `
    <div style="direction:ltr; font-family:Tahoma, sans-serif; color:#222;">
      <p style="line-height:1.6; margin:0;"><strong>Kind regards</strong></p>
      <p style="line-height:1.6; margin:0;"><br></p>
      <p style="line-height:1.6; margin:0;"><strong>${SIGN_OFF_NAME}</strong></p>
      <p style="line-height:1.6; margin:0;"><br></p>
      <p style="line-height:1.6; margin:0;"><strong>${COMPANY_NAME}</strong></p>
      <p style="line-height:1.6; margin:0;"><br></p>
      <p style="line-height:1.6; margin:0;"><strong style="color:#0b5394;">Add:</strong> ${COMPANY_ADDRESS}</p>
      <p style="line-height:1.6; margin:0;"><strong style="color:#0b5394;">Ph:</strong> ${COMPANY_PHONE}</p>
      <br>
      <div style="margin:0 0 0 36pt; font-family:Calibri, sans-serif;">
        <p style="font-size:8pt; color:black; margin:0;"><strong>CAUTION</strong></p>
        <p style="font-size:8pt; color:black; margin:0;">${DISCLAIMER_TEXT}</p>
      </div>
    </div>
  `;
}

export function buildSharedEmailSignaturePlainText() {
  return [
    "Kind regards,",
    "",
    SIGN_OFF_NAME,
    "",
    COMPANY_NAME,
    `Add: ${COMPANY_ADDRESS}`,
    `Ph: ${COMPANY_PHONE}`,
    "",
    "CAUTION",
    DISCLAIMER_TEXT,
  ].join("\n");
}

export function buildHtmlEmailWithSharedSignature(bodyText: string) {
  const normalized = (bodyText || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocks = normalized
    .split("\n\n")
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const escaped = escapeHtml(block).replace(/\n/g, "<br>");
      return `<p style="margin:0 0 16px; line-height:1.6;">${escaped}</p>`;
    });

  return `
    <div style="font-family:Arial, sans-serif; font-size:14px; color:#222;">
      ${blocks.join("")}
      ${buildSharedEmailSignatureHtml()}
    </div>
  `;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
