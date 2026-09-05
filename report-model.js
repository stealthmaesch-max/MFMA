export function cleanOccupantReport(driverName,passengerName,submittedAt){
 const driver=String(driverName||"").trim(),passenger=String(passengerName||"").trim();
 if(!driver)throw new Error("Driver name is required.");
 return {driverName:driver,passengerName:passenger,submittedAt};
}

export function cleanHazardReport({id,vehicleId,description,category="",requestStopClock=false,requestSafetyCar=false},createdAt){
 const detail=String(description||"").trim();
 if(!detail)throw new Error("Hazard description is required.");
 return {id,vehicleId,description:detail,category:String(category||""),requestStopClock:Boolean(requestStopClock),requestSafetyCar:Boolean(requestSafetyCar),status:"open",createdAt,acknowledgedAt:null,resolvedAt:null};
}

export function newOpenHazardIds(previous,current){
 if(!previous)return [];
 const before=previous?.event?.hazards||{},after=current?.event?.hazards||{};
 return Object.keys(after).filter(id=>after[id]?.status==="open"&&!before[id]);
}
