const {chromium}=require('playwright'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
(async()=>{
 for(const sub of ['png','pdf','jpg','social'])fs.mkdirSync(path.join(root,sub),{recursive:true});
 const browser=await chromium.launch({headless:true}),page=await browser.newPage();
 async function render(svg,width){
  const v=svg.match(/viewBox="([^"]+)/)[1].split(' ').map(Number),height=Math.round(width*v[3]/v[2]);
  await page.setViewportSize({width,height});
  await page.setContent(`<style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;background:transparent}body>svg{display:block;width:100%;height:100%}</style>${svg}`);
  return height;
 }
 for(const f of fs.readdirSync(path.join(root,'svg')).filter(f=>f.endsWith('.svg'))){
  const svg=fs.readFileSync(path.join(root,'svg',f),'utf8'),width=/emblem|badge/.test(f)?1200:f.includes('stacked')?1800:3000;
  const height=await render(svg,width),stem=f.slice(0,-4);
  await page.screenshot({path:path.join(root,'png',stem+'.png'),omitBackground:true});
  await page.pdf({path:path.join(root,'pdf',stem+'.pdf'),width:width+'px',height:height+'px',printBackground:true,margin:{top:0,bottom:0,left:0,right:0}});
  if(f.includes('light-bg')){await page.addStyleTag({content:'html{background:white}'});await page.screenshot({path:path.join(root,'jpg',stem+'.jpg'),type:'jpeg',quality:95});}
 }
 for(const f of fs.readdirSync(path.join(root,'social')).filter(f=>f.endsWith('.svg'))){
  const svg=fs.readFileSync(path.join(root,'social',f),'utf8');
  const width=f.startsWith('avatar-')?Number(f.match(/avatar-(\d+)/)[1]):f.includes('banner')?1920:1080;
  await render(svg,width);await page.screenshot({path:path.join(root,'social',f.replace('.svg','.png')),omitBackground:false});
 }
 const names=['primary-dark-bg','primary-light-bg','emblem-dark-bg','emblem-light-bg','stacked-dark-bg','stacked-light-bg','wordmark-dark-bg','wordmark-light-bg','primary-black','primary-white'];
 const cards=names.map(n=>`<article class="${n.endsWith('dark-bg')||n.endsWith('white')?'dark':''}"><label>${n.replaceAll('-',' ')}</label>${fs.readFileSync(path.join(root,'svg','parakeet-'+n+'.svg'),'utf8')}</article>`).join('');
 const preview=`<!doctype html><meta charset="utf-8"><title>Parakeet MFMA Team - Baseline</title><style>body{margin:0;padding:40px;background:#e9eaf0;font:16px Arial;color:#061126}h1{margin:0 0 10px}p{margin:0 0 30px;color:#4e5869}main{display:grid;grid-template-columns:1fr 1fr;gap:20px}article{height:280px;padding:24px;border-radius:14px;background:#fff}article.dark{background:#061A36;color:#f4f7fc}label{display:block;font-size:12px;text-transform:uppercase;letter-spacing:2px;margin-bottom:16px}svg{width:100%;height:220px}</style><h1>PARAKEET / MFMA TEAM</h1><p>Baseline identity · Blue and yellow · White bird badge</p><main>${cards}</main>`;
 fs.writeFileSync(path.join(root,'preview.html'),preview);
 await page.setViewportSize({width:1500,height:1800});await page.setContent(preview);await page.screenshot({path:path.join(root,'preview.png'),fullPage:true});
 const guide=fs.readFileSync(path.join(root,'brand-guide.html'),'utf8').replace(/src="(svg\/[^"]+)"/g,(_,f)=>'src="data:image/svg+xml;base64,'+fs.readFileSync(path.join(root,f)).toString('base64')+'"');
 await page.setContent(guide);await page.pdf({path:path.join(root,'brand-guide.pdf'),format:'A4',printBackground:true,margin:{top:0,bottom:0,left:0,right:0}});
 await browser.close();console.log('Exported 16 transparent PNGs, 16 vector PDFs, 4 JPGs, 7 social layouts, preview and guide.');
})();
