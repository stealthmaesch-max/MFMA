export const TRACK_SECTORS=Object.freeze([
 {id:"sector-1",label:"S1",name:"Starting Zone"},
 {id:"sector-2",label:"S2",name:"West Grounds"},
 {id:"sector-3",label:"S3",name:"Northwest Grounds"},
 {id:"sector-4",label:"S4",name:"North Grounds"},
 {id:"sector-5",label:"S5",name:"Northeast Grounds"},
 {id:"sector-6",label:"S6",name:"East Loop"},
 {id:"sector-7",label:"S7",name:"South Grounds"},
 {id:"sector-8",label:"S8N",name:"Central North"},
 {id:"sector-9",label:"S8S",name:"Central South"},
 {id:"sector-10",label:"S10",name:"Shop Grounds"},
 {id:"field-west",label:"FW",name:"West Field",field:true},
 {id:"field-north",label:"FN",name:"North Field",field:true},
 {id:"field-east",label:"FE",name:"East Field",field:true}
]);

export const TRACK_SIGNAL_TYPES=Object.freeze({
 yellow:{label:"Local Yellow",shortLabel:"YELLOW",className:"local-yellow"},
 rain:{label:"Grip • Rain / Water",shortLabel:"WET",className:"grip-rain",grip:true},
 debris:{label:"Grip • Loose Debris",shortLabel:"DEBRIS",className:"grip-debris",grip:true}
});

export function cleanTrackSignals(value){const source=value&&typeof value==="object"?value:{};return Object.fromEntries(TRACK_SECTORS.flatMap(sector=>{const signal=source[sector.id],type=signal?.type;return TRACK_SIGNAL_TYPES[type]?[[sector.id,{type,issuedAt:Number(signal.issuedAt)||0}]]:[]}))}
export function activeTrackSignals(value){const clean=cleanTrackSignals(value);return TRACK_SECTORS.flatMap(sector=>clean[sector.id]?[{...sector,...clean[sector.id],...TRACK_SIGNAL_TYPES[clean[sector.id].type]}]:[])}
export function hasGripSignal(value){return activeTrackSignals(value).some(signal=>signal.grip)}
export function trackOutlineMarkup(className="track-outline"){
 const sectors=[
  "M31 208 L112 208 L125 267 L123 337 L34 267 Z",
  "M29 92 L112 92 L112 208 L31 208 L21 164 Z",
  "M112 74 L230 80 L218 148 L112 208 L112 148 Z",
  "M230 80 L230 50 L361 35 L417 60 L459 89 L371 103 L230 103 Z",
  "M371 103 L459 89 L482 139 L451 179 L357 169 Z",
  "M357 169 L451 179 L453 220 L326 219 Z",
  "M125 267 L350 266 L417 313 L342 337 L123 337 Z",
  "M230 80 L230 103 L371 103 L357 169 L326 219 L112 208 L218 148 Z",
  "M112 208 L326 219 L350 266 L125 267 Z",
  "M326 219 L453 220 L455 268 L350 266 Z",
  "M5 8 H112 L112 74 L29 92 L21 164 L31 208 L34 267 L123 337 H5 Z",
  "M112 8 H430 L417 60 L361 35 L230 50 L112 74 Z",
  "M430 8 H495 V352 H430 L417 313 L455 268 L482 139 L459 89 L417 60 Z"
 ];
 const labels=[[64,244],[51,151],[158,111],[303,71],[418,137],[400,199],[244,312],[239,187],[235,246],[397,247],[14,58],[265,23],[468,58]];
 const buildings=[
  [76,101,71,86],[135,224,76,39],[253,112,35,43],[295,112,38,43],[343,111,38,44],[389,111,39,45],[321,185,99,63],[276,278,31,25]
 ];
 return `<svg class="${className}" viewBox="0 0 500 360" role="img" aria-label="MFMA grounds divided into ten operating sectors"><g class="map-world"><g class="site-surface" aria-hidden="true"><path class="site-grass" d="M29 92 L112 74 L230 80 L230 50 L361 35 L417 60 L459 89 L482 139 L451 179 L455 268 L417 313 L342 337 L123 337 L34 267 L31 208 L21 164 Z"/><path class="site-start" d="M31 208 L112 208 L125 267 L34 267 Z"/></g><g class="common-routes" aria-hidden="true"><path d="M35 208 H112 L218 148 L230 80 H371 Q459 80 468 139 Q466 179 357 169 L326 219 Q337 266 417 313"/><path d="M112 74 V208 L125 267 V337"/><path d="M218 148 L112 148"/><path d="M112 208 L326 219"/><path d="M125 267 H350"/></g><g class="track-zones">${sectors.map((path,index)=>`<path data-track-sector="${TRACK_SECTORS[index].id}" class="${TRACK_SECTORS[index].field?"field-zone":""}" d="${path}"/>`).join("")}</g><g class="site-buildings" aria-label="Buildings are legal hiding locations, not through routes">${buildings.map(([x,y,width,height])=>`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="5"/>`).join("")}</g><g class="sector-labels" aria-hidden="true">${labels.map(([x,y],index)=>`<g><circle cx="${x}" cy="${y-3}" r="12"/><text x="${x}" y="${y}">${TRACK_SECTORS[index].label}</text></g>`).join("")}<text class="start-label" x="47" y="261">START</text></g></g></svg>`
}
