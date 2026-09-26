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

test("Race Control module starts and resolves the authentication status",async()=>{
 const browser=await chromium.launch({headless:true}),page=await browser.newPage(),errors=[];
 page.on("pageerror",error=>errors.push(error.message));
 await page.goto(`${baseUrl}/control.html`,{waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>document.querySelector("#auth-status")?.textContent!=="Checking sign-in status…",null,{timeout:12000});
 assert.deepEqual(errors,[]);
 assert.notEqual(await page.locator("#auth-status").textContent(),"Checking sign-in status…");
 await browser.close();
});

test("contextual MRA controls and dual-role Driver drawer fit iPhone 15",async()=>{
 const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:393,height:852}});await page.goto(`${baseUrl}/control.html`,{waitUntil:"domcontentloaded"});
 await page.evaluate(()=>{document.querySelector("#auth-panel").classList.add("hidden");document.querySelector("#secured-control").classList.remove("hidden");document.querySelector("#quick-flag-panel").classList.remove("hidden");document.body.classList.add("flag-controls-active");document.querySelector("#driver-manager-fields").classList.remove("hidden");document.querySelector("#driver-manager-save").classList.remove("hidden");document.querySelector("#manager-driver").innerHTML='<option>Stealth • MRA 16</option>';document.querySelector("#manager-passenger").innerHTML='<option>No registered passenger</option>';document.querySelector("#driver-manager-dialog").showModal()});
 let metrics=await page.evaluate(()=>{const dialog=document.querySelector("#driver-manager-dialog").getBoundingClientRect(),core=[...document.querySelector("#quick-flag-panel").querySelectorAll(":scope .quick-flag-bar > .flag")].map(button=>button.getBoundingClientRect().height);return {width:document.documentElement.scrollWidth,dialog:{left:dialog.left,right:dialog.right,top:dialog.top,bottom:dialog.bottom},core,secondaryHidden:document.querySelector("#secondary-signals").classList.contains("hidden")}});
 assert.equal(metrics.width,393);assert(metrics.dialog.left>=0&&metrics.dialog.right<=393&&metrics.dialog.top>=0&&metrics.dialog.bottom<=852,"dual-role drawer is contained");assert.equal(metrics.core.length,5);assert(Math.max(...metrics.core)-Math.min(...metrics.core)<=2,"core signal buttons use a consistent height");assert(metrics.secondaryHidden,"secondary signals begin collapsed");metrics=await page.evaluate(()=>{document.querySelector("#driver-manager-dialog").close();document.querySelector("#more-signals").click();return {width:document.documentElement.scrollWidth,secondaryHidden:document.querySelector("#secondary-signals").classList.contains("hidden")}});assert.equal(metrics.width,393);assert.equal(metrics.secondaryHidden,false);await browser.close();
});

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
  document.querySelector("#team-driver").innerHTML='<option>Very Long Registered Driver Name • MRA 100</option>';
  document.querySelector("#passenger-driver").innerHTML='<option>A very long registered passenger name • Another Team • MRA 200</option>';
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

test("Shelly qualifying control and driver display fit iPhone 15 portrait",async()=>{
 const browser=await chromium.launch({headless:true});
 const control=await browser.newPage({viewport:{width:393,height:852}});await control.goto(`${baseUrl}/control.html`,{waitUntil:"domcontentloaded"});
 const controlMetrics=await control.evaluate(()=>{document.querySelector("#event-area").classList.remove("hidden");document.querySelector("#qualifying-panel").classList.remove("hidden");const panel=document.querySelector("#qualifying-panel").getBoundingClientRect(),timer=document.querySelector("#qualifying-timer").getBoundingClientRect();return {width:document.documentElement.scrollWidth,panel:{left:panel.left,right:panel.right},timer:{left:timer.left,right:timer.right}}});
 assert.equal(controlMetrics.width,393);assert(controlMetrics.panel.left>=0&&controlMetrics.panel.right<=393);assert(controlMetrics.timer.left>=0&&controlMetrics.timer.right<=393);await control.close();
 const display=await signedDriverPage(browser,{width:393,height:852});await display.goto(`${baseUrl}/display.html`,{waitUntil:"domcontentloaded"});const displayMetrics=await display.evaluate(()=>{document.querySelector("#status-view").classList.add("hidden");document.querySelector("#live-view").classList.remove("hidden");document.querySelector("#display").className="display flag-qualifying";document.querySelector("#label").textContent="QUALIFYING LAP";document.querySelector("#instruction").textContent="TEST DRIVER • SHELLY";document.querySelector("#display-session").textContent="SHORT TRACK • SHELLY";document.querySelector("#display-timer").textContent="01:23.456";const board=document.querySelector("#qualifying-leaderboard");board.classList.remove("hidden");board.innerHTML='<span class="current-driver"><b>1</b><strong>Test Driver</strong><time>01:23.456</time></span><span><b>2</b><strong>Second Driver</strong><time>01:24.010</time></span><span><b>3</b><strong>Third Driver</strong><time>01:25.245</time></span>';const timer=document.querySelector("#display-timer").getBoundingClientRect(),leaderboard=board.getBoundingClientRect(),tools=document.querySelector("#driver-tools").getBoundingClientRect();return {width:document.documentElement.scrollWidth,timer:{left:timer.left,right:timer.right,bottom:timer.bottom},leaderboard:{left:leaderboard.left,right:leaderboard.right,bottom:leaderboard.bottom},toolsTop:tools.top}});assert.equal(displayMetrics.width,393);assert(displayMetrics.timer.left>=0&&displayMetrics.timer.right<=393);assert(displayMetrics.leaderboard.left>=0&&displayMetrics.leaderboard.right<=393&&displayMetrics.leaderboard.bottom<displayMetrics.toolsTop);await browser.close();
});

test("Test Mode controls and display fit iPhone 15 portrait",async()=>{
 const browser=await chromium.launch({headless:true}),control=await browser.newPage({viewport:{width:393,height:852}});await control.goto(`${baseUrl}/control.html`,{waitUntil:"domcontentloaded"});
 const controlMetrics=await control.evaluate(()=>{document.body.dataset.mode="test-mode";document.querySelector("#secured-control").classList.remove("hidden");document.querySelector("#event-area").classList.remove("hidden");document.querySelector("#test-mode-panel").classList.remove("hidden");const panel=document.querySelector("#test-mode-panel").getBoundingClientRect();return {width:document.documentElement.scrollWidth,panel:{left:panel.left,right:panel.right},buttons:[...document.querySelectorAll("[data-test-flag]")].map(button=>button.getBoundingClientRect().height)}});assert.equal(controlMetrics.width,393);assert(controlMetrics.panel.left>=0&&controlMetrics.panel.right<=393);assert(controlMetrics.buttons.every(height=>height>=44));await control.close();
 const display=await signedDriverPage(browser,{width:393,height:852});await display.goto(`${baseUrl}/display.html`,{waitUntil:"domcontentloaded"});const result=await display.evaluate(()=>{document.querySelector("#status-view").classList.add("hidden");document.querySelector("#live-view").classList.remove("hidden");document.querySelector("#driver-tools").classList.add("hidden");document.querySelector("#display").className="display test-mode-display flag-safety-car flash";document.querySelector("#label").textContent="SAFETY CAR";document.querySelector("#instruction").textContent="DISPLAY / SOUND VERIFICATION • NOT AN ACTIVE EVENT";document.querySelector("#display-session").textContent="MRA SYSTEM TEST • SAFETY CAR";document.querySelector("#display-timer").textContent="TEST";const label=document.querySelector("#label").getBoundingClientRect();return {width:document.documentElement.scrollWidth,label:{left:label.left,right:label.right},toolsHidden:document.querySelector("#driver-tools").classList.contains("hidden")}});assert.equal(result.width,393);assert(result.label.left>=0&&result.label.right<=393);assert(result.toolsHidden);await browser.close();
});

test("Grip deterioration cycles flag, weather, flag and stays on one line",async()=>{
 const browser=await chromium.launch({headless:true}),page=await signedDriverPage(browser,{width:375,height:812});await page.goto(`${baseUrl}/display.html`,{waitUntil:"domcontentloaded"});
 for(const condition of ["rain","debris"]){const result=await page.evaluate(condition=>{document.querySelector("#status-view").classList.add("hidden");document.querySelector("#live-view").classList.remove("hidden");const display=document.querySelector("#display");display.className="display flag-grip flash";display.dataset.gripCondition=condition;const label=document.querySelector("#label");label.textContent="GRIP DETERIORATION";document.querySelector("#instruction").textContent="GRIP • GRIP • GRIP";document.querySelector("#display-session").textContent="MFMA SPRINT • FLAG OPERATIONS";document.querySelector("#display-timer").textContent="NO FORMAL SESSION";const box=label.getBoundingClientRect(),style=getComputedStyle(label),surface=getComputedStyle(display,"::after");return {width:document.documentElement.scrollWidth,label:{left:box.left,right:box.right,whiteSpace:style.whiteSpace,scrollWidth:label.scrollWidth,clientWidth:label.clientWidth},condition:display.dataset.gripCondition,animation:surface.animationName,background:surface.backgroundImage}},condition);assert.equal(result.width,375);assert(result.label.left>=0&&result.label.right<=375,`${condition} label stays contained`);assert.equal(result.label.whiteSpace,"nowrap",`${condition} label cannot wrap`);assert(result.label.scrollWidth<=result.label.clientWidth,`${condition} label text fits its line`);assert.equal(result.condition,condition);assert.match(result.animation,/gripCycle/);assert.match(result.animation,condition==="rain"?/gripRain/:/gripDebris/);assert.notEqual(result.background,"none");}
 await browser.close();
});

test("Race Control explanation dialog replaces unsupported prompts on iPhone",async()=>{const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:393,height:852}});await page.goto(`${baseUrl}/control.html`,{waitUntil:"domcontentloaded"});const result=await page.evaluate(()=>{const dialog=document.querySelector("#text-entry-dialog");dialog.showModal();const box=dialog.getBoundingClientRect(),input=document.querySelector("#text-entry-input").getBoundingClientRect();return {width:document.documentElement.scrollWidth,dialog:{left:box.left,right:box.right,top:box.top,bottom:box.bottom},input:{left:input.left,right:input.right,height:input.height}}});assert.equal(result.width,393);assert(result.dialog.left>=0&&result.dialog.right<=393&&result.dialog.top>=0&&result.dialog.bottom<=852);assert(result.input.left>=result.dialog.left&&result.input.right<=result.dialog.right&&result.input.height>=44);await browser.close()});

test("Race Control confirmation sheet replaces unsupported confirms on iPhone",async()=>{const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:393,height:852}});await page.goto(`${baseUrl}/control.html`,{waitUntil:"domcontentloaded"});const result=await page.evaluate(()=>{const dialog=document.querySelector("#confirmation-dialog");document.querySelector("#confirmation-message").textContent="Archive or delete this event after reviewing its official status.";dialog.showModal();const box=dialog.getBoundingClientRect(),buttons=[...dialog.querySelectorAll("button")].map(button=>button.getBoundingClientRect());return {width:document.documentElement.scrollWidth,dialog:{left:box.left,right:box.right,top:box.top,bottom:box.bottom},buttons:buttons.map(box=>({left:box.left,right:box.right,height:box.height}))}});assert.equal(result.width,393);assert(result.dialog.left>=0&&result.dialog.right<=393&&result.dialog.top>=0&&result.dialog.bottom<=852);assert(result.buttons.every(button=>button.left>=result.dialog.left&&button.right<=result.dialog.right&&button.height>=44));await browser.close()});

test("branded shells and MRA steward review fit iPhone portrait",async()=>{
 const browser=await chromium.launch({headless:true});
 for(const pageName of ["index.html","control.html","fan.html","operations.html"]){
  const page=await browser.newPage({viewport:{width:390,height:844}});await page.goto(`${baseUrl}/${pageName}`,{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>{const logo=document.querySelector(".brand-logo");return logo?.complete&&logo?.naturalWidth>0});
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

test("Championship portal branding and leaderboard fit iPhone 15 through Pro Max",async()=>{
 const browser=await chromium.launch({headless:true});
 for(const viewport of [{width:393,height:852},{width:430,height:932}]){
  const page=await browser.newPage({viewport});await page.goto(`${baseUrl}/championship.html`,{waitUntil:"domcontentloaded"});
  const auth=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,header:document.querySelector(".championship-header").getBoundingClientRect().toJSON(),cards:[...document.querySelectorAll(".champ-auth-card")].map(el=>el.getBoundingClientRect().toJSON()),logos:[...document.querySelectorAll(".champ-auth-card>img")].map(img=>img.complete&&img.naturalWidth>0)}));
  assert.equal(auth.scrollWidth,viewport.width,"championship sign-in has no horizontal overflow");assert(auth.header.left>=0&&auth.header.right<=viewport.width,"championship header is contained");assert(auth.cards.every(card=>card.left>=0&&card.right<=viewport.width),"credential cards are contained");assert(auth.logos.every(Boolean),"MFMA and MRA credential branding loads");
  await page.evaluate(()=>{document.querySelector("#champ-auth").classList.add("hidden");document.querySelector("#champ-portal").classList.remove("hidden");document.querySelector("#champ-standings").innerHTML='<article class="champ-standing-row" style="--team-accent:#7758ff"><b class="champ-position">1</b><div class="champ-entrant"><img src="assets/branding/monarch-team-emblem.png" alt=""><span><strong>Stealth Maeschen</strong><small>Monarch MFMA Team</small></span></div><div><strong>2</strong><small>Wins</small></div><div><strong>3</strong><small>Podiums</small></div><div class="champ-points"><strong>25</strong><small>Points</small></div></article>'});await page.waitForFunction(()=>document.querySelector(".champ-entrant img")?.complete);const portal=await page.evaluate(()=>{const row=document.querySelector(".champ-standing-row").getBoundingClientRect(),logo=document.querySelector(".champ-entrant img");return {scrollWidth:document.documentElement.scrollWidth,row:{left:row.left,right:row.right},logo:logo.naturalWidth>0}});
  assert.equal(portal.scrollWidth,viewport.width,"leaderboard has no horizontal overflow");assert(portal.row.left>=0&&portal.row.right<=viewport.width,"leaderboard row is contained");assert(portal.logo,"team emblem loads in the leaderboard");await page.close();
 }
 await browser.close();
});

test("all public shells stay contained across phone, landscape, tablet, and desktop",async()=>{
 const browser=await chromium.launch({headless:true});
 const viewports=[{width:360,height:800},{width:844,height:390},{width:768,height:1024},{width:1440,height:900}];
 for(const viewport of viewports){
  for(const pageName of ["index.html","control.html","display.html","fan.html","operations.html","championship.html"]){
   const page=pageName==="display.html"?await signedDriverPage(browser,viewport):await browser.newPage({viewport});
   await page.goto(`${baseUrl}/${pageName}`,{waitUntil:"domcontentloaded"});
   const metrics=await page.evaluate(pageName=>{
    if(pageName==="control.html"){
     document.querySelector("#auth-gate")?.classList.add("hidden");
     document.querySelector("#secured-control")?.classList.remove("hidden");
    }
    const visibleControls=[...document.querySelectorAll("button,input,select,summary,a.mode")].filter(element=>{
     const style=getComputedStyle(element),box=element.getBoundingClientRect();
     return style.display!=="none"&&style.visibility!=="hidden"&&box.width>0&&box.height>0&&box.top<innerHeight;
    });
    return {
     scrollWidth:document.documentElement.scrollWidth,
     clientWidth:document.documentElement.clientWidth,
     undersized:visibleControls.filter(element=>element.getBoundingClientRect().height<40).map(element=>element.id||element.textContent.trim().slice(0,30))
    };
   },pageName);
   assert.equal(metrics.scrollWidth,metrics.clientWidth,`${pageName} has no horizontal overflow at ${viewport.width}x${viewport.height}`);
   assert.deepEqual(metrics.undersized,[],`${pageName} avoids undersized interactive controls at ${viewport.width}x${viewport.height}`);
   await page.close();
  }
 }
 await browser.close();
});

test("Race Control prioritizes live work and keeps MRA administration proportional",async()=>{
 const browser=await chromium.launch({headless:true});
 for(const viewport of [{width:393,height:852},{width:768,height:1024},{width:1440,height:900}]){
  const page=await browser.newPage({viewport});
  await page.goto(`${baseUrl}/control.html`,{waitUntil:"domcontentloaded"});
  const metrics=await page.evaluate(()=>{
   document.querySelector("#auth-gate")?.classList.add("hidden");
   document.querySelector("#secured-control")?.classList.remove("hidden");
   document.querySelector("#no-event")?.classList.add("hidden");
   document.querySelector("#event-area")?.classList.remove("hidden");
   const event=document.querySelector("#event-area").getBoundingClientRect();
   const management=document.querySelector("#mra-management").getBoundingClientRect();
   const card=document.querySelector(".points-adjustment-form").getBoundingClientRect();
   return {eventTop:event.top,managementTop:management.top,managementWidth:management.width,cardWidth:card.width,viewportWidth:innerWidth};
  });
  assert(metrics.eventTop<metrics.managementTop,"live event controls appear before administration");
  assert(metrics.managementWidth<=Math.min(metrics.viewportWidth,1180)+1,"MRA administration uses a readable maximum width");
  assert(metrics.cardWidth<=metrics.managementWidth,"points widget stays contained within MRA administration");
  await page.close();
 }
 await browser.close();
});

test("flag-free movement orders and acknowledgement controls fit iPhone portrait",async()=>{
 const browser=await chromium.launch({headless:true}),page=await signedDriverPage(browser,{width:393,height:852});
 await page.goto(`${baseUrl}/display.html`,{waitUntil:"domcontentloaded"});
 for(const configuration of [{className:"movement-screen movement-return flash",label:"RETURN TO START",instruction:"EVERYONE RETURN TO THE STARTING ZONE"},{className:"movement-screen movement-proceed",label:"PROCEED TO LINE",instruction:"NEXT HIDING TEAM TO THE STARTING LINE"}]){
  const metrics=await page.evaluate(configuration=>{document.querySelector("#status-view").classList.add("hidden");document.querySelector("#live-view").classList.remove("hidden");document.querySelector("#display").className=`display ${configuration.className}`;document.querySelector("#movement-symbol").classList.remove("hidden");document.querySelector("#label").textContent=configuration.label;document.querySelector("#instruction").textContent=configuration.instruction;const acknowledgement=document.querySelector("#instruction-ack");acknowledgement.classList.remove("hidden");const symbol=document.querySelector("#movement-symbol").getBoundingClientRect(),button=acknowledgement.getBoundingClientRect(),tools=document.querySelector("#driver-tools").getBoundingClientRect();return {width:document.documentElement.scrollWidth,symbol:{left:symbol.left,right:symbol.right},button:{left:button.left,right:button.right,height:button.height,bottom:button.bottom},toolsTop:tools.top}},configuration);
  assert.equal(metrics.width,393);assert(metrics.symbol.left>=0&&metrics.symbol.right<=393,"movement symbol is contained");assert(metrics.button.left>=0&&metrics.button.right<=393&&metrics.button.height>=44,"acknowledgement is a safe touch target");assert(metrics.button.bottom<metrics.toolsTop,"acknowledgement remains above Driver tools");
 }
 await browser.close();
});

test("MRA instruction status remains compact and readable on iPhone",async()=>{
 const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:393,height:852}});await page.goto(`${baseUrl}/control.html`,{waitUntil:"domcontentloaded"});
 const metrics=await page.evaluate(()=>{document.querySelector("#auth-gate")?.classList.add("hidden");document.querySelector("#secured-control")?.classList.remove("hidden");document.querySelector("#event-area")?.classList.remove("hidden");const panel=document.querySelector("#instruction-sync-panel");panel.classList.remove("hidden");document.querySelector("#instruction-sync-title").textContent="EVERYONE RETURN TO STARTING ZONE";document.querySelector("#instruction-sync-summary").textContent="1 of 2 signed-in Driver displays acknowledged.";document.querySelector("#instruction-sync-list").innerHTML='<span class="acknowledged">✓ Ranger • Driver One</span><span>○ Shelly • Driver Two</span>';const box=panel.getBoundingClientRect();return {width:document.documentElement.scrollWidth,panel:{left:box.left,right:box.right,height:box.height},chips:[...panel.querySelectorAll("span")].map(item=>item.getBoundingClientRect().toJSON())}});
 assert.equal(metrics.width,393);assert(metrics.panel.left>=0&&metrics.panel.right<=393,"status widget is contained");assert(metrics.panel.height<240,"status widget does not dominate the MRA screen");assert(metrics.chips.every(chip=>chip.left>=metrics.panel.left&&chip.right<=metrics.panel.right),"acknowledgement chips stay contained");await browser.close();
});
