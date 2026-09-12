const {after,before,test}=require("node:test");
const assert=require("node:assert/strict");
const {chromium}=require("playwright");
const fs=require("node:fs");
const http=require("node:http");
const path=require("node:path");

let server,baseUrl;
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

for(const viewport of [{width:375,height:667},{width:390,height:844},{width:393,height:852},{width:430,height:932}]){
 test(`Driver layout fits ${viewport.width}x${viewport.height}`,async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport});
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
 const page=await browser.newPage({viewport:{width:375,height:667}});
 await page.goto(`${baseUrl}/display.html`,{waitUntil:"domcontentloaded"});
 await page.evaluate(()=>{
  document.querySelector("#status-view").classList.add("hidden");
  document.querySelector("#live-view").classList.remove("hidden");
  document.querySelector("#occupant-form").classList.remove("hidden");
  document.querySelector("#driver-name").value="A very long driver name used to verify containment";
  document.querySelector("#passenger-name").value="A very long passenger name used to verify containment";
 });
 const metrics=await page.evaluate(()=>{const tools=document.querySelector("#driver-tools").getBoundingClientRect(),form=document.querySelector("#occupant-form").getBoundingClientRect();return {pageWidth:document.documentElement.scrollWidth,tools:{left:tools.left,right:tools.right,top:tools.top,bottom:tools.bottom},form:{left:form.left,right:form.right,top:form.top,bottom:form.bottom},overflowY:getComputedStyle(document.querySelector("#driver-tools")).overflowY}});
 assert.equal(metrics.pageWidth,375,"expanded controls do not create horizontal scrolling");
 assert(metrics.tools.left>=0&&metrics.tools.right<=375&&metrics.tools.top>=0&&metrics.tools.bottom<=667,"Driver controls remain inside the viewport");
 assert(metrics.form.left>=metrics.tools.left&&metrics.form.right<=metrics.tools.right,"expanded team form stays horizontally contained");
 assert.equal(metrics.overflowY,"auto","expanded controls scroll inside their container when needed");
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
