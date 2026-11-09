const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert');
(async()=>{const root=path.resolve(__dirname,'..'),browser=await chromium.launch({headless:true}),page=await browser.newPage();let count=0;
for(const f of fs.readdirSync(path.join(root,'svg')).filter(x=>x.endsWith('.svg'))){
 const svg=fs.readFileSync(path.join(root,'svg',f),'utf8');assert(!svg.includes('<text'));assert(svg.includes('Parakeet MFMA Team'));assert(!svg.includes('Champions'));
 await page.setContent(svg);
 const b=await page.evaluate(()=>{const s=document.querySelector('svg'),v=s.viewBox.baseVal,b=s.getBBox();return {left:b.x-v.x,top:b.y-v.y,right:v.x+v.width-b.x-b.width,bottom:v.y+v.height-b.y-b.height}});
 assert(Object.values(b).every(n=>n>=-1),f+' cropped '+JSON.stringify(b));count++;
}await browser.close();console.log(count+' SVG masters have outlined lettering and artwork inside the viewBox.');})();
