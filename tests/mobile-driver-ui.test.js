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
  assert.equal(await page.locator("[data-hazard-request]").count(),2,"two one-tap hazard requests are visible");
  for(const button of await page.locator("[data-hazard-request]").all())assert((await button.boundingBox()).height>=44,"hazard request has a 44px touch target");
  await browser.close();
 });
}
