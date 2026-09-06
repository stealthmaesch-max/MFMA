export function cleanOccupantReport(driverName,passengerName,submittedAt){
 const driver=String(driverName||"").trim(),passenger=String(passengerName||"").trim();
 if(!driver)throw new Error("Driver name is required.");
 if(driver.length>50)throw new Error("Driver name must be 50 characters or fewer.");
 if(passenger.length>50)throw new Error("Passenger name must be 50 characters or fewer.");
 return {driverName:driver,passengerName:passenger,submittedAt};
}

export function cleanHazardReport({vehicleId,description,category="",requestStopClock=false,requestSafetyCar=false},createdAt){
 const detail=String(description||"").trim();
 if(!detail)throw new Error("Hazard description is required.");
 if(detail.length>240)throw new Error("Hazard description must be 240 characters or fewer.");
 return {vehicleId,description:detail,category:String(category||""),requestStopClock:Boolean(requestStopClock),requestSafetyCar:Boolean(requestSafetyCar),status:"open",createdAt};
}

export function newOpenHazardIds(previous,current){
 const before=previous?.event?.hazards||{},after=current?.event?.hazards||{};
 return Object.keys(after).filter(id=>after[id]?.status==="open"&&!before[id]);
}
