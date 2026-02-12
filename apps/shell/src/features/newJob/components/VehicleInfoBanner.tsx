import type { VehicleInfo } from "@/features/newJob/newJob.types";

type VehicleInfoBannerProps = {
  info: VehicleInfo;
};

export function VehicleInfoBanner({ info }: VehicleInfoBannerProps) {
  return (
    <div className="col-span-3 p-3 bg-[rgba(34,197,94,0.05)] rounded-[8px] border border-[rgba(34,197,94,0.20)]">
      <div className="text-xs text-[rgba(0,0,0,0.70)]">
        <div className="font-semibold text-[rgba(34,197,94,0.95)]">✓ 已识别车型信息</div>
        <div className="mt-2 space-y-1">
          <div>
            <span className="text-[rgba(0,0,0,0.55)] ml-2 ">型号：</span>
            {info.model}
             <span className="text-[rgba(0,0,0,0.55)] ml-2">类型：</span>
            {info.type || "—"}
            
          </div>
          <div>
             <span className="text-[rgba(0,0,0,0.55)] ml-2 ">年份：</span>
            {info.year}
             <span className="text-[rgba(0,0,0,0.55)] ml-4 ">燃油类型：</span>
            {info.fuelType || "—"}
          </div>
          <div>
            <span className="text-[rgba(0,0,0,0.55)] ml-2 mr-2 ">NZ First Registration:</span>
            {info.nzFirstRegistration || "—"}
          </div>
         
          <div>
            <span className="text-[rgba(0,0,0,0.55)] ml-2 ">VIN：</span>
            {info.vin || "—"}
          </div>
          
        </div>
      </div>
    </div>
  );
}
