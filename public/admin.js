const loginBox = document.querySelector("#login-box");
const panel = document.querySelector("#panel");
const password = document.querySelector("#password");
const login = document.querySelector("#login");
const loginMsg = document.querySelector("#login-msg");
const uploadForm = document.querySelector("#upload-form");
const file = document.querySelector("#file");
const uploadMsg = document.querySelector("#upload-msg");
const adminList = document.querySelector("#admin-list");
const logout = document.querySelector("#logout");

async function check() {
  const res = await fetch("/api/me");
  const data = await res.json();
  if (data.admin) showPanel();
}

function showPanel() {
  loginBox.classList.add("hidden");
  panel.classList.remove("hidden");
  loadSounds();
}

login.addEventListener("click", async () => {
  loginMsg.textContent = "";
  const res = await fetch("/api/login", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ password: password.value })
  });
  const data = await res.json();

  if (!res.ok) {
    loginMsg.textContent = data.error || "로그인 실패";
    return;
  }

  showPanel();
});

password.addEventListener("keydown", e => {
  if (e.key === "Enter") login.click();
});

uploadForm.addEventListener("submit", async e => {
  e.preventDefault();
  if (!file.files[0]) return;

  const form = new FormData();
  form.append("sound", file.files[0]);

  uploadMsg.textContent = "업로드 중...";
  const res = await fetch("/api/upload", { method: "POST", body: form });
  const data = await res.json();

  uploadMsg.textContent = res.ok ? "업로드 완료!" : (data.error || "업로드 실패");
  if (res.ok) {
    uploadForm.reset();
    loadSounds();
  }
});

logout.addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  location.reload();
});

async function loadSounds() {
  const res = await fetch("/api/sounds");
  const sounds = await res.json();

  if (!sounds.length) {
    adminList.innerHTML = `<div class="empty">등록된 사운드가 없습니다.</div>`;
    return;
  }

  adminList.innerHTML = sounds.map(s => `
    <div class="admin-row">
      <span>${escapeHtml(s.name)}</span>
      <button class="danger" data-name="${encodeURIComponent(s.name)}">삭제</button>
    </div>
  `).join("");
}

adminList.addEventListener("click", async e => {
  const btn = e.target.closest(".danger");
  if (!btn) return;

  if (!confirm("이 사운드를 삭제할까요?")) return;

  const res = await fetch(`/api/sounds/${btn.dataset.name}`, { method: "DELETE" });
  if (res.ok) loadSounds();
});

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
  }[c]));
}

check();