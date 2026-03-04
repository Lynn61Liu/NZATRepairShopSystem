export type WorklogRole = "Technician" | "Admin" | "Supervisor" | "Manager";
export type WorklogSource = "tech" | "admin";
export type WorklogTaskType = "喷漆" | "抛光" | "拆装" | "打磨" | "检查" | "清洁";
export type WorklogFlag = "duplicate" | "overlap" | "long_session";

export type WorklogStaffProfile = {
  id: string;
  name: string;
  role: WorklogRole;
  cost_rate: number;
};

export type WorklogJob = {
  id: string;
  rego: string;
  note: string;
  created_date: string;
  makeModel?: string;
  panels?: number | null;
  customerCode?: string;
};

export type WorklogEntry = {
  id: string;
  staff_name: string;
  team: string;
  role: WorklogRole;
  service_type?: "PNP" | "MECH";
  rego: string;
  job_id?: string;
  job_note: string;
  task_types: WorklogTaskType[];
  work_date: string;
  start_time: string;
  end_time: string;
  cost_rate: number;
  admin_note: string;
  source: WorklogSource;
  created_at: string;
  created_by: string;
  flags: WorklogFlag[];
  flagDismissed?: boolean;
};
