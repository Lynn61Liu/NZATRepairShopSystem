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
                <div className="cName">Faste Used</div>
                <div className="cPhone"> 0988384893</div>
                <div className="cAddress">4/5 mountWell cresecent,Mount Wellington ,AUCKLAND 1060</div>
                <div className="cEmail">34839438@gmail.com</div>
                
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
