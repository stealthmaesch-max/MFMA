export const TRACK_SECTORS=Object.freeze([
 {id:"sector-1",label:"S1",name:"Starting Zone"},
 {id:"sector-2",label:"S2",name:"West Side"},
 {id:"sector-3",label:"S3",name:"North Loop"},
 {id:"sector-4",label:"S4",name:"East Side"},
 {id:"sector-5",label:"S5",name:"South Grass Run"},
 {id:"sector-6",label:"S6",name:"Central Crossover"}
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
export function trackOutlineMarkup(className="track-outline"){const sectors=["M34 218 L34 151 L91 151 M34 218 L91 218","M34 151 L34 91 C34 62 63 51 91 51 L166 51","M166 51 C201 9 272 7 306 48 C326 72 323 92 298 103 L220 103 M166 51 L269 51","M306 82 L306 218 L220 218 M306 121 L220 121","M220 218 L91 218 L34 218","M166 51 L166 218 M220 51 L220 218 M91 151 L220 151"];const labels=[[49,202],[48,103],[245,29],[286,173],[111,239],[174,139]];return `<svg class="${className}" viewBox="0 0 350 255" role="img" aria-label="MFMA grounds divided into six operating sectors"><g class="site-zones" aria-hidden="true"><rect class="site-start" x="20" y="142" width="75" height="91" rx="12"/><rect class="site-grass" x="20" y="56" width="55" height="84" rx="12"/><rect class="site-grass" x="102" y="174" width="60" height="58" rx="10"/><rect class="site-grass" x="224" y="166" width="98" height="66" rx="10"/><rect class="site-building" x="78" y="47" width="82" height="91" rx="10"/><rect class="site-building" x="230" y="112" width="75" height="53" rx="9"/><rect class="site-building" x="102" y="157" width="27" height="20" rx="5"/><rect class="site-building" x="133" y="157" width="28" height="48" rx="6"/><rect class="site-bin" x="230" y="44" width="75" height="46" rx="9"/><rect class="site-bin" x="174" y="61" width="34" height="69" rx="8"/><rect class="site-bin" x="174" y="136" width="34" height="16" rx="5"/><rect class="site-bin" x="263" y="16" width="31" height="27" rx="8"/></g>${sectors.map((path,index)=>`<path data-track-sector="sector-${index+1}" d="${path}"/>`).join("")}<g class="sector-labels" aria-hidden="true">${labels.map(([x,y],index)=>`<text x="${x}" y="${y}">S${index+1}</text>`).join("")}<text class="start-label" x="29" y="229">STARTING ZONE</text></g></svg>`}
