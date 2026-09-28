const list = document.querySelector("#sound-list");
const search = document.querySelector("#search");
const count = document.querySelector("#count");
let sounds = [];

async function load() {
  const res = await fetch("/api/sounds");
  sounds = await res.json();
  render();
}

function render() {
  const q = search.value.trim().toLowerCase();
  const filtered = sounds.filter(s => s.name.toLowerCase().includes(q));
  count.textContent = `${filtered.length} SOUNDS`;

  if (!filtered.length) {
    list.innerHTML = `<div class="empty">등록된 사운드가 없습니다.</div>`;
    return;
  }

  list.innerHTML = filtered.map((s, i) => `
    <article class="sound-card">
      <button class="play" data-index="${i}">▶</button>
      <div class="sound-main">
        <strong>${escapeHtml(s.name)}</strong>
        <span>ARCHIVE / AUDIO</span>
      </div>
      <audio controls preload="none" src="${s.url}"></audio>
      <a class="download" href="${s.url}" download>↓</a>
    </article>
  `).join("");
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
  }[c]));
}

search.addEventListener("input", render);

list.addEventListener("click", e => {
  const btn = e.target.closest(".play");
  if (!btn) return;
  const card = btn.closest(".sound-card");
  const audio = card.querySelector("audio");

  document.querySelectorAll("audio").forEach(a => {
    if (a !== audio) a.pause();
  });

  if (audio.paused) {
    audio.play();
    btn.textContent = "Ⅱ";
  } else {
    audio.pause();
    btn.textContent = "▶";
  }

  audio.onended = () => btn.textContent = "▶";
});

load();