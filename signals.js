export const signals = {
  clear:{className:"flag-clear",label:"MFMA",instruction:"STANDBY",flash:false,theme:"#0d1117"},
  green:{className:"flag-green",label:"GO",instruction:"SESSION ACTIVE",flash:false,theme:"#0a9f3d"},
  yellow:{className:"flag-yellow",label:"CAUTION",instruction:"TIMER AT HALF SPEED",flash:true,theme:"#ffe600"},
  "move-over":{className:"flag-move-over",label:"MOVE OVER",instruction:"ALLOW FASTER VEHICLE TO PASS",flash:true,theme:"#0756a5"},
  "safety-car":{className:"flag-safety-car",label:"SAFETY CAR",instruction:"FOLLOW SAFETY CAR • NO OVERTAKING",flash:true,theme:"#050505"},
  red:{className:"flag-red",label:"STOP",instruction:"AWAIT RD INSTRUCTIONS",flash:true,theme:"#d40000"},
  "infraction-warning":{className:"flag-infraction-warning",label:"INFRACTION WARNING",instruction:"WHITE + FOLDED YELLOW • CONTINUE WITH CAUTION",flash:false,theme:"#f4f4f4"},
  "under-review":{className:"flag-white",label:"MRA STEWARD",instruction:"INCIDENT UNDER INVESTIGATION",flash:false,theme:"#ffffff"},
  disqualification:{className:"flag-white",label:"DISQUALIFIED",instruction:"RETURN TO STARTING ZONE",flash:false,theme:"#ffffff"},
  checkered:{className:"flag-checkered",label:"CHECKERED",instruction:"SESSION COMPLETE",flash:true,theme:"#000000"}
  ,"return-to-start":{className:"movement-screen movement-return",label:"RETURN TO START",instruction:"EVERYONE RETURN TO THE STARTING ZONE",flash:true,theme:"#111820"}
  ,"proceed-to-start":{className:"movement-screen movement-proceed",label:"PROCEED TO LINE",instruction:"NEXT HIDING TEAM TO THE STARTING LINE",flash:false,theme:"#111820"}
};
