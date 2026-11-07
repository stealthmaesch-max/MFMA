const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function worker(){
 const handlers={},cached=new Map(),deleted=[],origin='https://stealthmaesch-max.github.io';let shell;
 const cache={addAll:async files=>{shell=[...files]},put:async(request,response)=>cached.set(request.url,response)};
 const caches={open:async()=>cache,match:async request=>cached.get(typeof request==='string'?request:request.url),keys:async()=>['mfma-driver-shell-v1','another-app-cache'],delete:async key=>deleted.push(key)};
 const context={URL,caches,fetch:async()=>{throw Error('Offline')},self:{location:{origin},addEventListener:(name,callback)=>handlers[name]=callback,skipWaiting:()=>{},clients:{claim:()=>{}}}};
 vm.runInNewContext(fs.readFileSync('sw.js','utf8'),context);
 return {handlers,cached,deleted,get shell(){return shell},run:async name=>{let pending;handlers[name]({waitUntil:p=>pending=p});await pending}};
}
test('offline shell includes the full Driver module graph, including its pinned Firebase SDK',async()=>{
 const w=worker();await w.run('install');const entry=fs.readFileSync('display.html','utf8').match(/src="(display\.js\?v=\d+)"/)[1],shell=new Set(w.shell),pending=['./'+entry],seen=new Set();
 while(pending.length){const file=pending.pop();if(seen.has(file))continue;seen.add(file);assert(shell.has(file),`Offline shell is missing ${file}`);if(file.startsWith('https:'))continue;
  const source=fs.readFileSync(file.replace(/^\.\//,'').split('?')[0],'utf8');
  for(const match of source.matchAll(/from\s*["']([^"']+)["']/g))pending.push(match[1]);
 }
 for(const name of ['app','database','auth'])assert(shell.has(`https://www.gstatic.com/firebasejs/12.1.0/firebase-${name}.js`));
});
test('offline Firebase module fetches use cache while authentication and database traffic stay live',async()=>{
 const w=worker(),url='https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js',response={body:'cached SDK'};w.cached.set(url,response);let pending;
 w.handlers.fetch({request:{url,method:'GET',mode:'cors'},respondWith:p=>pending=p,waitUntil:()=>{}});assert.equal(await pending,response);
 for(const url of ['https://identitytoolkit.googleapis.com/v1/accounts:signUp','https://mfma-flag-system-default-rtdb.firebaseio.com/mfma/state.json','https://www.gstatic.com/unrelated.js']){
  let intercepted=false;w.handlers.fetch({request:{url,method:'GET'},respondWith:()=>intercepted=true});assert.equal(intercepted,false,`${url} must not use the offline shell cache`);
 }
});
test('activating the Driver shell preserves caches belonging to other applications',async()=>{
 const w=worker();await w.run('activate');assert.deepEqual(w.deleted,['mfma-driver-shell-v1']);
});
