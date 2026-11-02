'use strict';
const { randomInt, randomUUID } = require('node:crypto');

const RESOURCES = ['wood', 'brick', 'sheep', 'wheat', 'ore'];
const COSTS = {
  road: {wood: 1, brick: 1},
  settlement: {wood: 1, brick: 1, sheep: 1, wheat: 1},
  city: {ore: 3, wheat: 2},
  development: {sheep: 1, wheat: 1, ore: 1}
};
const COLORS = ['#ef7468', '#7db2ff', '#ffcc72', '#55c8b4', '#bd96ff', '#f89a61', '#ed9fc7', '#a4d47f'];
const MAX_PLAYERS = 8;
const VICTORY_TARGET = 12;
const PIECE_LIMITS = {road: 20, settlement: 5, city: 4};
function fail(message) { throw new Error(message); }
function assert(cond, message) { if (!cond) fail(message); }
function shuffle(a) { let b = [...a]; for (let i = b.length - 1; i > 0; i--) {const j = randomInt(i + 1); [b[i], b[j]] = [b[j], b[i]];} return b; }
function sum(obj) { return RESOURCES.reduce((n, k) => n + (obj?.[k] || 0), 0); }
function blankResources(n = 0) { return Object.fromEntries(RESOURCES.map(r => [r, n])); }
function rounded(n) { return Math.round(n * 1000) / 1000; }
function event(game, text, kind = 'system', from = null) {
  game.history.push({id: randomUUID(), text, kind, from, at: Date.now()});
  if (game.history.length > 120) game.history.shift();
}
function boardGeometry() {
  const tiles = [], vertices = {}, edges = {}, vk = new Map(), ek = new Map();
  const size = 53;
  let vid = 0, eid = 0;
  for (let r = -3; r <= 3; r++) for (let q = -3; q <= 3; q++) {
    if (Math.abs(q + r) > 3) continue;
    const x = size * Math.sqrt(3) * (q + r / 2), y = 1.5 * size * r;
    const id = `h${tiles.length}`;
    const corners = [];
    for (let i = 0; i < 6; i++) {
      const a = (-90 + 60 * i) * Math.PI / 180;
      const px = rounded(x + size * Math.cos(a)), py = rounded(y + size * Math.sin(a));
      const key = `${Math.round(px * 10)}:${Math.round(py * 10)}`;
      if (!vk.has(key)) {
        const v = `v${vid++}`; vk.set(key, v); vertices[v] = {id:v, x:px, y:py, tiles:[], edges:[], owner:null, building:null};
      }
      const v = vk.get(key); corners.push(v);
      vertices[v].tiles.push(id);
    }
    const tileEdges = [];
    for (let i = 0; i < 6; i++) {
      const a = corners[i], b = corners[(i + 1) % 6];
      const key = [a, b].sort().join(':');
      if (!ek.has(key)) {
        const e = `e${eid++}`; ek.set(key,e);
        edges[e] = {id:e, a, b, tiles:[], owner:null, port:null};
        vertices[a].edges.push(e); vertices[b].edges.push(e);
      }
      const edgeId = ek.get(key); edges[edgeId].tiles.push(id); tileEdges.push(edgeId);
    }
    tiles.push({id,q,r,x:rounded(x),y:rounded(y),vertices:corners,edges:tileEdges,resource:null,number:null});
  }
  const boundary = Object.values(edges).filter(e => e.tiles.length === 1).map(e => {
    const a = vertices[e.a], b=vertices[e.b], tile=tiles.find(t => t.id === e.tiles[0]);
    const x=(a.x+b.x)/2,y=(a.y+b.y)/2;
    const dx=x-tile.x, dy=y-tile.y, len=Math.hypot(dx,dy);
    return {e,x,y,dx:dx/len,dy:dy/len,angle:Math.atan2(y+dy*23,x+dx*23)};
  }).sort((a,b)=>a.angle-b.angle);
  const types = shuffle(['any','wood','any','brick','any','sheep','any','wheat','any','ore','any','any']);
  for (let i=0;i<12;i++) {
    const item=boundary[Math.floor((i+0.4)*boundary.length/12)];
    if(item) item.e.port = {type:types[i], x:rounded(item.x+item.dx*27), y:rounded(item.y+item.dy*27)};
  }
  const resources=shuffle([...Array(8).fill('wood'),...Array(7).fill('brick'),...Array(7).fill('sheep'),...Array(7).fill('wheat'),...Array(6).fill('ore'),...Array(2).fill('desert')]);
  tiles.forEach((t,i) => t.resource=resources[i]);
  // High-yield tokens are kept apart to prevent unfair adjacent 6/8 clusters.
  const numbers=[...Array(2).fill(2),...Array(3).fill(3),...Array(4).fill(4),...Array(4).fill(5),...Array(5).fill(6),...Array(5).fill(8),...Array(4).fill(9),...Array(4).fill(10),...Array(3).fill(11),12];
  let best=null, minPenalty=Infinity;
  for (let attempt=0;attempt<450;attempt++) {
    const choice=shuffle(numbers); let j=0, penalty=0;
    const tns=tiles.map(t=>t.resource==='desert' ? null : choice[j++]);
    for(let a=0;a<tiles.length;a++) if(tns[a]===6 || tns[a]===8) {
      for(let b=a+1;b<tiles.length;b++) if((tns[b]===6 || tns[b]===8) && tiles[a].vertices.some(v=>tiles[b].vertices.includes(v))) penalty++;
    }
    if(penalty<minPenalty){minPenalty=penalty;best=tns;}
    if(penalty===0) break;
  }
  tiles.forEach((t,i)=>t.number=best[i]);
  return {tiles,vertices,edges};
}
function newPlayer(id,name,token,index) {
  return {id, name:String(name).trim().slice(0,24), token, color:COLORS[index], resources:blankResources(), dev:[], roads:0, settlements:0, cities:0, knights:0};
}
function createGame(code,id,name,token) {
  assert(name && String(name).trim(), 'Enter a player name.');
  const game = {code, host:id, players:[newPlayer(id,name,token,0)], board:boardGeometry(), mode:'lobby', setupQueue:[], setupIndex:0, setupStage:'settlement', setupVertex:null,
    currentIndex:0, phase:'roll', robberTile:null, pendingDiscards:{}, stealTargets:[], bank:blankResources(35),
    trade:null, turnNumber:1, dice:null, playedDev:false, freeRoads:0, deck:shuffle([...Array(24).fill('knight'),...Array(8).fill('victory'),...Array(5).fill('roadBuilding'),...Array(4).fill('yearPlenty'),...Array(4).fill('monopoly')]),
    longestRoadOwner:null, largestArmyOwner:null, longestRoadLength:0, winner:null, history:[]};
  game.robberTile = game.board.tiles.find(t=>t.resource==='desert').id;
  event(game,`${name} created the room.`);
  return game;
}
function joinPlayer(g,id,name,token) {
  assert(g.mode==='lobby','The game has started. Rejoin using your original browser session.');
  assert(g.players.length < MAX_PLAYERS, 'This room already has eight players.');
  assert(name && String(name).trim(),'Enter a player name.');
  assert(!g.players.some(p=>p.name.toLowerCase()===String(name).trim().toLowerCase()),'That player name is taken.');
  g.players.push(newPlayer(id,name,token,g.players.length));
  event(g,`${String(name).trim()} joined (${g.players.length}/8).`);
}
function getPlayer(g,id) {const p=g.players.find(p=>p.id===id); assert(p,'You are not in this room.'); return p;}
function current(g) { return g.players[g.currentIndex]; }
function assertTurn(g,id) { assert(g.mode==='playing','The game is not in progress.'); assert(current(g).id===id,'It is not your turn.'); }
function canAfford(p,cost) {return RESOURCES.every(r=>(p.resources[r]||0)>=(cost[r]||0));}
function pay(g,p,cost) {assert(canAfford(p,cost),'Not enough resources.'); for(const r of RESOURCES){const n=cost[r]||0;p.resources[r]-=n;g.bank[r]+=n;}}
function grant(g,p,resource,amount) {assert(g.bank[resource]>=amount,`The bank is short of ${resource}.`);g.bank[resource]-=amount;p.resources[resource]+=amount;}
function otherEnd(e,v) {return e.a===v?e.b:e.a;}
function neighbors(g,v) {return g.board.vertices[v].edges.map(id=>otherEnd(g.board.edges[id],v));}
function distanceRule(g,v) {return !g.board.vertices[v].owner && neighbors(g,v).every(n=>!g.board.vertices[n].owner);}
function touchesRoad(g,p,v) {return g.board.vertices[v].edges.some(eid=>g.board.edges[eid].owner===p.id);}
function legalSettlements(g,id) {
  const p=getPlayer(g,id);
  if(g.mode==='setup') {
    if(g.setupQueue[g.setupIndex]!==id || g.setupStage!=='settlement') return [];
    return Object.keys(g.board.vertices).filter(v=>distanceRule(g,v));
  }
  if(g.mode!=='playing'||current(g).id!==id||g.phase!=='action'||p.settlements>=PIECE_LIMITS.settlement||!canAfford(p,COSTS.settlement))return [];
  return Object.keys(g.board.vertices).filter(v=>distanceRule(g,v)&&touchesRoad(g,p,v));
}
function canConnect(g,id,v) {
  const vertex=g.board.vertices[v];
  if(vertex.owner && vertex.owner!==id) return false;
  return vertex.owner===id || vertex.edges.some(eid=>g.board.edges[eid].owner===id);
}
function legalRoads(g,id) {
  const p=getPlayer(g,id);
  if(p.roads>=PIECE_LIMITS.road) return [];
  if(g.mode==='setup') {
    if(g.setupQueue[g.setupIndex]!==id||g.setupStage!=='road')return [];
    return g.board.vertices[g.setupVertex].edges.filter(eid=>!g.board.edges[eid].owner);
  }
  if(g.mode!=='playing'||current(g).id!==id||g.phase!=='action')return [];
  if(g.freeRoads<=0 && !canAfford(p,COSTS.road))return [];
  return Object.values(g.board.edges).filter(e=>!e.owner&&(canConnect(g,id,e.a)||canConnect(g,id,e.b))).map(e=>e.id);
}
function legalCities(g,id) {
  const p=getPlayer(g,id);
  if(g.mode!=='playing'||current(g).id!==id||g.phase!=='action'||p.cities>=PIECE_LIMITS.city||!canAfford(p,COSTS.city))return [];
  return Object.values(g.board.vertices).filter(v=>v.owner===id&&v.building==='settlement').map(v=>v.id);
}
function roadLength(g,id) {
  const roads=Object.values(g.board.edges).filter(e=>e.owner===id);
  if(!roads.length)return 0;
  const adj=new Map(); for(const e of roads){for(const v of [e.a,e.b]){if(!adj.has(v))adj.set(v,[]);adj.get(v).push(e);}}
  function explore(v,used,depth) {
    let best=depth;
    if(depth && g.board.vertices[v].owner && g.board.vertices[v].owner!==id)return best;
    for(const e of adj.get(v)||[]) if(!used.has(e.id)) {used.add(e.id);best=Math.max(best,explore(otherEnd(e,v),used,depth+1));used.delete(e.id);}
    return best;
  }
  let max=0;for(const v of adj.keys())max=Math.max(max,explore(v,new Set(),0));return max;
}
function updateAwards(g) {
  const maxArmy=Math.max(0,...g.players.map(p=>p.knights));
  if(maxArmy>=3) {
    const leaders=g.players.filter(p=>p.knights===maxArmy);
    if(leaders.length===1) g.largestArmyOwner=leaders[0].id;
    else if(!leaders.some(p=>p.id===g.largestArmyOwner))g.largestArmyOwner=null;
  } else g.largestArmyOwner=null;
  const sizes=g.players.map(p=>({id:p.id,n:roadLength(g,p.id)}));
  const maxRoad=Math.max(0,...sizes.map(s=>s.n));g.longestRoadLength=maxRoad;
  if(maxRoad>=5) {
    const leaders=sizes.filter(s=>s.n===maxRoad);
    if(leaders.length===1)g.longestRoadOwner=leaders[0].id;
    else if(!leaders.some(s=>s.id===g.longestRoadOwner))g.longestRoadOwner=null;
  } else g.longestRoadOwner=null;
}
function points(g,p,includeHidden) {
  return p.settlements+2*p.cities+(g.longestRoadOwner===p.id?2:0)+(g.largestArmyOwner===p.id?2:0)+(includeHidden?p.dev.filter(c=>c.type==='victory').length:0);
}
function winCheck(g,p) {updateAwards(g);if(points(g,p,true)>=VICTORY_TARGET){g.mode='finished';g.winner=p.id;event(g,`${p.name} has won with ${points(g,p,true)} victory points!`);}}
function resourcesValid(obj,{nonzero=true}={}) {
  assert(obj&&typeof obj==='object'&&!Array.isArray(obj),'Select valid resource amounts.');
  for(const [key,value] of Object.entries(obj))assert(RESOURCES.includes(key)&&Number.isSafeInteger(value)&&value>=0&&value<=35,'Invalid resource amounts.');
  if(nonzero)assert(sum(obj)>0,'Select at least one resource.');
}
function trimResourceObj(obj){return Object.fromEntries(RESOURCES.map(r=>[r,obj[r]||0]));}
function getStealTargets(g,id) {
  const t=g.board.tiles.find(t=>t.id===g.robberTile);let eligible=new Set();
  for(const vid of t.vertices){const owner=g.board.vertices[vid].owner;if(owner&&owner!==id&&sum(getPlayer(g,owner).resources)>0)eligible.add(owner);}
  return [...eligible];
}
function afterRobberMove(g,id,tile) {
  assert(g.phase==='robber','You cannot move the pirate right now.');
  assert(g.board.tiles.some(t=>t.id===tile)&&tile!==g.robberTile,'Choose a different tile.');
  g.robberTile=tile;g.stealTargets=getStealTargets(g,id);
  g.phase=g.stealTargets.length?'steal':'action';
  event(g,`${getPlayer(g,id).name} moved the pirate.`);
}
function produce(g,number) {
  // If the bank cannot fulfill all claims for a resource, nobody receives that resource this roll.
  const claims={}; for(const r of RESOURCES)claims[r]=[];
  for(const t of g.board.tiles) if(t.number===number && t.id!==g.robberTile) {
    for(const vid of t.vertices){const v=g.board.vertices[vid];if(v.owner)claims[t.resource].push({id:v.owner,amount:v.building==='city'?2:1});}
  }
  for(const r of RESOURCES) if(claims[r].reduce((s,x)=>s+x.amount,0)<=g.bank[r]) for(const x of claims[r])grant(g,getPlayer(g,x.id),r,x.amount);
}
function start(g,id) {
  assert(g.mode==='lobby','This game already started.');assert(g.host===id,'Only the host can start.');
  assert(g.players.length>=2,'At least two players are required.');
  g.setupQueue=[...g.players.map(p=>p.id),...g.players.map(p=>p.id).reverse()];
  g.setupIndex=0;g.setupStage='settlement';g.mode='setup';
  event(g,`The game begins! Place two settlements and two roads in snake order.`);
}
function setupBuild(g,id,action) {
  assert(g.mode==='setup' && g.setupQueue[g.setupIndex]===id,'Wait for your placement turn.');
  const p=getPlayer(g,id), kind=action.kind;
  if(g.setupStage==='settlement') {
    assert(kind==='settlement','Place a settlement first.');
    assert(legalSettlements(g,id).includes(action.at),'That settlement location is not available.');
    const v=g.board.vertices[action.at];v.owner=id;v.building='settlement';p.settlements++;
    g.setupVertex=action.at;g.setupStage='road';
    // Second settlement provides starting resources.
    if(g.setupIndex>=g.players.length) for(const tileId of v.tiles){const t=g.board.tiles.find(t=>t.id===tileId);if(t.resource!=='desert'&&g.bank[t.resource]>0)grant(g,p,t.resource,1);}
    event(g,`${p.name} placed a starting settlement.`);
  } else {
    assert(kind==='road','Place a road from your new settlement.');
    assert(legalRoads(g,id).includes(action.at),'That road location is not available.');
    g.board.edges[action.at].owner=id;p.roads++;
    g.setupIndex++;g.setupStage='settlement';g.setupVertex=null;
    if(g.setupIndex===g.setupQueue.length){g.mode='playing';g.currentIndex=0;g.phase='roll';event(g,`Setup complete. ${current(g).name} rolls first.`);}
  }
}
function build(g,id,action) {
  assertTurn(g,id);assert(g.phase==='action','Finish the current action first.');
  const p=getPlayer(g,id),kind=action.kind;
  if(kind==='road'){
    assert(legalRoads(g,id).includes(action.at),'Cannot build a road there.');
    if(g.freeRoads>0)g.freeRoads--;else pay(g,p,COSTS.road);
    g.board.edges[action.at].owner=id;p.roads++;event(g,`${p.name} built a road.`);
  } else if(kind==='settlement'){
    assert(legalSettlements(g,id).includes(action.at),'Cannot build a settlement there.');
    pay(g,p,COSTS.settlement);const v=g.board.vertices[action.at];v.owner=id;v.building='settlement';p.settlements++;
    event(g,`${p.name} built a settlement.`);
  } else if(kind==='city'){
    assert(legalCities(g,id).includes(action.at),'Cannot build a city there.');
    pay(g,p,COSTS.city);g.board.vertices[action.at].building='city';p.cities++;p.settlements--;
    event(g,`${p.name} upgraded a city.`);
  } else fail('Unknown building type.');
  winCheck(g,p);
}
function roll(g,id) {
  assertTurn(g,id);assert(g.phase==='roll','You have already rolled.');
  const a=randomInt(1,7),b=randomInt(1,7);g.dice=[a,b];
  event(g,`${current(g).name} rolled ${a} + ${b} = ${a+b}.`);
  if(a+b===7){
    g.pendingDiscards={};for(const p of g.players) if(sum(p.resources)>7)g.pendingDiscards[p.id]=Math.floor(sum(p.resources)/2);
    g.phase=Object.keys(g.pendingDiscards).length?'discard':'robber';
  } else {produce(g,a+b);g.phase='action';}
}
function discard(g,id,cards) {
  assert(g.mode==='playing'&&g.phase==='discard','Nobody needs to discard right now.');
  const p=getPlayer(g,id);assert(g.pendingDiscards[id],'You do not need to discard.');
  resourcesValid(cards);assert(sum(cards)===g.pendingDiscards[id],`Discard exactly ${g.pendingDiscards[id]} cards.`);
  assert(canAfford(p,cards),'You do not have all those cards.');pay(g,p,cards);delete g.pendingDiscards[id];
  event(g,`${p.name} discarded cards.`);
  if(!Object.keys(g.pendingDiscards).length)g.phase='robber';
}
function moveRobber(g,id,tile) {assertTurn(g,id);afterRobberMove(g,id,tile);}
function steal(g,id,victimId) {
  assertTurn(g,id);assert(g.phase==='steal','Nothing to steal right now.');
  assert(g.stealTargets.includes(victimId),'Choose an eligible player.');
  const victim=getPlayer(g,victimId),p=getPlayer(g,id);
  const cards=RESOURCES.flatMap(r=>Array(victim.resources[r]).fill(r));
  assert(cards.length,'That player has no cards.');const r=cards[randomInt(cards.length)];victim.resources[r]--;p.resources[r]++;
  g.stealTargets=[];g.phase='action';event(g,`${p.name} stole a card from ${victim.name}.`);
}
function buyDev(g,id){assertTurn(g,id);assert(g.phase==='action','Finish your current action first.');assert(g.deck.length,'Development card deck is empty.');const p=getPlayer(g,id);
  pay(g,p,COSTS.development);const type=g.deck.pop();p.dev.push({id:randomUUID(),type,boughtTurn:g.turnNumber});event(g,`${p.name} bought a development card.`);winCheck(g,p);
}
function playDev(g,id,cardId,detail) {
  assertTurn(g,id);assert(g.phase==='action','Finish your current action first.');assert(!g.playedDev,'Only one development card may be played per turn.');
  const p=getPlayer(g,id),i=p.dev.findIndex(c=>c.id===cardId);assert(i>=0,'Card not found.');const c=p.dev[i];
  assert(c.type!=='victory','Victory points count automatically.');assert(c.boughtTurn<g.turnNumber,'You cannot play a card bought this turn.');
  if(c.type==='yearPlenty') {
    assert(Array.isArray(detail?.resources)&&detail.resources.length===2&&detail.resources.every(r=>RESOURCES.includes(r)),'Choose two resources.');
    const need=blankResources();for(const r of detail.resources)need[r]++;
    assert(RESOURCES.every(r=>need[r]<=g.bank[r]),'Bank does not have those resources.');
    for(const r of detail.resources)grant(g,p,r,1);
  } else if(c.type==='monopoly') {
    assert(RESOURCES.includes(detail?.resource),'Select a resource.');
    for(const other of g.players)if(other.id!==id){const n=other.resources[detail.resource];other.resources[detail.resource]=0;p.resources[detail.resource]+=n;}
  } else if(c.type==='knight') {
    p.knights++;g.phase='robber';
  } else if(c.type==='roadBuilding') {
    g.freeRoads=2;
  } else fail('Unknown card type.');
  p.dev.splice(i,1);g.playedDev=true;event(g,`${p.name} played ${c.type.replace(/([A-Z])/g,' $1')}.`);winCheck(g,p);
}
function skipFreeRoads(g,id){assertTurn(g,id);assert(g.phase==='action'&&g.freeRoads>0,'No free roads to skip.');g.freeRoads=0;}
function tradeBank(g,id,offered,wanted) {
  assertTurn(g,id);assert(g.phase==='action','Finish your current action first.');
  assert(RESOURCES.includes(offered)&&RESOURCES.includes(wanted)&&offered!==wanted,'Choose two different resources.');
  const p=getPlayer(g,id),ratio=portRatio(g,id,offered);assert(p.resources[offered]>=ratio,`You need ${ratio} ${offered}.`);
  assert(g.bank[wanted]>=1,`The bank is out of ${wanted}.`);
  pay(g,p,{[offered]:ratio});grant(g,p,wanted,1);event(g,`${p.name} traded ${ratio} ${offered} for 1 ${wanted} with the bank.`);
}
function portRatio(g,id,resource){let ratio=4;for(const e of Object.values(g.board.edges))if(e.port && (g.board.vertices[e.a].owner===id||g.board.vertices[e.b].owner===id)){
  if(e.port.type==='any')ratio=Math.min(ratio,3);if(e.port.type===resource)ratio=2;
}return ratio;}
function offerTrade(g,id,action) {
  assertTurn(g,id);assert(g.phase==='action','Finish your current action first.');assert(!g.trade,'Resolve or cancel the current offer first.');
  resourcesValid(action.give);resourcesValid(action.want);
  const p=getPlayer(g,id);assert(canAfford(p,action.give),'You do not have the offered resources.');
  const target=action.to||null;assert(target===null||g.players.some(x=>x.id===target&&x.id!==id),'Choose another player.');
  g.trade={id:randomUUID(),from:id,to:target,give:trimResourceObj(action.give),want:trimResourceObj(action.want)};
  event(g,`${p.name} proposed a trade${target?' to '+getPlayer(g,target).name:''}.`);
}
function acceptTrade(g,id){assert(g.mode==='playing'&&g.phase==='action'&&g.trade,'No trade to accept.');
  const offer=g.trade;assert(id!==offer.from&&(!offer.to||offer.to===id),'That trade is not for you.');
  const buyer=getPlayer(g,id),seller=getPlayer(g,offer.from);
  assert(canAfford(seller,offer.give),'Offerer no longer has the offered resources.');assert(canAfford(buyer,offer.want),'You do not have the requested resources.');
  for(const r of RESOURCES){seller.resources[r]-=offer.give[r];buyer.resources[r]+=offer.give[r];buyer.resources[r]-=offer.want[r];seller.resources[r]+=offer.want[r];}
  g.trade=null;event(g,`${buyer.name} accepted ${seller.name}'s trade.`);
}
function cancelTrade(g,id){assert(g.trade,'There is no active trade.');assert(g.trade.from===id||g.trade.to===id,'Only the offerer or addressee can cancel this trade.');const p=getPlayer(g,id);g.trade=null;event(g,`${p.name} closed the trade offer.`);}
function endTurn(g,id){assertTurn(g,id);assert(g.phase==='action','Resolve your roll or pirate action first.');assert(!g.trade,'Cancel your pending trade first.');assert(g.freeRoads===0,'Place or skip your free roads first.');
  const p=getPlayer(g,id);winCheck(g,p);if(g.mode==='finished')return;
  g.currentIndex=(g.currentIndex+1)%g.players.length;g.turnNumber++;g.phase='roll';g.dice=null;g.playedDev=false;g.freeRoads=0;
  event(g,`It's ${current(g).name}'s turn.`);
}
function perform(g,id,a) {
  assert(a&&typeof a==='object','Invalid action.');
  if(a.type==='start')start(g,id);
  else if(a.type==='setup')setupBuild(g,id,a);
  else if(a.type==='roll')roll(g,id);
  else if(a.type==='build')build(g,id,a);
  else if(a.type==='endTurn')endTurn(g,id);
  else if(a.type==='discard')discard(g,id,a.cards);
  else if(a.type==='moveRobber')moveRobber(g,id,a.tile);
  else if(a.type==='steal')steal(g,id,a.victim);
  else if(a.type==='buyDev')buyDev(g,id);
  else if(a.type==='playDev')playDev(g,id,a.cardId,a.detail);
  else if(a.type==='skipFreeRoads')skipFreeRoads(g,id);
  else if(a.type==='tradeBank')tradeBank(g,id,a.give,a.want);
  else if(a.type==='offerTrade')offerTrade(g,id,a);
  else if(a.type==='acceptTrade')acceptTrade(g,id);
  else if(a.type==='cancelTrade')cancelTrade(g,id);
  else fail('Unknown action.');
}
function view(g,id,onlineIds=[]) {
  const player=getPlayer(g,id);const online=new Set(onlineIds);
  const owner=g.mode==='setup'?g.setupQueue[g.setupIndex]:current(g)?.id;
  const playerTurn=(g.mode==='setup'||g.mode==='playing') && owner===id;
  const legal={settlements:legalSettlements(g,id),roads:legalRoads(g,id),cities:legalCities(g,id),robberTiles:[],stealTargets:[]};
  if(g.mode==='playing'&&g.phase==='robber'&&playerTurn)legal.robberTiles=g.board.tiles.filter(t=>t.id!==g.robberTile).map(t=>t.id);
  if(g.mode==='playing'&&g.phase==='steal'&&playerTurn)legal.stealTargets=g.stealTargets;
  return {code:g.code,host:g.host,you:id, mode:g.mode, phase:g.phase, setupStage:g.setupStage, setupIndex:g.setupIndex, setupTotal:g.setupQueue.length,
    current:owner,turnNumber:g.turnNumber,dice:g.dice,board:g.board,robberTile:g.robberTile,
    pendingDiscards:g.pendingDiscards,stealTargets:g.phase==='steal'&&playerTurn?g.stealTargets:[],
    bank:g.bank,trade:g.trade,deckRemaining:g.deck.length, playedDev:g.playedDev, freeRoads:g.freeRoads,
    longestRoadOwner:g.longestRoadOwner,largestArmyOwner:g.largestArmyOwner,longestRoadLength:g.longestRoadLength,
    victoryTarget:VICTORY_TARGET,winner:g.winner,history:g.history.slice(-100), legal,
    players:g.players.map(p=>({id:p.id,name:p.name,color:p.color,online:online.has(p.id),roads:p.roads,settlements:p.settlements,cities:p.cities,knights:p.knights,
      cardCount:sum(p.resources),devCount:p.dev.length,score:points(g,p,false),actualScore:p.id===id?points(g,p,true):undefined})),
    hand:player.resources, devHand:player.dev, ratios:Object.fromEntries(RESOURCES.map(r=>[r,portRatio(g,id,r)]))};
}
module.exports={RESOURCES,COSTS,MAX_PLAYERS,VICTORY_TARGET,createGame,joinPlayer,getPlayer,perform,view,legalRoads,legalSettlements,legalCities,points,roadLength,portRatio,event};
