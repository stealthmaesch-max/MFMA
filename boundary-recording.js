import {distanceMetres} from "./gps-calibration.js?v=1";

export const BOUNDARY_DRAFT_SCHEMA="mfma-boundary-draft-v1";
export function newBoundaryDraft(now=Date.now()){return {schema:BOUNDARY_DRAFT_SCHEMA,createdAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString(),points:[]}}
export function validBoundaryPoint(p){return p&&Number.isFinite(p.latitude)&&Math.abs(p.latitude)<=90&&Number.isFinite(p.longitude)&&Math.abs(p.longitude)<=180&&Number.isFinite(p.accuracy)&&p.accuracy>0&&p.accuracy<=15&&Number.isFinite(p.timestamp)&&p.timestamp>0}
export function readBoundaryDraft(value){
 if(value?.schema!==BOUNDARY_DRAFT_SCHEMA||!Array.isArray(value.points)||value.points.length>5000||!value.points.every(validBoundaryPoint))throw Error("Choose an MFMA boundary draft with valid GPS points.");
 if(value.points.some((p,i)=>i&&p.timestamp<=value.points[i-1].timestamp))throw Error("Draft points must be in recorded order.");
 return {...newBoundaryDraft(),createdAt:String(value.createdAt||new Date().toISOString()),points:value.points.map(p=>({latitude:p.latitude,longitude:p.longitude,accuracy:p.accuracy,timestamp:p.timestamp,breakBefore:p.breakBefore===true}))};
}
export function recordBoundaryFix(draft,fix,now=Date.now(),breakBefore=false){
 if(!validBoundaryPoint(fix)||now-fix.timestamp>10000||fix.timestamp>now+1000)return {draft,message:"Waiting for a fresh GPS fix of ±15 m or better."};
 if(Number.isFinite(fix.speed)&&fix.speed>3)return {draft,message:"Slow down to walking pace to record the edge."};
 const prior=draft.points.at(-1),distance=prior?distanceMetres(prior,fix):0;
 if(prior&&fix.timestamp<=prior.timestamp)return {draft,message:"Waiting for the next GPS fix."};
 if(prior&&fix.timestamp-prior.timestamp<=15000&&distance>Math.max(25,(fix.timestamp-prior.timestamp)/1000*3+prior.accuracy+fix.accuracy))return {draft,message:"GPS jumped unexpectedly. Hold position for a stable fix."};
 if(prior&&distance<5)return {draft,message:"Recording • move along the edge; points save every 5 m."};
 if(draft.points.length>=5000)return {draft,message:"Point limit reached. Pause and export this draft."};
 const point={latitude:fix.latitude,longitude:fix.longitude,accuracy:fix.accuracy,timestamp:fix.timestamp,breakBefore:Boolean(prior&&(breakBefore||fix.timestamp-prior.timestamp>15000))};
 return {draft:{...draft,updatedAt:new Date(now).toISOString(),points:[...draft.points,point]},message:"Recording • GPS point saved."};
}
export function projectedBoundary(points){
 if(!points.length)return [];const origin=points[0],cos=Math.cos(origin.latitude*Math.PI/180);
 return points.map(p=>({x:(p.longitude-origin.longitude)*111320*cos,y:-(p.latitude-origin.latitude)*111320}));
}
function crosses(a,b,c,d){const side=(p,q,r)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);return side(a,b,c)*side(a,b,d)<0&&side(c,d,a)*side(c,d,b)<0}
export function reviewBoundaryDraft(draft){
 const points=draft.points,xy=projectedBoundary(points),warnings=[];let length=0,area=0,gaps=0;
 for(let i=1;i<points.length;i++){const distance=distanceMetres(points[i-1],points[i]);length+=distance;if(points[i].breakBefore&&distance>20)gaps++;}
 const closingGap=points.length>1?distanceMetres(points[0],points.at(-1)):0;
 for(let i=0;i<xy.length;i++){const next=xy[(i+1)%xy.length];area+=xy[i].x*next.y-next.x*xy[i].y}
 let crossing=false;for(let i=0;i<xy.length&&!crossing;i++)for(let j=i+2;j<xy.length;j++){if(i===0&&j===xy.length-1)continue;if(crosses(xy[i],xy[(i+1)%xy.length],xy[j],xy[(j+1)%xy.length])){crossing=true;break}}
 area=Math.abs(area)/2;
 if(points.length<3)warnings.push("Record at least three distinct points.");
 if(points.length>=3&&(area<50||length<30))warnings.push("The outline is too small or nearly a straight line.");
 if(closingGap>20)warnings.push(`Return near your starting point: the open gap is ${Math.round(closingGap)} m.`);
 if(gaps)warnings.push(`${gaps} recording gap${gaps===1?"":"s"} over 20 m. Check the missing edge before using this draft.`);
 if(crossing)warnings.push("The outline crosses itself. Check the route or undo the last points.");
 return {ready:!warnings.length,pointCount:points.length,length:Math.round(length),area:Math.round(area),closingGap:Math.round(closingGap),warnings};
}
export function exportBoundaryDraft(draft,now=Date.now()){
 const review=reviewBoundaryDraft(draft);
 return {...draft,exportedAt:new Date(now).toISOString(),status:"draft-review-required",appliedToCompetition:false,review,geojson:review.ready?{type:"Feature",properties:{status:"draft-review-required",source:"MFMA perimeter recording"},geometry:{type:"Polygon",coordinates:[[...draft.points.map(p=>[p.longitude,p.latitude]),[draft.points[0].longitude,draft.points[0].latitude]]]}}:null};
}
