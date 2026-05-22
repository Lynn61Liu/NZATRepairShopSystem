import type { VehicleInfo } from "@/features/newJob/newJob.types";

type VehicleInfoBannerProps = {
  info: VehicleInfo;
};

export function VehicleInfoBanner({ info }: VehicleInfoBannerProps) {
  return (
    <div className="min-w-0 p-3 bg-[rgba(34,197,94,0.05)] rounded-[8px] border border-[rgba(34,197,94,0.20)]">
      <div className="text-xs text-[rgba(0,0,0,0.70)]">
        <div className="font-semibold text-[rgba(34,197,94,0.95)]">✓ Recognized car model information</div> <div className="mt-2 space-y-1">
          <div>
            <span className="text-[rgba(0,0,0,0.55)] ml-2 ">Model:</span> {info.model} <span className="text-[rgba(0,0,0,0.55)] ml-2">Type:</span> {info.type ||"—"}
            
          </div>
          <div>
             <span className="text-[rgba(0,0,0,0.55)] ml-2 ">Year:</span> {info.year} <span className="text-[rgba(0,0,0,0.55)] ml-4 ">Fuel type:</span> {info.fuelType ||"—"}
          </div>
          <div>
            <span className="text-[rgba(0,0,0,0.55)] ml-2 mr-2 ">NZ First Registration:</span>
            {info.nzFirstRegistration || "—"}
          </div>
         
          <div>
            <span className="text-[rgba(0,0,0,0.55)] ml-2 ">VIN：</span>
            {info.vin || "—"}
            <span className="text-[rgba(0,0,0,0.55)] ml-4 ">WOF Expiry Day：</span>
            {info.wofExpiry || "—"}
          </div>
          
        </div>
      </div>
    </div>
  );
}
