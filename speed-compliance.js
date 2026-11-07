export const YELLOW_SPEED_LIMIT_MPH=7;
export const RED_SPEED_LIMIT_MPH=1;
export const SPEED_COMPLIANCE_GRACE_MS=5000;
export const SPEED_COMPLIANCE_MIN_SAMPLES=3;
export const SPEED_COMPLIANCE_MAX_ACCURACY=15;
export const SPEED_COMPLIANCE_MAX_AGE_MS=10000;

export function reliableSpeedMph(fix,now=Date.now()){
 const age=now-fix?.timestamp;
 if(!Number.isFinite(fix?.timestamp)||age<0||age>SPEED_COMPLIANCE_MAX_AGE_MS||!Number.isFinite(fix?.accuracy)||fix.accuracy<=0||fix.accuracy>SPEED_COMPLIANCE_MAX_ACCURACY||!Number.isFinite(fix?.speed)||fix.speed<0)return null;
 return fix.speed*2.236936;
}

export function complianceSignal(flag){
 if(flag==="yellow")return {signal:"yellow",limitMph:YELLOW_SPEED_LIMIT_MPH};
 if(flag==="red")return {signal:"red",limitMph:RED_SPEED_LIMIT_MPH};
 return null;
}

export function evaluateSpeedCompliance(previous,flag,fix,now=Date.now()){
 const requirement=complianceSignal(flag);
 if(!requirement)return {signal:null,status:"inactive",aboveCount:0,aboveSince:null,reported:false,candidate:null};
 const changed=previous?.signal!==requirement.signal;
 const state=changed?{signal:requirement.signal,aboveCount:0,aboveSince:null,reported:false}:{aboveCount:0,aboveSince:null,reported:false,...previous,signal:requirement.signal};
 const accuracy=fix?.accuracy,speedMph=reliableSpeedMph(fix,now);
 if(speedMph===null)return {...state,status:"unavailable",aboveCount:0,aboveSince:null,candidate:null,limitMph:requirement.limitMph};
 if(speedMph<=requirement.limitMph)return {...state,status:"compliant",aboveCount:0,aboveSince:null,candidate:null,limitMph:requirement.limitMph,speedMph};
 const aboveCount=state.aboveCount+1,aboveSince=state.aboveSince||now,durationMs=now-aboveSince;
 const confirmed=!state.reported&&aboveCount>=SPEED_COMPLIANCE_MIN_SAMPLES&&durationMs>=SPEED_COMPLIANCE_GRACE_MS;
 return {...state,status:confirmed?"candidate":"grace",aboveCount,aboveSince,reported:state.reported||confirmed,limitMph:requirement.limitMph,speedMph,candidate:confirmed?{signal:requirement.signal,limitMph:requirement.limitMph,observedMph:Number(speedMph.toFixed(1)),accuracy:Number(accuracy.toFixed(1)),sampleCount:aboveCount,durationMs}:null};
}
