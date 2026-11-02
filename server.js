'use strict';
// Dependency-free HTTP + Server-Sent Events server: realtime updates, playable in any modern browser.
const {createServer} = require('node:http');
const {randomBytes,randomUUID} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const engine = require('./game');
const PORT=Number(process.env.PORT)||3000;
const DATA_FILE=process.env.DATA_FILE||'';
const ROOT=path.join(__dirname,'public');
const MIME={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.ico':'image/x-icon','.svg':'image/svg+xml'};
const rooms=new Map(), clients=new Set();
if(DATA_FILE){try{const saved=JSON.parse(fs.readFileSync(DATA_FILE,'utf8'));for(const g of saved)rooms.set(g.code,g);console.log(`Restored ${rooms.size} rooms`);}catch(err){if(err.code!=='ENOENT')console.error('Could not restore rooms:',err.message);}}
function save(){if(!DATA_FILE)return;try{fs.mkdirSync(path.dirname(DATA_FILE),{recursive:true});const temp=DATA_FILE+'.tmp';fs.writeFileSync(temp,JSON.stringify([...rooms.values()]));fs.renameSync(temp,DATA_FILE);}catch(err){console.error('Could not save games:',err.message);}}
function newCode(){let code;do{code=randomBytes(4).toString('hex').toUpperCase().slice(0,6);}while(rooms.has(code));return code;}
function onlineIds(code){return [...clients].filter(c=>c.game.code===code).map(c=>c.playerId);}
function writeState(c){try{c.response.write(`event: state\ndata: ${JSON.stringify(engine.view(c.game,c.playerId,onlineIds(c.game.code)))}\n\n`);}catch{clients.delete(c);}}
function broadcast(g){for(const c of clients)if(c.game.code===g.code)writeState(c);}
function json(res,obj,code=200){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(obj));}
function authenticate(data){const g=rooms.get(String(data?.code||'').trim().toUpperCase());if(!g)throw Error('Room not found.');const p=g.players.find(p=>p.token===data?.token);if(!p)throw Error('Invalid player session. Rejoin with your original browser.');return {g,p};}
async function readJson(req){let length=0,chunks=[];for await(const chunk of req){length+=chunk.length;if(length>64*1024)throw Error('Request too large.');chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Error('Invalid JSON request.');}}
async function api(req,res,route){try{
 const data=await readJson(req);let output={ok:true};
 if(route==='create'){
   const name=String(data?.name||'').trim().slice(0,24);if(!name)throw Error('Enter your name.');
   const id=randomUUID(),token=randomBytes(24).toString('hex'),code=newCode();
   const g=engine.createGame(code,id,name,token);rooms.set(code,g);save();output={ok:true,code,id,token};
 }else if(route==='join'){
   const code=String(data?.code||'').trim().toUpperCase(),g=rooms.get(code);if(!g)throw Error('Room not found. Check the code.');
   let p=g.players.find(p=>data?.token&&p.token===data.token);
   if(!p){const id=randomUUID(),token=randomBytes(24).toString('hex');engine.joinPlayer(g,id,data?.name,token);p=engine.getPlayer(g,id);}
   save();broadcast(g);output={ok:true,code,id:p.id,token:p.token};
 }else if(route==='action'){
   const {g,p}=authenticate(data);engine.perform(g,p.id,data.action);save();broadcast(g);
 }else if(route==='chat'){
   const {g,p}=authenticate(data);const message=String(data?.text||'').trim().slice(0,250);
   if(!message)throw Error('Write a message.');engine.event(g,message,'chat',p.id);save();broadcast(g);
 }else return json(res,{ok:false,error:'Unknown API action.'},404);
 json(res,output);
 }catch(err){json(res,{ok:false,error:err.message||'Request failed.'},400);}
}
function subscribe(req,res,url){let g,p;try{({g,p}=authenticate({code:url.searchParams.get('code'),token:url.searchParams.get('token')}));}catch(err){return json(res,{ok:false,error:err.message},401);}
 res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
 res.write('retry: 1500\n\n');const c={game:g,playerId:p.id,response:res};clients.add(c);broadcast(g);
 res.on('close',()=>{clients.delete(c);broadcast(g);});
}
function staticFile(req,res,url){let file=url.pathname==='/'?'/index.html':url.pathname;
 // Explicit file whitelist prevents directory traversal and access to saved secrets.
 if(!['/index.html','/client.js','/style.css'].includes(file)){res.writeHead(404);return res.end('Not found');}
 const target=path.join(ROOT,file);fs.readFile(target,(err,bytes)=>{if(err){res.writeHead(404);return res.end('Not found');}res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:bytes);});
}
const server=createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(req.method==='GET'&&url.pathname==='/health')return json(res,{ok:true,rooms:rooms.size});
 if(req.method==='GET'&&url.pathname==='/events')return subscribe(req,res,url);
 if(req.method==='POST'&&url.pathname.startsWith('/api/'))return void api(req,res,url.pathname.slice(5));
 if(req.method==='GET'||req.method==='HEAD')return staticFile(req,res,url);
 json(res,{ok:false,error:'Unsupported method.'},405);
});
const heartbeat=setInterval(()=>{for(const c of clients){try{c.response.write(': ping\n\n');}catch{clients.delete(c);}}},20000);
heartbeat.unref();
server.listen(PORT,'0.0.0.0',()=>console.log(`Harborlands Eight listening at http://localhost:${PORT}`));
module.exports={server,rooms};
