import {distanceToZone} from "./gps-assist.js";

export const TRACK_LIMITS_MAX_ACCURACY=15;
export const TRACK_LIMITS_MIN_SAMPLES=3;
export const TRACK_LIMITS_MIN_DURATION_MS=4000;
export const TRACK_LIMITS_MAX_FIX_GAP_MS=5000;
export const TRACK_LIMITS_COOLDOWN_MS=60000;

export function nearestOpenZone(fix,openZoneIds=[]){
 let nearest=null;
 for(const zoneId of openZoneIds){const distance=distanceToZone(fix,zoneId);if(Number.isFinite(distance)&&(!nearest||distance<nearest.distance))nearest={zoneId,distance}}
 return nearest;
}

export function evaluateTrackLimitFix(previous,fix,openZoneIds,now=Date.now()){
 const state={outsideCount:0,outsideSince:null,insideCount:0,lastReportedAt:0,...previous};
 const accuracy=Number(fix?.accuracy),age=now-Number(fix?.timestamp||now),nearest=nearestOpenZone(fix,openZoneIds);
 if(!fix||!openZoneIds?.length||!Number.isFinite(accuracy)||accuracy<=0||accuracy>TRACK_LIMITS_MAX_ACCURACY||age>10000||!nearest)return {...state,status:"unavailable",candidate:null};
 const margin=Math.max(10,accuracy*1.25),clearlyOutside=nearest.distance>margin;
 if(!clearlyOutside)return {...state,status:"inside",outsideCount:0,outsideSince:null,insideCount:state.insideCount+1,lastFixAt:now,candidate:null};
 const continuous=!state.lastFixAt||now-state.lastFixAt<=TRACK_LIMITS_MAX_FIX_GAP_MS;
 const outsideCount=continuous?state.outsideCount+1:1,outsideSince=continuous&&state.outsideSince?state.outsideSince:now,durationMs=now-outsideSince,cooldownReady=!state.lastReportedAt||now-state.lastReportedAt>=TRACK_LIMITS_COOLDOWN_MS;
 const confirmed=outsideCount>=TRACK_LIMITS_MIN_SAMPLES&&durationMs>=TRACK_LIMITS_MIN_DURATION_MS&&cooldownReady;
 return {...state,status:confirmed?"candidate":"checking",outsideCount,outsideSince,insideCount:0,lastFixAt:now,lastReportedAt:confirmed?now:state.lastReportedAt,candidate:confirmed?{nearestZoneId:nearest.zoneId,distance:Number(nearest.distance.toFixed(1)),accuracy:Number(accuracy.toFixed(1)),sampleCount:outsideCount,durationMs}:null};
}
