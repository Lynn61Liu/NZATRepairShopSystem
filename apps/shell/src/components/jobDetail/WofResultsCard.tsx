import type { WofRecord } from "@/types";

interface WofResultsCardProps {
  wofResults: WofRecord[];
}


export function WofResultsCard({ wofResults }: WofResultsCardProps) {
  return (
    <div className="space-y-3">
      {wofResults.map((record) => {
        return (
          <div
            key={record.id}
            className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-sm font-medium text-gray-900">{record.occurredAt ?? "—"}</span>
                  {/* <span className="text-xs text-gray-500">Source: {record.source ?? "—"}</span> */}
                  {record.recordState ? (
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${record.recordState === "Pass"
                        ? "bg-green-100 text-green-800"
                        : record.recordState === "Recheck"
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-red-100 text-red-800"}`}
                    >
                      {record.recordState}
                    </span>
                  ) : null}
                  {record.recordState === "Fail" && record.previousExpiryDate ? (
                    <span className="text-xs text-red-600">Expiry recheck Date: today+28</span>
                  ) : null}
                </div>
                {/* display all other fields in a structured way */}
                <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">


                  {/* <p className="text-gray-600">Rego: {record.rego}</p> : null */}
                  {/* <p cla  ssName="text-gray-600">Make & Model: {record.makeModel}</p> */}
                  <p className="text-gray-600">Odometer: {record.odo}</p>
                  <p className="text-gray-600">Auth Code: {record.authCode}</p>
                  <p className="text-gray-600">Check Sheet: {record.checkSheet}</p>
                  <p className="text-gray-600">CS No: {record.csNo}</p>
                  <p className="text-gray-600">WOF Label: {record.wofLabel}</p>
                  <p className="text-gray-600">Label No: {record.labelNo}</p>
                  {/* <p className="text-gray-600">Organisation: {record.organisationName}</p> */}

                </div>
                <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">

                  {record.recordState === "Fail" && record.failReasons ? (
                    <p className="text-xs text-gray-500 md:text-sm">Fail Reason: {record.failReasons}</p>) : null}

                  <p className="text-gray-600">{record.note}</p>
                </div>

              </div>

            </div>
          </div>
        );
      })}
    </div>
  );
}
