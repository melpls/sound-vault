const loginBox=document.querySelector('#login-box'),panel=document.querySelector('#panel'),password=document.querySelector('#password'),login=document.querySelector('#login'),loginMsg=document.querySelector('#login-msg'),adminList=document.querySelector('#admin-list'),usersList=document.querySelector('#users-list');
async function check(){const r=await fetch('/api/admin/me');const d=await r.json();if(d.admin)show();}
function show(){loginBox.classList.add('hidden');panel.classList.remove('hidden');load();}
login.onclick=async()=>{const r=await fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:password.value})});const d=await r.json();if(!r.ok){loginMsg.textContent=d.error;return;}show();};
password.onkeydown=e=>{if(e.key==='Enter')login.click();};
document.querySelector('#logout').onclick=async()=>{await fetch('/api/admin/logout',{method:'POST'});location.reload();};
async function load(){const [sr,ur]=await Promise.all([fetch('/api/admin/sounds'),fetch('/api/admin/users')]);const sounds=await sr.json(),users=await ur.json();adminList.innerHTML=sounds.length?sounds.map(s=>`<div class="admin-row"><span>${escapeHtml(s.title)} — made by ${escapeHtml(s.artist)}</span><button class="danger" data-id="${s.id}">삭제</button></div>`).join(''):`<div class="empty">등록된 곡이 없습니다.</div>`;usersList.innerHTML=users.length?users.map(u=>`<div class="admin-row"><span>${escapeHtml(u.nickname)} <small>${escapeHtml(u.email||'')}</small></span><span class="muted">${escapeHtml(u.provider||'')}</span></div>`).join(''):`<div class="empty">회원이 없습니다.</div>`;}
adminList.onclick=async e=>{const b=e.target.closest('.danger');if(!b)return;if(!confirm('삭제할까요?'))return;const r=await fetch(`/api/sounds/${b.dataset.id}`,{method:'DELETE'});if(r.ok)load();};
function escapeHtml(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
check();
