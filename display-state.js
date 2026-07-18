export const renderModes={
 "no-event":"no-event",
 standby:"standby",
 "course-lap":"course-lap",
 "session-live":"session-live",
 "sprint-live":"sprint-live",
 provisional:"provisional",
 "session-complete":"session-complete",
 "safety-car-termination":"safety-car-termination",
 "white-termination":"white-termination"
};

export function getRenderMode(state){
 if(!state?.event||state.systemState==="no-event")return "no-event";
 if(state.systemState==="session-live"&&state.session?.phase==="awaiting-finding-start")return "awaiting-finding-start";
 return renderModes[state.systemState]||"no-event";
}

export function showOnly(mode,views){
 new Set(Object.values(views)).forEach(element=>element?.classList.add("hidden"));
 views[mode]?.classList.remove("hidden");
}
