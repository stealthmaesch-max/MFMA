import {TRACK_SECTORS} from "./track-signals.js";

const anchors={
 start:{lat:41.298980556,lon:-93.275166667,x:64,y:244},
 northwest:{lat:41.299719444,lon:-93.275155556,x:29,y:92},
 northeast:{lat:41.299966667,lon:-93.273577778,x:459,y:89},
 shop:{lat:41.299327778,lon:-93.273658333,x:371,y:217},
 southEntrance:{lat:41.298855556,lon:-93.274475,x:342,y:337},
 center:{lat:41.299363889,lon:-93.274405556,x:239,y:187},
 north:{lat:41.299791667,lon:-93.274333333,x:303,y:71}
};

export const TRACK_ZONE_POLYGONS=Object.freeze({
 "sector-1":[[31,208],[112,208],[125,267],[34,267]],
 "sector-2":[[29,92],[112,92],[112,208],[31,208],[21,164]],
 "sector-3":[[112,74],[230,80],[218,148],[112,148]],
 "sector-4":[[230,50],[361,35],[417,60],[371,103],[230,99]],
 "sector-5":[[371,103],[459,89],[482,139],[451,179],[357,169]],
 "sector-6":[[357,169],[451,179],[455,268],[350,266],[326,219]],
 "sector-7":[[125,267],[350,266],[417,313],[342,337],[123,337]],
 "sector-8":[[218,148],[357,169],[326,219],[112,208]],
 "sector-9":[[112,208],[326,219],[350,266],[125,267]],
 "field-west":[[5,8],[112,8],[112,74],[29,92],[21,164],[31,208],[34,267],[123,337],[5,337]],
 "field-north":[[112,8],[430,8],[417,60],[361,35],[230,50],[112,74]],
 "field-east":[[430,8],[495,8],[495,352],[430,352],[417,313],[455,268],[482,139],[459,89],[417,60]]
});

function barycentric(lat,lon){const a=anchors.start,b=anchors.northwest,c=anchors.northeast,px=lon-a.lon,py=lat-a.lat,bx=b.lon-a.lon,by=b.lat-a.lat,cx=c.lon-a.lon,cy=c.lat-a.lat,det=bx*cy-by*cx;if(!det)return null;return {u:(px*cy-py*cx)/det,v:(bx*py-by*px)/det}}
function baseTrackPoint(lat,lon){const weights=barycentric(lat,lon);if(!weights)return null;const a=anchors.start,b=anchors.northwest,c=anchors.northeast;return {x:a.x+weights.u*(b.x-a.x)+weights.v*(c.x-a.x),y:a.y+weights.u*(b.y-a.y)+weights.v*(c.y-a.y)}}
const corrections=Object.values(anchors).map(anchor=>{const base=baseTrackPoint(anchor.lat,anchor.lon);return {...anchor,dx:anchor.x-base.x,dy:anchor.y-base.y}});
export function geographicToTrackPoint(lat,lon){lat=Number(lat);lon=Number(lon);const base=baseTrackPoint(lat,lon);if(!base)return null;let weightSum=0,dx=0,dy=0;for(const anchor of corrections){const east=(lon-anchor.lon)*Math.cos(lat*Math.PI/180),north=lat-anchor.lat,distanceSquared=east*east+north*north;if(distanceSquared<1e-14)return {x:anchor.x,y:anchor.y};const weight=1/distanceSquared;weightSum+=weight;dx+=anchor.dx*weight;dy+=anchor.dy*weight}return {x:base.x+dx/weightSum,y:base.y+dy/weightSum}}
function pointInPolygon(point,polygon){let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const [xi,yi]=polygon[i],[xj,yj]=polygon[j],cross=yi>point.y!==yj>point.y&&point.x<(xj-xi)*(point.y-yi)/(yj-yi)+xi;if(cross)inside=!inside}return inside}
function segmentDistance(point,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy,t=length?Math.max(0,Math.min(1,((point.x-a[0])*dx+(point.y-a[1])*dy)/length)):0;return Math.hypot(point.x-(a[0]+t*dx),point.y-(a[1]+t*dy))}
export function distanceToZone(point,id){const polygon=TRACK_ZONE_POLYGONS[id];if(!point||!polygon)return Infinity;if(pointInPolygon(point,polygon))return 0;return Math.min(...polygon.map((vertex,index)=>segmentDistance(point,vertex,polygon[(index+1)%polygon.length])))}
export function locateTrackPosition(lat,lon,accuracy=Infinity){const point=geographicToTrackPoint(lat,lon);if(!point)return null;const zone=TRACK_SECTORS.find(item=>pointInPolygon(point,TRACK_ZONE_POLYGONS[item.id]));return {...point,zoneId:zone?.id||null,zoneLabel:zone?.label||"OFF MAP",zoneName:zone?.name||"Outside mapped grounds",accuracy:Number(accuracy)||Infinity}}
