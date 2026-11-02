/* Harborlands Eight — client-side rendering and multiplayer controls. */
'use strict';
let stream=null;
const R=['wood','brick','sheep','wheat','ore'];
const EMOJI={wood:'🌲',brick:'🧱',sheep:'🐑',wheat:'🌾',ore:'⛏️',desert:'🏜️'};
const TERRAIN={wood:'#518475',brick:'#b67869',sheep:'#8fae77',wheat:'#d6b86a',ore:'#8b9ba5',desert:'#d9c7a0'};
const PRICES={road:{wood:1,brick:1},settlement:{wood:1,brick:1,sheep:1,wheat:1},city:{ore:3,wheat:2},development:{sheep:1,wheat:1,ore:1}};
const LABELS={road:'Road',settlement:'Settlement',city:'City',development:'Development card',knight:'Knight',victory:'Victory point',roadBuilding:'Road building',yearPlenty:'Year of plenty',monopoly:'Monopoly'};
let state=null, selection=null, modal=null, connected=false, busy=false, lastPhaseKey='', sessionRoom=null, activeToken=null, drafts={}, openDetails={};
const app=document.getElementById('app'),toastBox=document.getElementById('toast'),modalRoot=document.getElementById('modal-root');
let toastTimer;
function esc(s=''){return String(s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function coins(cost){return R.filter(r=>cost?.[r]).map(r=>`${EMOJI[r]}${cost[r]}`).join(' · ');}
function player(id){return state?.players.find(p=>p.id===id);}
function me(){return player(state?.you);}
function turn(){return state?.current===state?.you;}
function afford(cost){return R.every(r=>(state?.hand[r]||0)>=(cost?.[r]||0));}
function timeOf(t){return new Date(t).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});}
function toast(s,ok=false){toastBox.textContent=s;toastBox.className='toast show'+(ok?' ok':'');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toastBox.classList.remove('show'),3400);}
function getSession(code){try{return JSON.parse(localStorage.getItem('harborlands:'+code)||'null');}catch{return null;}}
function storeSession(r){localStorage.setItem('harborlands:'+r.code,JSON.stringify({token:r.token,id:r.id}));sessionRoom=r.code;activeToken=r.token;history.replaceState({},'',`/?room=${encodeURIComponent(r.code)}`);connectEvents();}
async function api(kind,data={}){
 try {
  const payload = kind==='action' ? {code:sessionRoom,token:activeToken,action:data} :
    kind==='chat' ? {code:sessionRoom,token:activeToken,...data} : data;
  const response=await fetch('/api/'+kind,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const result=await response.json();
  if(!result?.ok)toast(result?.error||'Unable to complete this action.');
  return result;
 }catch(err){toast('Server connection unavailable.');return {ok:false,error:err.message};}
}
function connectEvents(){
 if(stream){stream.close();stream=null;}
 if(!sessionRoom||!activeToken)return;
 connected=false;
 stream=new EventSource(`/events?code=${encodeURIComponent(sessionRoom)}&token=${encodeURIComponent(activeToken)}`);
 stream.addEventListener('open',()=>{connected=true;if(state)render();});
 stream.addEventListener('error',()=>{connected=false;if(state)render();});
 stream.addEventListener('state',e=>{
  const next=JSON.parse(e.data);state=next;const key=[state.mode,state.phase,state.current,state.setupStage,state.turnNumber].join(':');
  if(key!==lastPhaseKey){selection=null;lastPhaseKey=key;}render();
 });
}
async function action(payload){if(busy)return;busy=true;const r=await api('action',payload);busy=false;if(r.ok&&payload.type==='build'&&selection==='city')selection=null;}
async function createRoom(){const name=document.getElementById('host-name')?.value.trim();if(!name){toast('Enter your name.');return;}const r=await api('create',{name});if(r.ok){storeSession(r);toast('Room created — invite your friends.',true);}}
async function joinRoom(){const name=document.getElementById('join-name')?.value.trim()||document.getElementById('host-name')?.value.trim();const code=document.getElementById('join-code')?.value.trim().toUpperCase();if(!code){toast('Enter a six-character room code.');return;}const sess=getSession(code);if(!sess&&!name){toast('Enter your name.');return;}
 const r=await api('join',{code,name,token:sess?.token});if(r.ok){storeSession(r);toast('Joined the island.',true);}
}
const savedRoom=new URLSearchParams(location.search).get('room')?.toUpperCase();
if(savedRoom&&getSession(savedRoom)){
 const previous=getSession(savedRoom);
 api('join',{code:savedRoom,token:previous.token}).then(r=>{if(r.ok)storeSession(r);});
}
function landing(){const invited=new URLSearchParams(location.search).get('room')?.toUpperCase()||'';return `<main class="landing">
<section class="landing-art"><div class="wordmark"><span class="logo">⬡</span><span>HARBORLANDS <span style="color:var(--gold)">EIGHT</span></span></div>
<h1 class="serif">An island.<br/><span>Eight rivals.</span><br/>One legend.</h1>
<p>Gather your crew. Claim the coast. Harvest the land. Trade your way to victory in a real-time, eight-player strategy night.</p>
<div class="hero-metrics"><div><strong>08</strong><span class="small">Players max</span></div><div><strong>37</strong><span class="small">Island hexes</span></div><div><strong>12</strong><span class="small">Points to win</span></div></div>
<svg class="art-island" viewBox="0 0 200 200" aria-hidden="true"><polygon points="100,8 179,53 179,147 100,192 21,147 21,53" fill="#7a9c76" stroke="#ecd29a" stroke-width="9"/><polygon points="100,8 179,53 100,98 21,53" fill="#9eb88a"/><polygon points="100,98 179,53 179,147 100,192" fill="#517e77"/><path d="M100 98V192M100 98L21 53M100 98L179 53" stroke="#e2c48b" stroke-width="6"/><circle cx="100" cy="98" r="21" fill="#f5e5bd"/><text x="100" y="107" font-size="28" text-anchor="middle" fill="#244239">8</text></svg></section>
<section class="landing-actions"><div class="entry-card"><div class="eyebrow">YOUR GAME NIGHT BEGINS HERE</div><h2>Gather at the table.</h2><p>No accounts. No downloads. Just share a link and play from any browser.</p>
<form id="create-form"><label class="field-label" for="host-name">Your name</label><input id="host-name" class="field" maxlength="24" placeholder="e.g. The Harbor Master" autocomplete="nickname"/><button class="btn gold lg full" type="submit">✦ Create a new game</button></form>
<div class="or">OR JOIN A FRIEND</div><form id="join-form"><label class="field-label" for="join-code">Room code</label><div class="join-pair"><input id="join-code" class="field" maxlength="6" value="${esc(invited)}" placeholder="AB12CD" style="text-transform:uppercase;letter-spacing:.15em"/><button type="submit" class="btn">Join room →</button></div><label class="field-label" for="join-name" style="margin-top:9px">Your name (if joining for the first time)</label><input id="join-name" class="field" maxlength="24" placeholder="Your display name" autocomplete="nickname"/></form>
<p class="footnote">Private invite rooms · 2–8 players · Best on desktop, playable on mobile</p></div></section></main>`;}
function scoreboard(){return `<div class="section-heading"><h2>Captains & standings</h2><span class="count">${state.players.length}/8</span></div><div class="players">${state.players.map((p,i)=>`<div class="player ${p.id===state.current&&state.mode!=='lobby'?'active':''} ${p.id===state.you?'me':''} ${!p.online?'player-offline':''}">
  <div class="player-marker" style="background:${p.color}">${i+1}</div><div class="player-meta"><div class="player-name" title="${esc(p.name)}">${esc(p.name)}</div><div class="player-sub">${p.cardCount} cards · ${p.devCount} dev ${p.knights?'· ⚔ '+p.knights:''}${state.longestRoadOwner===p.id?' · 🛣':''}${state.largestArmyOwner===p.id?' · 🏅':''}</div></div><div class="player-score" title="Visible victory points">${p.score}</div>
</div>`).join('')}</div>`;}
function logs(){return `<div class="side-label section-heading"><h2>Harbor dispatches</h2><span class="count">LIVE</span></div><div class="event-log" id="event-log">${state.history.slice(-45).map(e=>{
  const by=player(e.from);return `<div class="log-entry ${e.kind==='chat'?'chat':''}">${e.kind==='chat'?`<span class="log-name">${esc(by?.name||'Player')}:</span> `:''}${esc(e.text)}<div class="small muted" style="font-size:9px;margin-top:2px">${timeOf(e.at)}</div></div>`;
}).join('')}</div><form id="chat-form" class="chat-form"><input class="field" id="chat-input" maxlength="250" placeholder="Send a message…" autocomplete="off" data-draft="chat"/><button class="btn sm" type="submit">➤</button></form>`;}
function rules(){return `<details class="side-label"><summary class="caps">Quick rules & house rules</summary><div class="rules-list"><p>Reach <strong>12 victory points</strong>. Settlements = 1, cities = 2, longest road and largest army = 2 each. Hidden victory cards also count.</p><p><strong>Road</strong> ${coins(PRICES.road)}<br/><strong>Settlement</strong> ${coins(PRICES.settlement)}<br/><strong>City</strong> ${coins(PRICES.city)}<br/><strong>Development</strong> ${coins(PRICES.development)}</p><p>Roll each turn to produce resources. A 7 triggers discards, pirate movement and a possible theft. Trade with rivals or at harbors. Newly bought development cards can't be played until a later turn.</p><p>In this eight-player variant there is no special building phase between other players' turns.</p></div></details>`;}
function lobbyBoard(){return `<div class="lobby-board"><div class="lobby-ring">🏝️</div><div class="eyebrow">YOUR PRIVATE HARBOR</div><h2>Call your crew aboard.</h2><p>Invite up to eight players. Once everyone's here, your randomly generated island is ready for settlement.</p>
<div class="lobby-code">${esc(state.code)}</div><div class="btn-row" style="justify-content:center"><button class="btn gold" data-do="copy">⧉ Copy invite link</button>${state.host===state.you?`<button class="btn mint" data-do="start" ${state.players.length<2?'disabled':''}>▶ Start game</button>`:''}</div>
<div class="waiting-players">${Array.from({length:8},(_,i)=>{const p=state.players[i];return `<div class="wait-person" style="opacity:${p?1:.45}">${p?`<span style="color:${p.color}">⬢</span> ${esc(p.name)}`:`<span>＋</span> Open seat ${i+1}`}</div>`;}).join('')}</div>
<div class="waiting-note">${state.players.length<2?'At least two players required to start.':state.host===state.you?'You can start now, or invite more friends.':'Waiting for the host to begin.'}</div></div>`;}
function svgBoard(){const b=state.board,active=state.mode==='setup'?state.setupStage:(state.mode==='playing'&&state.phase==='robber'&&turn()?'robber':selection);const possible=new Set(active==='road'?state.legal.roads:active==='settlement'?state.legal.settlements:active==='city'?state.legal.cities:active==='robber'?state.legal.robberTiles:[]);
 const hexes=b.tiles.map(t=>{const points=t.vertices.map(vid=>`${b.vertices[vid].x},${b.vertices[vid].y}`).join(' ');const select=active==='robber'&&possible.has(t.id);
 const num=t.number;const dots=num==null?'':Math.min(num,14-num)-1;return `<g><polygon class="hex ${select?'active-target':''}" points="${points}" fill="${TERRAIN[t.resource]}" ${select?`data-do="placePirate" data-id="${t.id}"`:''}/><text class="hex-icon" x="${t.x}" y="${t.y-15}">${EMOJI[t.resource]}</text>${num?`<circle class="hex-number" cx="${t.x}" cy="${t.y+19}" r="19"/><text class="number-text ${num===6||num===8?'number-hot':''}" x="${t.x}" y="${t.y+16}">${num}</text><text class="number-dots" x="${t.x}" y="${t.y+32}">${'•'.repeat(Math.max(1,dots))}</text>`:''}${state.robberTile===t.id?`<text class="robber" x="${t.x+29}" y="${t.y+4}" title="Pirate">🏴‍☠️</text>`:''}</g>`;}).join('');
 const ports=Object.values(b.edges).filter(e=>e.port).map(e=>{const a=b.vertices[e.a],c=b.vertices[e.b],x=(a.x+c.x)/2,y=(a.y+c.y)/2;return `<g><path class="port-line" d="M${x} ${y}L${e.port.x} ${e.port.y}"/><rect class="port-marker" x="${e.port.x-25}" y="${e.port.y-11}" rx="10" width="50" height="22"/><text class="port-label" x="${e.port.x}" y="${e.port.y+3.5}">${e.port.type==='any'?'3:1':EMOJI[e.port.type]+' 2:1'}</text></g>`;}).join('');
 const roads=Object.values(b.edges).filter(e=>e.owner).map(e=>{const a=b.vertices[e.a],c=b.vertices[e.b],p=player(e.owner);return `<g><line x1="${a.x}" y1="${a.y}" x2="${c.x}" y2="${c.y}" stroke="#152434" stroke-width="14" stroke-linecap="round"/><line class="road" x1="${a.x}" y1="${a.y}" x2="${c.x}" y2="${c.y}" stroke="${p?.color||'#fff'}"/></g>`;}).join('');
 const buildings=Object.values(b.vertices).filter(v=>v.owner).map(v=>{const p=player(v.owner);return `<g transform="translate(${v.x},${v.y})">${v.building==='city'?`<rect class="building" x="-10" y="-10" width="20" height="20" rx="2" fill="${p?.color||'#fff'}"/><path d="M-10 -10L0 -19L10 -10" fill="${p?.color}" stroke="#142637" stroke-width="2"/>`:`<path class="building" d="M-9 1L-9 -6L0 -15L9 -6L9 9L-9 9Z" fill="${p?.color||'#fff'}"/>`}</g>`;}).join('');
 let options='';if(active==='road')options=[...possible].map(id=>{const e=b.edges[id],a=b.vertices[e.a],v=b.vertices[e.b];return `<g><line class="available-road" x1="${a.x}" y1="${a.y}" x2="${v.x}" y2="${v.y}"/><line class="road-hit" x1="${a.x}" y1="${a.y}" x2="${v.x}" y2="${v.y}" data-do="placeRoad" data-id="${id}"/></g>`;}).join('');
 if(active==='settlement'||active==='city')options=[...possible].map(id=>{const v=b.vertices[id];return `<circle class="available-vertex" cx="${v.x}" cy="${v.y}" r="${active==='city'?15:12}" data-do="placeVertex" data-id="${id}"/>`;}).join('');
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-370 -345 740 690" class="board-svg" role="img" aria-label="Interactive 37-hex island game board"><defs><radialGradient id="water"><stop stop-color="#326278"/><stop offset="1" stop-color="#143149"/></radialGradient></defs><circle cx="0" cy="0" r="328" fill="url(#water)" stroke="#59849a" stroke-width="1" stroke-dasharray="2 9" opacity=".8"/>${hexes}${ports}${roads}${buildings}${options}</svg>`;}
function boardHint(){if(state.mode==='setup')return turn()?`Choose a glowing ${state.setupStage==='settlement'?'intersection to place your settlement':'edge to connect a road'}.`:`Waiting for ${esc(player(state.current)?.name)} to place a ${state.setupStage}.`;
 if(state.mode==='finished')return `The island belongs to ${esc(player(state.winner)?.name)}!`;
 if(state.phase==='discard')return state.pendingDiscards[state.you]?'Discard your required resource cards to continue.':'Waiting for everyone to discard after the 7.';
 if(!turn())return `Waiting for ${esc(player(state.current)?.name)} to finish their turn.`;
 if(state.phase==='robber')return 'Select any glowing terrain tile to move the pirate.';
 if(state.phase==='steal')return 'Choose a player whose resource card you want to steal.';
 if(state.phase==='roll')return 'Roll the dice to begin your turn.';
 if(selection)return `Choose a glowing ${selection==='road'?'edge':'intersection'} to build your ${selection}.`;
 if(state.freeRoads)return `You have ${state.freeRoads} free road(s) to place.`;
 return 'Build, trade, play a card or end your turn. Click a build action to highlight valid locations.';
}
function centerBoard(){if(state.mode==='lobby')return lobbyBoard();const active=player(state.current);return `<div class="board-top"><div><div class="eyebrow">${state.mode==='finished'?'GAME COMPLETE':`ROUND ${Math.floor((state.turnNumber-1)/state.players.length)+1} · TURN ${state.turnNumber}`}</div><h2>${state.mode==='finished'?'Victory on the high seas': 'The Great Island'}</h2></div><div class="turn-badge">${state.mode==='finished'?'🏆 CHAMPION':turn()?'✦ YOUR TURN':'NOW PLAYING'}<b style="color:${active?.color||'var(--gold)'}">${esc(state.mode==='finished'?player(state.winner)?.name:active?.name||'')}</b></div></div><div class="board-container">${svgBoard()}</div><div class="board-footer"><span class="hint">${boardHint()}</span>${selection?`<button class="btn sm ghost" data-do="clearSelection">✕ Cancel placement</button>`:''}</div>`;}
function actionPanel(){if(state.mode==='lobby')return `<div class="panel gold-tint"><div class="caps">Gather your party</div><h3 class="phase-head">Waiting at the harbor</h3><p class="phase-text">Send your invite link to friends. The host can start when two or more have joined.</p><button class="btn gold full" data-do="copy">⧉ Copy invite link</button></div>`;
 if(state.mode==='finished')return `<div class="panel gold-tint"><div class="caps">The final result</div><h3 class="phase-head">🏆 ${esc(player(state.winner)?.name)} wins!</h3><p class="phase-text">Final victory points: ${state.players.find(p=>p.id===state.winner)?.actualScore??'12+'}. Refreshing will preserve the completed game.</p></div>`;
 if(state.mode==='setup')return `<div class="panel gold-tint"><div class="caps">Opening placements · ${state.setupIndex+1}/${state.setupTotal}</div><h3 class="phase-head">${turn()?'Place your '+state.setupStage:'The island is taking shape'}</h3><p class="phase-text">${turn()?'Select a highlighted position on the island. Starting buildings are free.':'Waiting for '+esc(player(state.current)?.name)+' to place their '+state.setupStage+'.'}<br/>The second settlement provides starting resources.</p></div>`;
 if(state.phase==='discard'){
 const required=state.pendingDiscards[state.you];if(!required)return `<div class="panel gold-tint"><h3 class="phase-head">A seven was rolled!</h3><p class="phase-text">Players holding more than seven resource cards are discarding half. The pirate moves afterward.</p></div>`;
 return `<div class="panel gold-tint"><div class="eyebrow">THE PIRATE STRIKES</div><h3 class="phase-head">Discard ${required} cards</h3><p class="phase-text">Choose exactly ${required} resource cards to return to the bank.</p><form id="discard-form">${R.map(r=>`<div class="trade-res"><span>${EMOJI[r]} ${r} (${state.hand[r]})</span><input type="number" min="0" max="${state.hand[r]}" value="${esc(drafts['discard-'+r]||'0')}" data-draft="discard-${r}"/></div>`).join('')}<button class="btn gold full" type="submit">Discard selected cards</button></form></div>`;
 }
 if(state.phase==='steal'&&turn())return `<div class="panel gold-tint"><div class="eyebrow">PIRATE'S BOUNTY</div><h3 class="phase-head">Steal a resource</h3><p class="phase-text">Choose one eligible player. One card is selected at random.</p>${state.legal.stealTargets.map(id=>`<button class="btn full" style="margin-top:7px" data-do="steal" data-id="${id}"><span style="color:${player(id).color}">⬢</span> ${esc(player(id).name)} (${player(id).cardCount} cards)</button>`).join('')}</div>`;
 if(state.phase==='robber')return `<div class="panel gold-tint"><div class="eyebrow">PIRATE'S TURN</div><h3 class="phase-head">${turn()?'Move the pirate':'Waiting for the pirate'}</h3><p class="phase-text">${turn()?'Click a glowing hex to block its resource production. You may then steal from a neighboring player.':'The current player is moving the pirate.'}</p></div>`;
 if(state.phase==='roll')return `<div class="panel gold-tint"><div class="caps">${turn()?'You lead this turn':'Awaiting the dice'}</div><h3 class="phase-head">${turn()?'Fortune favors the bold.':'Waiting for '+esc(player(state.current)?.name)}</h3><p class="phase-text">Roll two dice to produce resources for every settlement and city on matching numbered hexes.</p>${turn()?'<button class="btn gold lg full" data-do="roll">🎲 Roll the dice</button>':'<span class="status-pill">Waiting for roll</span>'}</div>`;
 return `<div class="panel gold-tint"><div class="caps">${turn()?'Your move':'An opponent’s turn'}</div><h3 class="phase-head">${turn()?'Shape your empire':'Watch the coastlines'}</h3>${state.dice?`<div class="dice-pair"><span class="die">${state.dice[0]}</span><span class="die">${state.dice[1]}</span><span class="dice-total">=${state.dice[0]+state.dice[1]}</span></div>`:''}<p class="phase-text">${turn()?'Trade, claim territory, or use a development card.':'You can respond to player trade offers while another player is active.'}</p>${turn()?`<button class="btn gold full" data-do="endTurn" ${state.trade||state.freeRoads?'disabled':''}>End turn →</button>`:''}</div>`;
}
function handPanel(){return `<div class="panel"><div class="panel-heading"><h3>Your resources</h3><span class="status-pill">${Object.values(state.hand).reduce((a,b)=>a+b,0)} cards</span></div><div class="res-grid">${R.map(r=>`<div class="res-card"><span class="emoji">${EMOJI[r]}</span><strong>${state.hand[r]}</strong><span>${r}</span></div>`).join('')}</div><div class="note" style="margin-top:10px">Your actual victory score: <strong style="color:var(--gold)">${me()?.actualScore||0} / ${state.victoryTarget}</strong>${me()?.actualScore!==me()?.score?' (includes secret points)':''}</div></div>`;}
function buildPanel(){if(state.mode!=='playing')return '';const enabled=turn()&&state.phase==='action';const rows=['road','settlement','city'];return `<div class="panel"><div class="panel-heading"><h3>Build & expand</h3><span class="caps">${state.freeRoads?'FREE ROADS: '+state.freeRoads:'STRUCTURES'}</span></div>
${rows.map(r=>{const available=state.legal[r==='road'?'roads':r==='city'?'cities':'settlements'].length;const can=enabled&&available>0;return `<div class="build-option ${selection===r?'selected':''}"><div><div class="build-name">${r==='road'?'🛣':r==='settlement'?'⌂':'♜'} ${LABELS[r]} <span class="muted">${available?'· '+available+' spots':''}</span></div><div class="build-cost">${state.freeRoads&&r==='road'?'Free development roads':coins(PRICES[r])}</div></div><button class="btn sm ${selection===r?'gold':''}" data-do="chooseBuild" data-kind="${r}" ${!can?'disabled':''}>${selection===r?'Selecting':'Place'}</button></div>`;}).join('')}
<div class="build-option"><div><div class="build-name">✦ Development card</div><div class="build-cost">${coins(PRICES.development)} · ${state.deckRemaining} left</div></div><button class="btn sm" data-do="buyDev" ${!enabled||!afford(PRICES.development)||state.deckRemaining===0?'disabled':''}>Buy</button></div>
${state.freeRoads&&enabled?`<button class="btn sm full ghost" data-do="skipRoads">Skip remaining free road(s)</button>`:''}</div>`;}
function developmentPanel(){if(!state.devHand.length)return '';const enable=state.mode==='playing'&&state.phase==='action'&&turn()&&!state.playedDev;
 return `<div class="panel"><div class="panel-heading"><h3>Development cards</h3><span class="count">${state.devHand.length} owned</span></div>${state.devHand.map(c=>`<div class="dev-card"><div><div class="dev-name">${c.type==='victory'?'🏆':c.type==='knight'?'⚔':'✦'} ${LABELS[c.type]}</div><div class="note">${c.type==='victory'?'Secret point · always active':c.boughtTurn===state.turnNumber?'Available on a later turn':'Ready to play'}</div></div>${c.type==='victory'?'<span class="status-pill">+1 VP</span>':`<button class="btn sm" data-do="playDev" data-id="${esc(c.id)}" ${!enable||c.boughtTurn>=state.turnNumber?'disabled':''}>Play</button>`}</div>`).join('')}</div>`;}
function tokens(obj){return `<span class="token-list">${R.filter(r=>obj?.[r]).map(r=>`<span class="res-token">${EMOJI[r]} ${obj[r]}</span>`).join('')||'<span class="muted">None</span>'}</span>`;}
function tradePanel(){if(state.mode!=='playing'||state.mode==='finished')return '';const open=state.phase==='action',enable=turn()&&open;let tradeHtml='';
 if(state.trade){const tr=state.trade,p=player(tr.from),canAccept=state.you!==tr.from&&(!tr.to||tr.to===state.you)&&open;tradeHtml=`<div class="trade-offer"><div class="mini-label">OPEN PLAYER OFFER</div><b>${esc(p?.name)} offers:</b><div style="margin:9px 0">${tokens(tr.give)}</div><div class="mini-label">IN EXCHANGE FOR</div><div style="margin:9px 0">${tokens(tr.want)}</div>${tr.to?`<div class="note">For ${esc(player(tr.to)?.name)}</div>`:'<div class="note">Open to any player</div>'}<div class="btn-row" style="margin-top:10px">${canAccept?'<button class="btn mint sm" data-do="acceptTrade">Accept offer</button>':''}${tr.from===state.you||tr.to===state.you?'<button class="btn sm ghost" data-do="cancelTrade">Close offer</button>':''}</div></div>`;}
 return `<div class="panel"><div class="panel-heading"><h3>Trading post</h3><span class="caps">MAKE A DEAL</span></div>${tradeHtml}<details id="bank-details"><summary class="small" style="font-weight:800;color:var(--gold);padding:7px 0">⚖ Trade with the bank / harbors</summary><div style="padding-top:10px"><div class="form-row"><select class="field" id="bank-give" data-draft="bank-give">${R.map(r=>`<option value="${r}">${EMOJI[r]} ${r} (${state.ratios[r]}:1)</option>`).join('')}</select><span style="flex:0">→</span><select class="field" id="bank-want" data-draft="bank-want">${R.map((r,i)=>`<option value="${r}" ${i===1?'selected':''}>${EMOJI[r]} ${r}</option>`).join('')}</select></div><button class="btn sm full" style="margin-top:9px" data-do="bankTrade" ${!enable?'disabled':''}>Exchange with bank</button><div class="note" style="margin-top:5px">Harbor ratios automatically apply when you occupy a port.</div></div></details>
<details id="player-trade-details"><summary class="small" style="font-weight:800;color:var(--gold);padding:7px 0">🤝 Propose a player trade</summary><div style="padding-top:7px"><label class="field-label" for="trade-target">Offer to</label><select class="field" id="trade-target" data-draft="trade-target"><option value="">Any player</option>${state.players.filter(p=>p.id!==state.you).map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select><div class="trade-grid" style="margin-top:13px"><div><div class="mini-label">YOU GIVE</div>${R.map(r=>`<div class="trade-res"><span>${EMOJI[r]} ${r}</span><input type="number" min="0" max="35" value="${esc(drafts['give-'+r]||'0')}" data-draft="give-${r}"/></div>`).join('')}</div><div><div class="mini-label">YOU WANT</div>${R.map(r=>`<div class="trade-res"><span>${EMOJI[r]} ${r}</span><input type="number" min="0" max="35" value="${esc(drafts['want-'+r]||'0')}" data-draft="want-${r}"/></div>`).join('')}</div></div><button class="btn sm full" data-do="offerTrade" ${!enable||state.trade?'disabled':''}>Send trade offer</button></div></details>
</div>`;}
function fullGame(){return `<main class="game">${!connected?'<div class="disconnected-banner">Connection lost. Reconnecting automatically…</div>':''}<header class="topbar"><div class="wordmark"><span class="logo">⬡</span><span>HARBORLANDS <span style="color:var(--gold)">EIGHT</span></span></div><div class="topbar-center"><div class="room-chip">ROOM <b>${esc(state.code)}</b></div><button class="btn sm" data-do="copy">⧉ Invite</button></div><div class="connected"><span class="dot ${connected?'':'off'}"></span>${connected?'All systems live':'Reconnecting'}</div></header>
<div class="app-layout"><aside class="sidebar">${scoreboard()}${logs()}${rules()}</aside><section class="center">${centerBoard()}</section><aside class="rightbar">${actionPanel()}${handPanel()}${buildPanel()}${developmentPanel()}${tradePanel()}</aside></div></main>`;}
function render(){const activeId=document.activeElement?.id;let caret=null;try{if(activeId&&document.activeElement?.selectionStart!=null)caret=document.activeElement.selectionStart;}catch{};
 document.querySelectorAll('[data-draft]').forEach(el=>{drafts[el.dataset.draft]=el.value;});
 document.querySelectorAll('details[id]').forEach(el=>{openDetails[el.id]=el.open;});
 app.innerHTML=state?fullGame():landing();
 document.querySelectorAll('details[id]').forEach(el=>{if(openDetails[el.id]!=null)el.open=openDetails[el.id];});
 document.querySelectorAll('[data-draft]').forEach(el=>{if(drafts[el.dataset.draft]!=null)el.value=drafts[el.dataset.draft];});
 if(activeId&&document.getElementById(activeId)){const f=document.getElementById(activeId);f.focus({preventScroll:true});try{if(caret!==null)f.setSelectionRange(caret,caret);}catch{}}
 const log=document.getElementById('event-log');if(log)log.scrollTop=log.scrollHeight;
 renderModal();
}
function chooseBuild(kind){selection=selection===kind?null:kind;render();}
function makeResources(prefix){return Object.fromEntries(R.map(r=>[r,Number(document.querySelector(`[data-draft="${prefix}-${r}"]`)?.value||0)]));}
function showModalForCard(c){modal={cardId:c.id,kind:c.type};renderModal();}
function renderModal(){if(!modal){modalRoot.innerHTML='';return;}const c=modal;
 let body='';if(c.kind==='monopoly')body=`<p>Claim every opponent's cards of the selected resource.</p><label class="field-label">Resource to monopolize</label><select class="field" id="modal-resource">${R.map(r=>`<option value="${r}">${EMOJI[r]} ${r}</option>`).join('')}</select>`;
 if(c.kind==='yearPlenty')body=`<p>Take any two resource cards from the bank (while stocks last).</p><label class="field-label">First resource</label><select class="field" id="modal-resource1">${R.map(r=>`<option value="${r}">${EMOJI[r]} ${r} (${state.bank[r]} left)</option>`).join('')}</select><label class="field-label">Second resource</label><select class="field" id="modal-resource2">${R.map((r,i)=>`<option value="${r}" ${i===1?'selected':''}>${EMOJI[r]} ${r} (${state.bank[r]} left)</option>`).join('')}</select>`;
 modalRoot.innerHTML=`<div class="modal-backdrop" id="modal-overlay"><section class="modal"><h2>${esc(LABELS[c.kind]||'Development card')}</h2>${body}<div class="modal-actions"><button class="btn ghost" data-do="closeModal">Cancel</button><button class="btn gold" data-do="confirmModal">Play card</button></div></section></div>`;
}
function copyInvite(){const link=location.origin+'/?room='+encodeURIComponent(state.code);if(navigator.clipboard?.writeText)navigator.clipboard.writeText(link).then(()=>toast('Invite link copied!',true)).catch(()=>window.prompt('Copy this invite link:',link));else window.prompt('Copy this invite link:',link);}
async function doClick(el){const op=el.dataset.do,id=el.dataset.id;
 if(op==='copy')return copyInvite();
 if(op==='start')return action({type:'start'});
 if(op==='roll')return action({type:'roll'});
 if(op==='endTurn')return action({type:'endTurn'});
 if(op==='chooseBuild')return chooseBuild(el.dataset.kind);
 if(op==='clearSelection'){selection=null;return render();}
 if(op==='placeRoad')return action(state.mode==='setup'?{type:'setup',kind:'road',at:id}:{type:'build',kind:'road',at:id});
 if(op==='placeVertex'){const kind=state.mode==='setup'?'settlement':selection;return action(state.mode==='setup'?{type:'setup',kind,at:id}:{type:'build',kind,at:id});}
 if(op==='placePirate')return action({type:'moveRobber',tile:id});
 if(op==='steal')return action({type:'steal',victim:id});
 if(op==='buyDev')return action({type:'buyDev'});
 if(op==='skipRoads'){selection=null;return action({type:'skipFreeRoads'});}
 if(op==='bankTrade')return action({type:'tradeBank',give:document.getElementById('bank-give').value,want:document.getElementById('bank-want').value});
 if(op==='offerTrade'){const give=makeResources('give'),want=makeResources('want'),to=document.getElementById('trade-target').value||null;
   const resp=await api('action',{type:'offerTrade',give,want,to});if(resp.ok){for(const r of R){drafts['give-'+r]='0';drafts['want-'+r]='0';}render();}return;}
 if(op==='acceptTrade')return action({type:'acceptTrade'});
 if(op==='cancelTrade')return action({type:'cancelTrade'});
 if(op==='playDev'){const c=state.devHand.find(c=>c.id===id);if(!c)return;if(c.type==='yearPlenty'||c.type==='monopoly')return showModalForCard(c);return action({type:'playDev',cardId:id});}
 if(op==='closeModal'){modal=null;return renderModal();}
 if(op==='confirmModal'){const detail=modal.kind==='monopoly'?{resource:document.getElementById('modal-resource').value}: {resources:[document.getElementById('modal-resource1').value,document.getElementById('modal-resource2').value]};const cardId=modal.cardId;const reply=await api('action',{type:'playDev',cardId,detail});if(reply.ok){modal=null;renderModal();}return;}
}
document.addEventListener('click',e=>{const el=e.target.closest('[data-do]');if(el&&!el.disabled){e.preventDefault();doClick(el);}});
document.addEventListener('submit',async e=>{
 if(e.target.id==='create-form'){e.preventDefault();return createRoom();}
 if(e.target.id==='join-form'){e.preventDefault();return joinRoom();}
 if(e.target.id==='chat-form'){e.preventDefault();const input=document.getElementById('chat-input'),text=input?.value.trim();if(!text)return;const r=await api('chat',{text});if(r.ok){drafts.chat='';input.value='';}return;}
 if(e.target.id==='discard-form'){e.preventDefault();const cards=makeResources('discard');const reply=await api('action',{type:'discard',cards});if(reply.ok){for(const r of R)drafts['discard-'+r]='0';}return;}
});
document.addEventListener('input',e=>{if(e.target.dataset?.draft)drafts[e.target.dataset.draft]=e.target.value;});
render();
