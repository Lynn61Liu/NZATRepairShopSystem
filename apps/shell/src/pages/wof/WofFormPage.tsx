import { Fragment, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui";
import { fetchWofFormData } from "@/features/wof/api/wofApi";
import "./WofFormPage.css";

const externalInspectionItems = [
  { code: "E1", label: "DIRECTION INDICATOR LAMPS (FRONT)" },
  { code: "E2", label: "FORWARD-FACING POSITION LAMPS" },
  { code: "E3", label: "HEADLAMPS", mark: "★" },
  { code: "E5", label: "FRONT AND REAR FOG LAMPS", mark: "★" },
  { code: "E6", label: "DIRECTION INDICATOR LAMPS (REAR)" },
  { code: "E7", label: "REARWARD FACING POSITION LAMPS" },
  { code: "E8", label: "STOP LAMPS" },
  { code: "E9", label: "HIGH-MOUNTED STOP LAMPS" },
  { code: "E10", label: "REGISTRATION PLATE LAMPS" },
  { code: "E11", label: "REAR REFLECTORS" },
  { code: "E12", label: "OTHER LAMPS" },
  { code: "E13", label: "WINDSCREEN", mark: "★" },
  { code: "E14", label: "OTHER GLAZING" },
  { code: "E15", label: "DOORS AND HINGED PANELS" },
  { code: "E16", label: "MUDGUARDS" },
  { code: "E17", label: "EXTERNAL PROJECTIONS" },
  { code: "E18", label: "FOOTRESTS (MOTORCYCLES ONLY)", mark: "★" },
  { code: "E19", label: "STRUCTURE/CORROSION (PANELS, DOOR PILLARS, ETC)" },
  { code: "E20", label: "DIMENSIONS" },
];

const internalInspectionItems = [
  { code: "I1", label: "WIPERS/OPERATION", mark: "★" },
  { code: "I2", label: "WASHERS/OPERATION", mark: "★" },
  { code: "I3", label: "REAR VIEW MIRRORS", mark: "★" },
  { code: "I4", label: "SUN VISORS", mark: "★" },
  { code: "I5", label: "SEATBELTS", mark: "★ #" },
  { code: "I6", label: "SEATBELT ANCHORAGES", mark: "★ #" },
  { code: "I7", label: "SEATS AND SEAT ANCHORAGES", mark: "★" },
  { code: "I8", label: "HEAD RESTRAINTS", mark: "★" },
  { code: "I9", label: "INTERIOR IMPACT", mark: "★" },
  { code: "I10", label: "AIRBAG SELF CHECK (DASHBOARD WARNING LAMP)", mark: "★" },
  { code: "I11", label: "ABS SELF CHECK (DASHBOARD WARNING LAMP)", mark: "★" },
  { code: "I12", label: "AUDIBLE WARNING DEVICE", mark: "★" },
  { code: "I13", label: "SPARE WHEEL SECURITY" },
];

const chassisInspectionItems = [
  { code: "C1", label: "WHEELS, HUBS AND AXLES" },
  { code: "C2", label: "STEERING MECHANISM AND COMPONENTS" },
  { code: "C3", label: "SUSPENSION MECHANISM AND COMPONENTS" },
  { code: "C4", label: "FUEL TANK AND FUEL LINES", mark: "★" },
  { code: "C5", label: "BRAKE COMPONENTS (INCL CONTROLS, LINKAGES, LINES AND HOSES)" },
  { code: "C6", label: "EXHAUST SYSTEM AND VISIBLE SMOKE", mark: "★" },
  { code: "C7", label: "TYRE CONDITION" },
  { code: "C8", label: "TYRE TREAD AND DEPTH" },
  { code: "C9", label: "TOWING CONNECTIONS" },
  { code: "C10", label: "SAFETY CHAIN (TRAILERS <2000KG GVM)", mark: "#" },
  {
    code: "C11",
    label: "DUAL SAFETY CHAIN TRAILERS 2000KG-2500KG LADEN (NOT FITTED WITH BREAKAWAY BRAKE)",
    mark: "#",
  },
  { code: "C12", label: "STRUCTURE/CORROSION (CHASSIS/FLOOR PAN ETC)" },
];

const underBonnetInspectionItems = [
  { code: "U1", label: "A/F SYSTEM IN WORKING ORDER", mark: "★" },
  { code: "U2", label: "A/F CERTIFICATE CURRENT", mark: "★" },
  { code: "U3", label: "A/F SYSTEM SAFE", mark: "★" },
  { code: "U4", label: "MODIFIED VEHICLE (DECLARATION CERTIFICATE/LVV PLATE)", mark: "★" },
  { code: "U5", label: "CHASSIS/VIN NUMBER (PRESENT AND RECORDED CORRECTLY)" },
  { code: "U6", label: "STRUCTURE/CORROSION (FIREWALL/INNER GUARDS, ETC)" },
  { code: "U7", label: "ENGINE AND DRIVE TRAIN", mark: "★" },
  { code: "U8", label: "FUEL SYSTEM", mark: "★" },
  { code: "U9", label: "000000000", mark: "★" },
];

type WofFormBackendData = {
  job?: {
    id?: string;
    invoiceReference?: string | null;
    poNumber?: string | null;
  };
  customer?: {
    id?: string;
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    businessCode?: string | null;
  };
  vehicle?: {
    plate?: string | null;
    make?: string | null;
    model?: string | null;
    year?: number | null;
    vin?: string | null;
    chassis?: string | null;
    fuelType?: string | null;
    regoExpiry?: string | null;
    licenceExpiry?: string | null;
    wofExpiry?: string | null;
    odometer?: number | null;
    nzFirstRegistration?: string | null;
  };
  wof?: {
    id?: string;
    jobId?: string;
    occurredAt?: string | null;
    rego?: string | null;
    makeModel?: string | null;
    odo?: string | null;
    recordState?: string | null;
    newWofDate?: string | null;
    authCode?: string | null;
    checkSheet?: string | null;
    csNo?: string | null;
    wofLabel?: string | null;
    labelNo?: string | null;
    failReasons?: string | null;
    previousExpiryDate?: string | null;
    note?: string | null;
    wofUiState?: string | null;
  };
};

function text(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function formatDate(value?: string | null) {
  if (!value) return "";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return value;
}

function isFuelType(fuelType: string | undefined, option: "petrol" | "diesel" | "other"): boolean {
  const normalized = fuelType?.trim().toLowerCase() ?? "";
  const isPetrol = normalized.includes("petrol") || normalized.includes("gasoline");
  const isDiesel = normalized.includes("diesel");
  if (option === "petrol") return isPetrol;
  if (option === "diesel") return isDiesel;
  return Boolean(normalized) && !isPetrol && !isDiesel;
}

export function WofFormPage() {
  const { recordId } = useParams();
  const [formData, setFormData] = useState<WofFormBackendData | null>(null);
  const [loading, setLoading] = useState(Boolean(recordId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!recordId) {
        setFormData(null);
        setLoading(false);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);
      const res = await fetchWofFormData(recordId);
      if (!active) return;
      if (!res.ok) {
        setFormData(null);
        setError(res.error || "加载 WOF 表单数据失败");
      } else {
        setFormData((res.data ?? null) as WofFormBackendData | null);
      }
      setLoading(false);
    };

    load();
    return () => {
      active = false;
    };
  }, [recordId]);

  const customer = formData?.customer;
  const vehicle = formData?.vehicle;
  const wof = formData?.wof;
  const job = formData?.job;
  const fuelType = text(vehicle?.fuelType);
  const plate = text(vehicle?.plate || wof?.rego);
  const odometer = text(wof?.odo || vehicle?.odometer);
  const vin = text(vehicle?.vin || vehicle?.chassis);
  const wofStatus = text(wof?.recordState || wof?.wofUiState || "Pass").toLowerCase();
  const initialPass = wofStatus === "fail" ? "" : "√";
  const initialFail = wofStatus === "fail" ? "X" : "";

  return (
    <div className="wof-form-page">
      <div className="wof-print-controls">
        {loading ? <span className="wof-form-status">加载中...</span> : null}
        {error ? <span className="wof-form-status wof-form-status-error">{error}</span> : null}
        <Button variant="primary" onClick={() => window.print()}>
          打印
        </Button>
      </div>

      <main className="wof-print-sheet">
        <div>
          <div className="custome-box">
            <div className="organisation">
              <strong>AUTO TECH REPAIR &amp; SERVICES LIMITED</strong>
              <strong>T/A: NZ AUTO TECH</strong>
              <strong>486 Ellerslie-panmure Highway,</strong>
              <strong>Mount Wellington, Auckland, 1060</strong>
              <strong>info@nzautotech.co.nz&nbsp;&nbsp;09 213 1988 /02102988666</strong>
            </div>
            <div className="customeDetail">
              <div className="customeTitle"></div>
              <div className="customeContent">
                <div className="fill cName">
                  <span></span> <span>{text(customer?.name)}</span>
                </div>
                <div className="fill cPhone">
                  <span></span> <span>{text(customer?.phone)}</span>
                </div>
                <div className="fill cEmail">
                  <span></span> <span>{text(customer?.email)}</span>
                </div>
                <div className="fill cAddress">
                  <span></span>
                  <span>{text(customer?.address)}</span>
                </div>
              </div>
            </div>

            <div className="vehicle">
              <div className="vehicleTitle empty-cell"></div>
              <div className="vehicleContent">
                <div className="vLine">
                  <div className="vMake">
                    <span className="fill empty-cell"></span> <span>{text(vehicle?.make)}</span>
                  </div>
                  <div className="vModel">
                    <span></span> <span>{text(vehicle?.model || wof?.makeModel)}</span>
                  </div>
                  <div className="vYear">
                    <span></span> <span>{text(vehicle?.year)}</span>
                  </div>
                </div>

                <div className="vLine">
                  <div className="vReg">
                    <span></span> <span>{plate}</span>
                  </div>
                  <div className="vexpiry">
                    <span></span> <span>{formatDate(vehicle?.regoExpiry || vehicle?.licenceExpiry)}</span>
                  </div>
                  <div className="vFirstreg">
                    <span></span> <span>{formatDate(vehicle?.nzFirstRegistration)}</span>
                  </div>
                </div>

                <div className="vLine">
                  <div className="vOdometer">
                    <span></span> <span>{odometer}</span>
                  </div>
                  <div className="vFuel">
                    <span className="fuel-label"></span>
                    <label className="fuel-option">
                      <span></span>
                      <input type="checkbox" name="fuelType" value="petrol" checked={isFuelType(fuelType, "petrol")} readOnly />
                      <span className="fuel-check-box" aria-hidden="true" />
                    </label>
                    <label className="fuel-option">
                      <span></span>
                      <input type="checkbox" name="fuelType" value="diesel" checked={isFuelType(fuelType, "diesel")} readOnly />
                      <span className="fuel-check-box" aria-hidden="true" />
                    </label>
                    <label className="fuel-option">
                      <span></span>
                      <input type="checkbox" name="fuelType" value="other" checked={isFuelType(fuelType, "other")} readOnly />
                      <span className="fuel-check-box" aria-hidden="true" />
                    </label>
                  </div>
                </div>

                <div className="vVin">
                  <span></span> <span>{vin}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="list">
            <div className="C1-box">
              <div className="instructions"></div>
              <div className="exterTitle"></div>
              <div className="exterList">
                {externalInspectionItems.map((item) => (
                  <div className="exterRow" key={item.code}>
                    <div className="exterCode">{item.code}</div>
                    <div className="exterName">{item.label}</div>
                    <div className="exterMark">{item.mark ?? ""}</div>
                    <div className="exterPass">√</div>
                    <div className="exterFail"></div>
                  </div>
                ))}
              </div>
              <div className="interTitle exterTitle"></div>
              <div className="interList">
                {internalInspectionItems.map((item) => (
                  <div className="interRow" key={item.code}>
                    <div className="interCode">{item.code}</div>
                    <div className="interName">{item.label}</div>
                    <div className="interMark">{item.mark ?? ""}</div>
                    <div className="interPass">√</div>
                    <div className="interFail"></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="C2-box">
              <div className="C1-box">
                <div className="Chassis exterTitle"></div>
                <div className="ChassisList">
                  {chassisInspectionItems.map((item) => (
                    <Fragment key={item.code}>
                      <div
                        className={`ChassisRow ${item.code === "C11" ? "ChassisRowTall" : ""
                          }`}
                      >
                        <div className="ChassisCode">{item.code}</div>
                        <div className="ChassisName">{item.label}</div>
                        <div className="ChassisMark">{item.mark ?? ""}</div>
                        <div className="ChassisPass">√</div>
                        <div className="ChassisFail"></div>
                      </div>
                      {item.code === "C8" ? (
                        <div className="ChassisTyreDepth">
                          <div></div>
                          <div></div>
                          <div>
                            LEFT <span>mm</span>
                          </div>
                          <div>
                            RIGHT <span>mm</span>
                          </div>
                          <div></div>
                          <div>FRONT</div>
                          <div className="FrontL"></div>
                          <div className="FrontR"></div>
                          <div></div>
                          <div>REAR</div>
                          <div className="RealLeft"></div>
                          <div className="RealLeft"></div>
                        </div>
                      ) : null}
                    </Fragment>
                  ))}
                </div>
                <div className="road exterTitle">Road </div>
                <div className="roadList">
                  <div className="roadbrake1">
                    <div className="road1Title"> %  LEFT   RIGHT</div>
                    <div className="breakF">
                      <div className="fPer per">20%</div>
                      <div className="fText text">front</div>
                      <div className="fVauleL value"></div>
                      <div className="fVauleR value"></div>
                    </div>
                    <div className="breakR">
                      <div className="rPer per">20%</div>
                      <div className="rText text">Rear</div>
                      <div className="rVauleL value"></div>
                      <div className="rVauleR value"></div>
                 
                  
                  </div>

                  </div>

                  <div className="R1Box box">
                    
                    <div className="r1Num boxTitle">R1</div>
                    <div className="r1Des boxDes"></div>
                    <div className="r1NA naCheck">#</div>
                    <div className="r1pass pCheck">√</div>
                    <div className="r1false fCheck"></div>
                  </div>
                  <div className="R2Box box">
                     <div className="r2Num boxTitle">R1</div>
                    <div className="r2Des boxDes"></div>
                    <div className="r2NA naCheck">#</div>
                    <div className="r2pass pCheck">√</div>
                    <div className="r2false fCheck"></div>
                  </div>
                  <div className="R3Box box">
                    <div className="r3Des ">parking brake reading</div>
                    <div className="r3NA naCheck">#</div>
                    <div className="r3pass pCheck">√</div>
                    <div className="r3false fCheck"></div>
                  </div>

                  <div className="roadbrake2">
                    <div></div>
                    <div></div>
                    <div>LEFT</div>
                    <div>RIGHT</div>
                    <div>√</div>
                    <div>OR</div>
                    <div className="breakLValue"> R</div>
                    <div className="breakRValue"> l</div>
                    <div className="breakPerValue">√</div>
                    <div className="roadbrake2Stall">OR STALL TEST (TICK)</div>
                  </div>
                  <div className="roadRows">
                    <div className="roadRow">
                      <div>R3</div>
                      <div>PARKING BRAKE PERFORMANCE</div>
                      <div>#</div>
                      <div>√</div>
                      <div></div>
                    </div>
                    <div className="roadRow">
                      <div>R4</div>
                      <div>TRAILER BREAKAWAY BRAKE</div>
                      <div>#</div>
                      <div>√</div>
                      <div></div>
                    </div>
                    <div className="roadRow">
                      <div>R5</div>
                      <div>SPEEDOMETER</div>
                      <div>★</div>
                      <div>√</div>
                      <div></div>
                    </div>
                  </div>
                </div>

                <div className="bonne exterTitle">UNDER BONNET </div>
                <div className="bonneList">
                  {underBonnetInspectionItems.map((item) => (
                    <div
                      className={`bonneRow ${item.code === "U5" || item.code === "U6" ? "bonneRowTall" : ""
                        }`}
                      key={item.code}
                    >
                      <div>{item.code}</div>
                      <div>{item.label}</div>
                      <div>{item.mark ?? ""}</div>
                      <div>√</div>
                      <div></div>
                    </div>
                  ))}
                </div>
                <div className="amountBox">
                  <div className="amount">
                    <div className="amountT">AMMOUNT</div>
                    <div className="amountV">$ </div>
                  </div>
                  <div className="amountList"></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="C3-box">
          <div className="customerCopy">
            <div className="customerCopyRow ">
              <div></div>
              <div  className="invoiceNum">rys908</div>
            </div>
            <div className="customerCopyRow">
              <div></div>
              <div></div>
            </div>
            <div className="customerCopyRow">
              <div></div>
              <div>MS6539</div>
            </div>
            <div className="customerCopyRow">
              <div></div>
              <div>{formatDate(wof?.newWofDate || vehicle?.wofExpiry)}</div>
            </div>
            <div className="customerCopyRow">
              <div></div>
              <div>{text(wof?.authCode)}</div>
            </div>
            <div className="customerCopyRow customerCopyRowTall">
              <div></div>
              <div></div>
            </div>
          </div>
          <div className="initial">
            <div className="initalBox">
              <div className="initialinspection "></div>
              <div className="inspectionPass ">{initialPass}</div>
              <div className="inspectionFalse ">{initialFail}</div>
            </div>
            <div className="dataIns">
              <div className="dataText"></div>
              <div className="dataVa">{formatDate(wof?.occurredAt)}</div>
            </div>
            <div className="initialInsTitle "></div>
            <div className="initialInsBox">
              <div className="SignatureText"></div>
              <div className="signatureVa"></div>
            </div>
            <div className="initialInsBox">
              <div className="NumberText"></div>
              <div className="NumberVa">A21350</div>
            </div>
          </div>
          <div className="recheck">
            <div className="recheckTitle">
              <div className="recheckText"></div>
              <div className="recheckPass">√</div>
              <div className="recheckFalse"></div>
            </div>
            <div className="recheckDetail">
              <div className="recheckDetailText">{text(wof?.failReasons)}</div>
              <div className="recheckVa">{formatDate(wof?.previousExpiryDate)}</div>


            </div>
            <div className="recheckDateBoc">
              <div className="recheckDateText"></div>
              <div className="recheckDateVe">{formatDate(wof?.occurredAt)}</div>
            </div>
            <div className="odoBox">
              <div className="odoText"> </div>
              <div className="odoVa"></div>
            </div>
            <div className="tyreBox">
              <div className="tyreTitle"></div>
              <div className="tyreValueBox">
                <div className="tyreF">
                  <div className="LFText tryeUnit">LF</div>
                  <div className="LFVa tryeValue"></div>
                  <div className="RFText tryeUnit">RF</div>
                  <div className="RFVa tryeValue"></div>
                </div>
                <div className="tyreR">
                  <div className="LRText tryeUnit">LR</div>
                  <div className="LRVa tryeValue"></div>
                  <div className="RRText tryeUnit">RR</div>
                  <div className="RRVa tryeValue"></div>
                </div>
              </div>





              <div></div>
            </div>
            <div className="brakeBox">
              <div className="brakeText"></div>
              <div className="brakaVa"></div>
            </div>

            <div className="initialInsTitle "></div>
            <div className="initialInsBox">
              <div className="SignatureText"></div>
              <div className="signatureVa">signature</div>
            </div>
            <div className="initialInsBox">
              <div className="NumberText"></div>
              <div className="NumberVa">A21350</div>
            </div>



          </div>
          <div className="reason">
            <div className="reasonText titleUnit">reason</div>
            <div className="reasonValue">{text(wof?.failReasons)}</div>
          </div>
          <div className="comments">
            <div className="commentsText titleUnit">comments</div>
            <div className="commentsValue">{text(wof?.note)}</div>
          </div>
        </div>

      </main>
    </div>
  );
}
