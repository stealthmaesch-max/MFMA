const {after,before,test}=require("node:test");
const assert=require("node:assert/strict");
const {chromium}=require("playwright");
const fs=require("node:fs");
const http=require("node:http");
const path=require("node:path");

let server,baseUrl;
async function signedDriverPage(browser,viewport){const page=await browser.newPage({viewport});await page.addInitScript(()=>localStorage.setItem("mfma-driver-profile",JSON.stringify({driverId:"test-driver",mraNumber:"MRA100",teamId:"test-team",teamName:"Test Team",vehicleId:"ranger",driverName:"Test Driver",passengerName:""})));return page}
before(async()=>{
 server=http.createServer((request,response)=>{
  const pathname=new URL(request.url,"http://localhost").pathname;
  const file=path.join(process.cwd(),pathname==="/"?"display.html":pathname);
  const type=file.endsWith(".css")?"text/css":file.endsWith(".js")?"text/javascript":"text/html";
  fs.readFile(file,(error,data)=>{response.writeHead(error?404:200,{"Content-Type":type});response.end(error?"Not found":data)});
 });
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 baseUrl=`http://127.0.0.1:${server.address().port}`;
});
after(()=>new Promise(resolve=>server.close(resolve)));

for(const viewport of [{width:375,height:667},{width:390,height:844},{width:393,height:852},{width:402,height:874},{width:430,height:932}]){
 test(`Driver layout fits ${viewport.width}x${viewport.height}`,async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await signedDriverPage(browser,viewport);
  await page.goto(`${baseUrl}/display.html`,{waitUntil:"domcontentloaded"});
  await page.evaluate(()=>{
   document.querySelector("#status-view").classList.add("hidden");
   document.querySelector("#live-view").classList.remove("hidden");
   document.querySelector("#display-session").textContent="SESSION 2 • FINDING • PURSUIT: RANGER • EVADING: SHELLY";
   document.querySelector("#display-timer").textContent="03:42";
   document.querySelector("#label").textContent="GREEN";
   document.querySelector("#instruction").textContent="COURSE CLEAR";
   document.querySelector("#driver-role").textContent="Pursuit";
  });
  const metrics=await page.evaluate(()=>({
   scrollWidth:document.documentElement.scrollWidth,
   clientWidth:document.documentElement.clientWidth,
   scrollHeight:document.documentElement.scrollHeight,
   label:document.querySelector("#label").getBoundingClientRect().toJSON(),
   timer:document.querySelector("#display-timer").getBoundingClientRect().toJSON(),
   tools:document.querySelector("#driver-tools").getBoundingClientRect().toJSON(),
   hazard:document.querySelector(".hazard-actions").getBoundingClientRect().toJSON(),
   crew:document.querySelector("#crew-toggle").getBoundingClientRect().toJSON()
  }));
  assert.equal(metrics.scrollWidth,metrics.clientWidth,"no horizontal scrolling");
  for(const key of ["label","timer","tools","hazard","crew"]){
   assert(metrics[key].left>=0&&metrics[key].right<=viewport.width,`${key} fits horizontally: ${JSON.stringify(metrics[key])}`);
   assert(metrics[key].top>=0&&metrics[key].bottom<=viewport.height,`${key} is visible without scrolling`);
  }
  assert(metrics.label.bottom<metrics.tools.top,"race condition does not overlap Driver controls");
  for(const key of ["hazard","crew"]){
   assert(metrics[key].left>=metrics.tools.left&&metrics[key].right<=metrics.tools.right,`${key} is contained by Driver controls`);
   assert(metrics[key].top>=metrics.tools.top&&metrics[key].bottom<=metrics.tools.bottom,`${key} stays vertically contained`);
  }
  assert.equal(await page.locator("[data-hazard-request]").count(),2,"two one-tap hazard requests are visible");
  for(const button of await page.locator("[data-hazard-request]").all())assert((await button.boundingBox()).height>=44,"hazard request has a 44px touch target");
  await browser.close();
 });
}

test("expanded team controls stay contained on compact iPhone portrait",async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await signedDriverPage(browser,{width:375,height:667});
 await page.goto(`${baseUrl}/display.html`,{waitUntil:"domcontentloaded"});
 await page.evaluate(()=>{
  document.querySelector("#status-view").classList.add("hidden");
  document.querySelector("#live-view").classList.remove("hidden");
  document.querySelector("#occupant-form").classList.remove("hidden");
  document.querySelector("#passenger-name").value="A very long passenger name used to verify containment";
 });
 const metrics=await page.evaluate(()=>{const tools=document.querySelector("#driver-tools").getBoundingClientRect(),form=document.querySelector("#occupant-form").getBoundingClientRect();return {pageWidth:document.documentElement.scrollWidth,tools:{left:tools.left,right:tools.right,top:tools.top,bottom:tools.bottom},form:{left:form.left,right:form.right,top:form.top,bottom:form.bottom},overflowY:getComputedStyle(document.querySelector("#driver-tools")).overflowY}});
 assert.equal(metrics.pageWidth,375,"expanded controls do not create horizontal scrolling");
 assert(metrics.tools.left>=0&&metrics.tools.right<=375&&metrics.tools.top>=0&&metrics.tools.bottom<=667,"Driver controls remain inside the viewport");
 assert(metrics.form.left>=metrics.tools.left&&metrics.form.right<=metrics.tools.right,"expanded team form stays horizontally contained");
 assert.equal(metrics.overflowY,"auto","expanded controls scroll inside their container when needed");
 await browser.close();
});

test("start lights are the sole central focus on iPhone portrait",async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await signedDriverPage(browser,{width:390,height:844});
 await page.goto(`${baseUrl}/display.html`,{waitUntil:"domcontentloaded"});
 const result=await page.evaluate(()=>{
  const display=document.querySelector("#display"),live=document.querySelector("#live-view"),timer=document.querySelector("#display-timer");
  document.querySelector("#status-view").classList.add("hidden");live.classList.remove("hidden");display.className="display flag-start-lights";timer.classList.add("dot-timer");timer.innerHTML=Array.from({length:5},()=>'<span class="lit"><i></i><i></i></span>').join("");
  const board=timer.getBoundingClientRect(),tools=document.querySelector("#driver-tools").getBoundingClientRect();
  return {label:getComputedStyle(document.querySelector("#label")).display,instruction:getComputedStyle(document.querySelector("#instruction")).display,session:getComputedStyle(document.querySelector("#display-session")).display,lights:timer.querySelectorAll("i").length,board:{left:board.left,right:board.right,top:board.top,bottom:board.bottom},toolsTop:tools.top};
 });
 assert.equal(result.label,"none");assert.equal(result.instruction,"none");assert.equal(result.session,"none");assert.equal(result.lights,10,"five paired columns show ten red lamps");
 assert(result.board.left>=0&&result.board.right<=390&&result.board.top>=0&&result.board.bottom<result.toolsTop,"start board is centered, contained, and clear of Driver controls");
 await browser.close();
});

test("Race Control keeps Driver reports visible during a mobile live session",async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.goto(`${baseUrl}/control.html`,{waitUntil:"domcontentloaded"});
 const display=await page.evaluate(()=>{
  document.body.dataset.mode="session-live";
  document.querySelector("#event-area").classList.remove("hidden");
  document.querySelector("#hazard-panel").classList.remove("hidden");
  return getComputedStyle(document.querySelector("#hazard-panel")).display;
 });
 assert.notEqual(display,"none","live-session CSS does not hide Driver reports");
 await browser.close();
});

test("branded shells and MRA steward review fit iPhone portrait",async()=>{
 const browser=await chromium.launch({headless:true});
 for(const pageName of ["index.html","control.html","fan.html","operations.html"]){
  const page=await browser.newPage({viewport:{width:390,height:844}});await page.goto(`${baseUrl}/${pageName}`,{waitUntil:"domcontentloaded"});
  const result=await page.evaluate(()=>{const logo=document.querySelector(".brand-logo"),box=logo?.getBoundingClientRect();return {scrollWidth:document.documentElement.scrollWidth,logo:box&&{left:box.left,right:box.right,top:box.top,bottom:box.bottom},loaded:logo?.complete&&logo?.naturalWidth>0}});
  assert.equal(result.scrollWidth,390,`${pageName} has no horizontal overflow`);assert(result.loaded,`${pageName} loads its MFMA logo`);assert(result.logo.left>=0&&result.logo.right<=390,`${pageName} logo is contained`);await page.close();
 }
 const display=await signedDriverPage(browser,{width:390,height:844});await display.goto(`${baseUrl}/display.html`,{waitUntil:"domcontentloaded"});
 const review=await display.evaluate(()=>{document.querySelector("#status-view").classList.add("hidden");document.querySelector("#live-view").classList.remove("hidden");document.querySelector("#display").className="display flag-white";document.querySelector("#steward-brand").classList.remove("hidden");document.querySelector("#label").textContent="MRA STEWARD";document.querySelector("#instruction").textContent="INCIDENT UNDER INVESTIGATION";const logo=document.querySelector("#steward-brand").getBoundingClientRect(),tools=document.querySelector("#driver-tools").getBoundingClientRect();return {scrollWidth:document.documentElement.scrollWidth,logo:{left:logo.left,right:logo.right,top:logo.top,bottom:logo.bottom},toolsTop:tools.top,label:document.querySelector("#label").textContent,instruction:document.querySelector("#instruction").textContent}});
 assert.equal(review.scrollWidth,390);assert(review.logo.left>=0&&review.logo.right<=390&&review.logo.bottom<review.toolsTop,"MRA review logo remains visible above Driver controls");assert.equal(`${review.label} — ${review.instruction}`,"MRA STEWARD — INCIDENT UNDER INVESTIGATION");
 await browser.close();
});

test("MRA safety information remains readable on iPhone 15 and later",async()=>{
 const browser=await chromium.launch({headless:true});
 for(const viewport of [{width:393,height:852},{width:402,height:874},{width:430,height:932}]){
  const page=await signedDriverPage(browser,viewport);await page.goto(`${baseUrl}/display.html`,{waitUntil:"domcontentloaded"});
  const result=await page.evaluate(()=>{document.querySelector("#status-view").classList.add("hidden");document.querySelector("#live-view").classList.remove("hidden");document.querySelector("#display").className="display flag-yellow flash";document.querySelector("#label").textContent="CAUTION";document.querySelector("#instruction").textContent="TIMER AT HALF SPEED";document.querySelector("#display-timer").textContent="01:42";const panel=document.querySelector("#safety-management");panel.classList.remove("hidden");panel.classList.add("has-message");document.querySelector("#safety-message").textContent="Debris near the north gate — reduce speed";const box=panel.getBoundingClientRect(),tools=document.querySelector("#driver-tools").getBoundingClientRect();return {scrollWidth:document.documentElement.scrollWidth,panel:{left:box.left,right:box.right,top:box.top,bottom:box.bottom},toolsTop:tools.top,fontSize:parseFloat(getComputedStyle(document.querySelector("#safety-message")).fontSize)}});
  assert.equal(result.scrollWidth,viewport.width);assert(result.panel.left>=0&&result.panel.right<=viewport.width,"safety information fits horizontally");assert(result.panel.bottom<result.toolsTop,"safety information remains above Driver controls");assert(result.fontSize>=14,"safety message remains legible");await page.close();
 }
 await browser.close();
});

test("Driver Portal sign-in and MRA disqualification fit iPhone 15",async()=>{
 const browser=await chromium.launch({headless:true}),signedOut=await browser.newPage({viewport:{width:393,height:852}});await signedOut.goto(`${baseUrl}/display.html`,{waitUntil:"domcontentloaded"});
 const portal=await signedOut.evaluate(()=>{const card=document.querySelector(".driver-signin-card").getBoundingClientRect(),logo=document.querySelector(".driver-signin-card>img");return {scrollWidth:document.documentElement.scrollWidth,card:{left:card.left,right:card.right,top:card.top,bottom:card.bottom},logoLoaded:logo.complete&&logo.naturalWidth>0,inputs:[...document.querySelectorAll("#driver-signin-form input,#driver-signin-form button")].map(element=>element.getBoundingClientRect().height),toolsHidden:document.querySelector("#driver-tools").classList.contains("hidden")}});
 assert.equal(portal.scrollWidth,393);assert(portal.card.left>=0&&portal.card.right<=393&&portal.card.top>=0&&portal.card.bottom<=852,"portal card stays in viewport");assert(portal.logoLoaded);assert(portal.inputs.every(height=>height>=44),"portal controls meet iPhone touch sizing");assert(portal.toolsHidden,"signed-out users see the portal instead of reporting tools");await signedOut.close();
 const page=await signedDriverPage(browser,{width:393,height:852});await page.goto(`${baseUrl}/display.html`,{waitUntil:"domcontentloaded"});const dq=await page.evaluate(()=>{document.querySelector("#status-view").classList.add("hidden");document.querySelector("#live-view").classList.remove("hidden");document.querySelector("#display").className="display flag-white flag-disqualified";document.querySelector("#steward-brand").classList.remove("hidden");const label=document.querySelector("#label");label.textContent="DISQUALIFIED";document.querySelector("#instruction").textContent="RETURN TO STARTING ZONE";document.querySelector("#display-timer").textContent="ENDED";const box=label.getBoundingClientRect(),style=getComputedStyle(label),logo=document.querySelector("#steward-brand").getBoundingClientRect();return {label:{left:box.left,right:box.right,height:box.height,fontSize:parseFloat(style.fontSize)},logo:{left:logo.left,right:logo.right},safetyHidden:document.querySelector("#safety-management").classList.contains("hidden")}});assert(dq.label.left>=0&&dq.label.right<=393,"Disqualified stays horizontally contained");assert(dq.label.height<=dq.label.fontSize*1.15,"Disqualified remains on one line");assert(dq.logo.left>=0&&dq.logo.right<=393,"MRA enforcement logo is contained");assert(dq.safetyHidden,"unused safety information stays hidden");await browser.close();
});
