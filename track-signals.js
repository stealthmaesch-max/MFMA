export const COURSE_BOUNDARY_ID="course-boundary";

// GPS models only the outside edge of the venue. Legacy sector signals are
// intentionally ignored; global Grip remains a separate Race Control warning.
export const TRACK_SECTORS=Object.freeze([
 {id:COURSE_BOUNDARY_ID,label:"BOUNDARY",name:"MFMA Grounds"}
]);

export const TRACK_SIGNAL_TYPES=Object.freeze({});
export function cleanTrackSignals(){return {}}
export function activeTrackSignals(){return []}
export function hasGripSignal(){return false}

export function trackOutlineMarkup(className="track-outline"){
 return `<svg class="${className}" viewBox="0 0 500 360" role="img" aria-label="MFMA outer course boundary"><g class="map-world"><path class="site-grass" d="M5 8 H430 Q478 18 495 72 V352 H430 Q389 347 342 337 H123 Q65 344 5 337 Z"/><path class="site-start" d="M31 208 L112 208 L125 267 L34 267 Z"/><path class="course-boundary" data-course-boundary="true" d="M5 8 H430 Q478 18 495 72 V352 H430 Q389 347 342 337 H123 Q65 344 5 337 Z"/><text class="start-label" x="47" y="261">START</text></g></svg>`
}
