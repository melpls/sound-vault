const list = document.querySelector("#sound-list");
const search = document.querySelector("#search");
const count = document.querySelector("#count");
let sounds = [];
async function load(){const res=await fetch("/api/sounds"); sounds=await res.json(); render();}
function render(){const q=search.value.trim().toLowerCase();const filtered=sounds.filter(s=>(s.title+" "+s.artist).toLowerCase().includes(q));count.textContent=`${filtered.length} SOUNDS`;if(!filtered.length){list.innerHTML=`<div class="empty">등록된 곡이 없습니다.</div>`;return;}list.innerHTML=filtered.map(s=>`<article class="song-card"><div class="cover">${s.coverUrl?`<img src="${s.coverUrl}" alt="">`:`<span>♪</span>`}</div><div class="song-body"><div class="song-title">${escapeHtml(s.title)}</div><div class="artist">made by ${escapeHtml(s.artist)}</div><div class="share">Share <b class="${s.allowDownload?'yes':'no'}">${s.allowDownload?'O':'X'}</b></div><audio controls preload="none" src="${s.audioUrl}"></audio><div class="actions"><a class="download ${s.allowDownload?'':'disabled'}" href="${s.allowDownload?`/api/sounds/${s.id}/download`:'#'}" ${s.allowDownload?'download':''}>DOWNLOAD</a><button class="lyrics-btn" data-id="${s.id}">Lyrics</button></div><div class="lyrics hidden" id="lyrics-${s.id}">${s.lyrics?escapeHtml(s.lyrics).replace(/\n/g,"<br>"):"가사가 없습니다."}</div></div></article>`).join("");}
function escapeHtml(v){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;", "'":"&#039;"}[c]));}
search.addEventListener("input",render);
list.addEventListener("click",e=>{const b=e.target.closest(".lyrics-btn");if(!b)return;document.querySelector(`#lyrics-${b.dataset.id}`).classList.toggle("hidden");});
load();
