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
  { key: "createdAt", label: "创建时间", width: 128, minWidth: 118 },
  { key: "inShop", label: "在店时间", width: 74, minWidth: 68 },
  { key: "status", label: "汽车状态", width: 96, minWidth: 88 },
  { key: "tag", label: "TAG", width: 92, minWidth: 76 },
  { key: "code", label: "code", width: 72, minWidth: 68 },
  { key: "plate", label: "车牌", width: 94, minWidth: 88 },
  { key: "model", label: "汽车型号", width: 128, minWidth: 120 },
  { key: "actions", label: "操作", width: 180, minWidth: 170 },
];

export const JOB_TABLE_DETAIL_ITEMS: JobTableDetailItem[] = [
  { key: "note", label: "备注" },
  { key: "wof", label: "WOF" },
  { key: "mech", label: "机修" },
  { key: "paint", label: "喷漆" },
];
