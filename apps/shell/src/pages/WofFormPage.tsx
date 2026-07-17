import { Button } from "@/components/ui";
import "./WofFormPage.css";

export function WofFormPage() {
  return (
    <div className="wof-form-page">
      <div className="wof-print-controls">

        <Button variant="primary" onClick={() => window.print()}>
          打印
        </Button>
      </div>
      <main className="wof-print-sheet">
        <div >
          <div className="custome-box" >
            <div className="organisation" >auto tech,,,,</div>
            <div className="customeDetail" >
              
              <div className="customeTitle"></div>
              <div className="customeContent">
                <div className="cName"></div>
                <div className="cPhone"></div>
                <div className="cPhone"></div>
                <div className="cEmail"></div>
                <div className="cAddress"></div>
              </div>
              </div>
            <div className="vehicle" >vehicle</div>


          </div>
          <div className="list"  >
            <div className="C1-box" />
            <div className="C2-box" />
          </div>
        </div>
        <div className="C3-box" />

        {/* <div className="wof-form-box" /> */}
      </main>
    </div>
  );
}
