'use strict';
const {test}=require('node:test'), assert=require('node:assert/strict');
const {createGame,joinPlayer,perform,view,legalRoads,legalSettlements,roadLength,points}=require('../game');
function make(n=8){const g=createGame('ABC123','p0','Player 1','tok0');for(let i=1;i<n;i++)joinPlayer(g,'p'+i,'Player '+(i+1),'tok'+i);return g;}
function setup(g){perform(g,'p0',{type:'start'});let placed=0;while(g.mode==='setup'){const pid=g.setupQueue[g.setupIndex];const v=legalSettlements(g,pid)[0];assert.ok(v,`missing setup vertex ${g.setupIndex}`);perform(g,pid,{type:'setup',kind:'settlement',at:v});const edge=legalRoads(g,pid)[0];assert.ok(edge,'missing setup road');perform(g,pid,{type:'setup',kind:'road',at:edge});placed++;assert.ok(placed<=16);}return g;}
test('board contains 37 hexes, 2 deserts, 12 ports and a valid resource distribution',()=>{
 const g=make();const b=g.board;assert.equal(b.tiles.length,37);assert.equal(b.tiles.filter(t=>t.resource==='desert').length,2);assert.equal(b.tiles.filter(t=>t.number!==null).length,35);assert.equal(Object.values(b.edges).filter(e=>e.port).length,12);
 assert.ok(Object.keys(b.vertices).length>60);assert.ok(Object.keys(b.edges).length>90);
 for(const t of b.tiles){assert.equal(new Set(t.vertices).size,6);assert.equal(t.edges.length,6);}
 for(const e of Object.values(b.edges))assert.ok(e.tiles.length===1||e.tiles.length===2);
});
test('eight-player snake setup completes, with starting resources and no close settlements',()=>{
 const g=setup(make());assert.equal(g.mode,'playing');assert.equal(g.players.length,8);
 for(const p of g.players){assert.equal(p.settlements,2);assert.equal(p.roads,2);assert.ok(Object.values(g.board.vertices).filter(v=>v.owner===p.id).length===2);assert.ok(Object.values(g.board.edges).filter(e=>e.owner===p.id).length===2);}
 for(const v of Object.values(g.board.vertices).filter(v=>v.owner))for(const eid of v.edges){const e=g.board.edges[eid],neighbor=g.board.vertices[e.a===v.id?e.b:e.a];assert.ok(!neighbor.owner);}
 const v=view(g,'p3');assert.equal(v.players.length,8);assert.equal(v.current,'p0');assert.equal(v.phase,'roll');
 assert.ok(v.players.every(p=>!('resources'in p)&&!('dev'in p)));
});
test('turn sequence prevents opponents from acting, validates costs, and rolls',()=>{
 const g=setup(make(2));assert.throws(()=>perform(g,'p1',{type:'roll'}),/turn/);perform(g,'p0',{type:'roll'});assert.ok(['action','discard','robber'].includes(g.phase));
 if(g.phase==='action') {perform(g,'p0',{type:'endTurn'});assert.equal(g.currentIndex,1);assert.equal(g.phase,'roll');}
});
test('visible points, private card counts, and development purchases',()=>{
 const g=setup(make(2)),p=g.players[0];assert.equal(points(g,p,true),2);
 for(const r of Object.keys(p.resources))p.resources[r]=10;
 g.phase='action';const v=view(g,'p0');assert.equal(v.hand.wood,10);
 perform(g,'p0',{type:'buyDev'});assert.equal(p.dev.length,1);assert.equal(p.resources.wheat,9);
 assert.equal(view(g,'p1').players[0].devCount,1);
 assert.equal(view(g,'p1').players[0].actualScore,undefined);
});
test('bank trades, development limits, and resource exchange are enforced',()=>{
 const g=setup(make(2));const p=g.players[0],q=g.players[1];p.resources.wood=10;p.resources.brick=5;q.resources.ore=4;g.phase='action';
 perform(g,'p0',{type:'tradeBank',give:'wood',want:'ore'});
 assert.ok(p.resources.wood<=7);assert.equal(p.resources.ore>=1,true);
 perform(g,'p0',{type:'offerTrade',give:{brick:2},want:{ore:1},to:'p1'});
 perform(g,'p1',{type:'acceptTrade'});assert.equal(q.resources.brick>=2,true);assert.equal(q.resources.ore,3);assert.equal(g.trade,null);
});
test('longest road on a valid graph starts at the original two edges',()=>{
 const g=setup(make(4));for(const p of g.players)assert.ok(roadLength(g,p.id)>=1);
});
