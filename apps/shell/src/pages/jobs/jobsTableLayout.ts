export type JobTableColumn = {
  key: string;
  label: string;
  width: number;
  minWidth: number;
};

export type JobTableDetailItem = {
  key: string;
  label: string;
};

export const JOB_TABLE_COLUMNS: JobTableColumn[] = [
  { key: "select", label: "", width: 32, minWidth: 30 },
  { key: "createdAt", label: "创建时间", width: 126, minWidth: 116 },
  { key: "inShop", label: "在店时间", width: 74, minWidth: 68 },
  { key: "status", label: "汽车状态", width: 88, minWidth: 82 },
  { key: "tag", label: "TAG", width: 86, minWidth: 72 },
  { key: "code", label: "code", width: 68, minWidth: 64 },
  { key: "plate", label: "Rego/VIN/Chassis", width: 158, minWidth: 138 },
  { key: "model", label: "Make & Model", width: 166, minWidth: 136 },
  { key: "wof", label: "WOF", width: 78, minWidth: 70 },
  { key: "mech", label: "Mech", width: 132, minWidth: 124 },
  { key: "paint", label: "Paint", width: 108, minWidth: 98 },
  { key: "notes", label: "备注", width: 250, minWidth: 180 },
  { key: "xero", label: "Xero", width: 54, minWidth: 50 },
  { key: "actions", label: "", width: 154, minWidth: 144 },
];

export const JOB_TABLE_DETAIL_ITEMS: JobTableDetailItem[] = [
  { key: "note", label: "备注" },
  { key: "wof", label: "WOF" },
  { key: "mech", label: "机修" },
  { key: "paint", label: "喷漆" },
];
