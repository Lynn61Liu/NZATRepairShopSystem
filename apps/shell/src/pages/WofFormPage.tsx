import { Fragment } from "react";
import { Button } from "@/components/ui";
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

export function WofFormPage() {
  return (
    <div className="wof-form-page">
      <div className="wof-print-controls">
        <Button variant="primary" onClick={() => window.print()}>
          打印
        </Button>
      </div>

      <main className="wof-print-sheet">
        <div>
          <div className="custome-box">
            <div className="organisation">auto tech,,,,</div>
            <div className="customeDetail">
              <div className="customeTitle"></div>
              <div className="customeContent">
                <div className="fill cName">
                  <span>Name:</span> <span>Faste Used</span>
                </div>
                <div className="fill cPhone">
                  <span>Phone:</span> <span>0988384893</span>
                </div>
                <div className="fill cAddress">
                  <span>Address:</span>{" "}
                  <span>4/5 mountWell cresecent,Mount Wellington ,AUCKLAND 1060</span>
                </div>
                <div className="fill cEmail">
                  <span>Email:</span> <span>34839438@gmail.com</span>
                </div>
              </div>
            </div>

            <div className="vehicle">
              <div className="vehicleTitle">vehicleTitle</div>
              <div className="vehicleContent">
                <div className="vLine">
                  <div className="vMake">
                    <span>Make:</span> <span>Ford</span>
                  </div>
                  <div className="vModel">
                    <span>Model:</span> <span>Model</span>
                  </div>
                  <div className="vYear">
                    <span>Year:</span> <span>2018</span>
                  </div>
                </div>

                <div className="vLine">
                  <div className="vReg">
                    <span>plate:</span> <span>ABC123</span>
                  </div>
                  <div className="vexpiry">
                    <span>plate expiry:</span> <span>ABC123</span>
                  </div>
                  <div className="vFirstreg">
                    <span>first:</span> <span> 28/08/2018</span>
                  </div>
                </div>

                <div className="vLine">
                  <div className="vOdometer">
                    <span>odo:</span> <span>123456</span>
                  </div>
                  <div className="vFuel">
                    <span className="fuel-label">Fuel:</span>
                    <label className="fuel-option">
                      <input type="checkbox" name="fuelType" value="petrol" />
                      <span className="fuel-check-box" aria-hidden="true" />
                      <span>Petrol</span>
                    </label>
                    <label className="fuel-option">
                      <input type="checkbox" name="fuelType" value="diesel" />
                      <span className="fuel-check-box" aria-hidden="true" />
                      <span>Diesel</span>
                    </label>
                    <label className="fuel-option">
                      <input type="checkbox" name="fuelType" value="other" />
                      <span className="fuel-check-box" aria-hidden="true" />
                      <span>Other</span>
                    </label>
                  </div>
                </div>

                <div className="vVin">
                  <span>Chassis/VIN No:</span> <span>1HGCM82633A123456</span>
                </div>
              </div>
            </div>
          </div>

          <div className="list">
            <div className="C1-box">
              <div className="instructions">INSTRUCTIONS</div>
              <div className="exterTitle">External inspection</div>
              <div className="exterList">
                {externalInspectionItems.map((item) => (
                  <div className="exterRow" key={item.code}>
                    <div className="exterCode">{item.code}</div>
                    <div className="exterName">{item.label}</div>
                    <div className="exterMark">{item.mark ?? ""}</div>
                    <div className="exterPass"></div>
                    <div className="exterFail"></div>
                  </div>
                ))}
              </div>
              <div className="interTitle exterTitle">internal inspection</div>
              <div className="interList">
                {internalInspectionItems.map((item) => (
                  <div className="interRow" key={item.code}>
                    <div className="interCode">{item.code}</div>
                    <div className="interName">{item.label}</div>
                    <div className="interMark">{item.mark ?? ""}</div>
                    <div className="interPass">P</div>
                    <div className="interFail">F</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="C2-box">
              <div className="C1-box">
                <div className="Chassis exterTitle">Chassis underbody</div>
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
                        <div className="ChassisPass">P</div>
                        <div className="ChassisFail">F</div>
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
                          <div></div>
                          <div></div>
                          <div></div>
                          <div>REAR</div>
                          <div></div>
                          <div></div>
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
                      <div className="fVauleL value">fl3</div>
                      <div className="fVauleR value">fR3</div>
                    </div>
                    <div className="breakR">
                      <div className="rPer per">rr%</div>
                      <div className="rText text">Rear</div>
                      <div className="rVauleL value">rl4</div>
                      <div className="rVauleR value">rR4</div>
                 
                  
                  </div>

                  </div>

                  <div className="R1Box box">
                    
                    <div className="r1Num boxTitle">R1</div>
                    <div className="r1Des boxDes">server r1</div>
                    <div className="r1NA naCheck">#</div>
                    <div className="r1pass pCheck">p</div>
                    <div className="r1false fCheck">f</div>
                  </div>
                  <div className="R2Box box">
                     <div className="r2Num boxTitle">R1</div>
                    <div className="r2Des boxDes">server r1</div>
                    <div className="r2NA naCheck">#</div>
                    <div className="r2pass pCheck">p</div>
                    <div className="r2false fCheck">f</div>
                  </div>
                  <div className="R3Box box">
                    <div className="r3Des ">parking brake reading</div>
                    <div className="r3NA naCheck">#</div>
                    <div className="r3pass pCheck">p</div>
                    <div className="r3false fCheck">f</div>
                  </div>

                  <div className="roadbrake2">
                    <div></div>
                    <div></div>
                    <div>LEFT</div>
                    <div>RIGHT</div>
                    <div>%</div>
                    <div>OR</div>
                    <div className="breakLValue"> R</div>
                    <div className="breakRValue"> l</div>
                    <div className="breakPerValue">对</div>
                    <div className="roadbrake2Stall">OR STALL TEST (TICK)</div>
                  </div>
                  <div className="roadRows">
                    <div className="roadRow">
                      <div>R3</div>
                      <div>PARKING BRAKE PERFORMANCE</div>
                      <div>#</div>
                      <div>P</div>
                      <div>F</div>
                    </div>
                    <div className="roadRow">
                      <div>R4</div>
                      <div>TRAILER BREAKAWAY BRAKE</div>
                      <div>#</div>
                      <div>P</div>
                      <div>F</div>
                    </div>
                    <div className="roadRow">
                      <div>R5</div>
                      <div>SPEEDOMETER</div>
                      <div>★</div>
                      <div>P</div>
                      <div>F</div>
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
                      <div>P</div>
                      <div>F</div>
                    </div>
                  ))}
                </div>
                <div className="amountBox">
                  <div className="amount">
                    <div className="amountT">AMMOUNT</div>
                    <div className="amountV">$ </div>
                  </div>
                  <div className="amountList">3 dot</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="C3-box">
          <div className="customerCopy">
            <div className="customerCopyRow">
              <div>Job/tax invoice number</div>
              <div></div>
            </div>
            <div className="customerCopyRow">
              <div>GST number</div>
              <div></div>
            </div>
            <div className="customerCopyRow">
              <div>MS number</div>
              <div></div>
            </div>
            <div className="customerCopyRow">
              <div>New Wof expiry date</div>
              <div></div>
            </div>
            <div className="customerCopyRow">
              <div>System authorisation number</div>
              <div></div>
            </div>
            <div className="customerCopyRow customerCopyRowTall">
              <div>Wof label number</div>
              <div></div>
            </div>
          </div>
          <div className="initial">
            <div className="initalBox">
              <div className="initialinspection ">initialinspection</div>
              <div className="inspectionPass ">p</div>
              <div className="inspectionFalse ">F</div>
            </div>
            <div className="dataIns">
              <div className="dataText">Date of</div>
              <div className="dataVa">16/17/2026</div>
            </div>
            <div className="initialInsTitle ">Inital INSPECTION</div>
            <div className="initialInsBox">
              <div className="SignatureText">signature</div>
              <div className="signatureVa">yinliu</div>
            </div>
            <div className="initialInsBox">
              <div className="NumberText">Number</div>
              <div className="NumberVa">293392</div>
            </div>
          </div>
          <div className="recheck">
            <div className="recheckTitle">
              <div className="recheckText ">Reckeck inspection</div>
              <div className="recheckPass ">p</div>
              <div className="recheckFalse ">F</div>
            </div>
            <div className="recheckDetail">
              <div className="recheckDetailText">if jdkfjdkfjd fdj</div>
              <div className="recheckVa">00000</div>


            </div>
            <div className="recheckDateBoc">
              <div className="recheckDateText">date </div>
              <div className="recheckDateVe">29/09/2028</div>
            </div>
            <div className="odoBox">
              <div className="odoText">odometer </div>
              <div className="odoVa">444</div>
            </div>
            <div className="tyreBox">
              <div className="tyreTitle">Tyre recheck</div>
              <div className="tyreValueBox">
                <div className="tyreF">
                  <div className="LFText tryeUnit">LF</div>
                  <div className="LFVa tryeValue">33</div>
                  <div className="RFText tryeUnit">RF</div>
                  <div className="RFVa tryeValue">34</div>
                </div>
                <div className="tyreR">
                  <div className="LRText tryeUnit">LR</div>
                  <div className="LRVa tryeValue">55</div>
                  <div className="RRText tryeUnit">RR</div>
                  <div className="RRVa tryeValue">56</div>
                </div>
              </div>





              <div></div>
            </div>
            <div className="brakeBox">
              <div className="brakeText">brake recheck</div>
              <div className="brakaVa">90%</div>
            </div>

            <div className="initialInsTitle ">Recheck INSPECTION</div>
            <div className="initialInsBox">
              <div className="SignatureText">signature</div>
              <div className="signatureVa">2er're</div>
            </div>
            <div className="initialInsBox">
              <div className="NumberText">Number</div>
              <div className="NumberVa">293392</div>
            </div>



          </div>
          <div className="reason">
            <div className="reasonText titleUnit">reason</div>
            <div className="reasonValue">1232宽232</div>
          </div>
          <div className="comments">
            <div className="commentsText titleUnit">comments</div>
            <div className="commentsValue">09090909</div>
          </div>
        </div>

      </main>
    </div>
  );
}
