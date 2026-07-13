export const WOF_SPREADSHEET_URL = "https://docs.google.com/spreadsheets/d/1qxh_TACfIQb2-1VFlgNYdNKUhs93Ke169aLP10MsGDY/edit?gid=0#gid=0";

export function getNapaRegoUrl(plate?: string | null) {
  const rego = plate?.trim();
  return rego
    ? `https://www.napaprolink.co.nz/Portal/Catalogue/Catalogue.aspx?rego=${encodeURIComponent(rego)}`
    : "https://www.napaprolink.co.nz/Portal/Catalogue/Catalogue.aspx";
}

export function getPartmasterRegoUrl(plate?: string | null) {
  const rego = plate?.trim();
  return rego
    ? `https://partmaster.kiwi/PM_UI_Search_Master/RegNo.aspx?regNo=${encodeURIComponent(rego)}`
    : "https://partmaster.kiwi/";
}
