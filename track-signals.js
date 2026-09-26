export const TRACK_SECTORS=Object.freeze([
 {id:"sector-1",label:"S1",name:"Start / Finish"},
 {id:"sector-2",label:"S2",name:"North Approach"},
 {id:"sector-3",label:"S3",name:"North Section"},
 {id:"sector-4",label:"S4",name:"Far Section"},
 {id:"sector-5",label:"S5",name:"South Section"},
 {id:"sector-6",label:"S6",name:"Final Approach"}
]);

export const TRACK_SIGNAL_TYPES=Object.freeze({
 yellow:{label:"Local Yellow",shortLabel:"YELLOW",className:"local-yellow"},
 "double-yellow":{label:"Double Yellow",shortLabel:"DOUBLE YELLOW",className:"double-yellow"},
 rain:{label:"Grip • Rain / Water",shortLabel:"WET",className:"grip-rain",grip:true},
 debris:{label:"Grip • Loose Debris",shortLabel:"DEBRIS",className:"grip-debris",grip:true}
});

export function cleanTrackSignals(value){const source=value&&typeof value==="object"?value:{};return Object.fromEntries(TRACK_SECTORS.flatMap(sector=>{const signal=source[sector.id],type=signal?.type;return TRACK_SIGNAL_TYPES[type]?[[sector.id,{type,issuedAt:Number(signal.issuedAt)||0}]]:[]}))}
export function activeTrackSignals(value){const clean=cleanTrackSignals(value);return TRACK_SECTORS.flatMap(sector=>clean[sector.id]?[{...sector,...clean[sector.id],...TRACK_SIGNAL_TYPES[clean[sector.id].type]}]:[])}
export function hasGripSignal(value){return activeTrackSignals(value).some(signal=>signal.grip)}
export function trackOutlineMarkup(className="track-outline"){const paths=["M54 138 C30 112 31 70 58 43","M58 43 C88 15 142 17 170 37","M170 37 C205 19 270 28 285 68","M285 68 C300 110 270 147 227 148","M227 148 C190 159 142 142 116 151","M116 151 C88 158 67 151 54 138"];return `<svg class="${className}" viewBox="0 0 320 180" role="img" aria-label="Six-sector track outline">${paths.map((path,index)=>`<path data-track-sector="sector-${index+1}" d="${path}"/>`).join("")}<path class="track-centerline" d="M54 138 C30 112 31 70 58 43 C88 15 142 17 170 37 C205 19 270 28 285 68 C300 110 270 147 227 148 C190 159 142 142 116 151 C88 158 67 151 54 138"/><text x="49" y="164">START / FINISH</text></svg>`}
