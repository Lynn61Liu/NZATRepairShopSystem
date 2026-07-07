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
  { key: "createdAt", label: "创建时间", width: 140, minWidth: 130 },
  { key: "inShop", label: "在店时间", width: 90, minWidth: 70 },
  { key: "status", label: "汽车状态", width: 110, minWidth: 90 },
  { key: "tag", label: "TAG", width: 110, minWidth: 80 },
  { key: "code", label: "code", width: 100, minWidth: 80 },
  { key: "plate", label: "车牌", width: 120, minWidth: 90 },
  { key: "model", label: "汽车型号", width: 210, minWidth: 160 },
  { key: "actions", label: "操作", width: 230, minWidth: 190 },
];

export const JOB_TABLE_DETAIL_ITEMS: JobTableDetailItem[] = [
  { key: "note", label: "备注" },
  { key: "wof", label: "WOF" },
  { key: "mech", label: "机修" },
  { key: "paint", label: "喷漆" },
];
