require("dotenv").config();

const express = require("express");
const session = require("express-session");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const SESSION_SECRET = process.env.SESSION_SECRET;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || `${BASE_URL}/auth/google/callback`;

if (!SESSION_SECRET) {
  console.error("ERROR: SESSION_SECRET을 설정하세요.");
  process.exit(1);
}

const publicDir = path.join(__dirname, "public");
const soundsDir = path.join(__dirname, "sounds");
const coversDir = path.join(__dirname, "covers");
const dataDir = path.join(__dirname, "data");
const dbFile = path.join(dataDir, "database.json");

for (const dir of [soundsDir, coversDir, dataDir]) fs.mkdirSync(dir, { recursive: true });
if (!fs.existsSync(dbFile)) fs.writeFileSync(dbFile, JSON.stringify({ users: [], songs: [] }, null, 2));

function readDb() {
  try {
    return JSON.parse(fs.readFileSync(dbFile, "utf8"));
  } catch {
    return { users: [], songs: [] };
  }
}
function writeDb(db) {
  const tmp = `${dbFile}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, dbFile);
}
function id() { return crypto.randomUUID(); }
function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}
function verifyPassword(password, user) {
  const hash = crypto.scryptSync(password, user.salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(user.passwordHash, "hex"));
}
function safeName(name) {
  return path.basename(name).replace(/[^\w가-힣 .()-]/g, "_").replace(/\s+/g, " ").trim();
}
function userFromSession(req) {
  if (!req.session.userId) return null;
  return readDb().users.find(u => u.id === req.session.userId) || null;
}
function publicUser(user) {
  return user ? { id: user.id, nickname: user.nickname, email: user.email, provider: user.provider } : null;
}
function requireUser(req, res, next) {
  const user = userFromSession(req);
  if (!user) return res.status(401).json({ error: "로그인이 필요합니다." });
  req.user = user;
  next();
}
function requireAdmin(req, res, next) {
  if (req.session.admin) return next();
  res.status(401).json({ error: "관리자 인증이 필요합니다." });
}
function songView(song) {
  return {
    id: song.id,
    title: song.title,
    artist: song.artist,
    userId: song.userId,
    audioUrl: `/api/sounds/${song.id}/stream`,
    coverUrl: song.coverFile ? `/api/sounds/${song.id}/cover` : null,
    allowDownload: !!song.allowDownload,
    lyrics: song.lyrics || "",
    createdAt: song.createdAt
  };
}

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: "auto", maxAge: 1000 * 60 * 60 * 24 * 7 }
}));
app.use(express.static(publicDir));

const audioStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, soundsDir),
  filename: (_req, file, cb) => cb(null, `${id()}-${safeName(file.originalname)}`)
});
const coverStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, coversDir),
  filename: (_req, file, cb) => cb(null, `${id()}-${safeName(file.originalname)}`)
});
const audioUpload = multer({
  storage: audioStorage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(/\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(file.originalname) ? null : new Error("지원하지 않는 오디오 형식입니다."))
});
const coverUpload = multer({
  storage: coverStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype) ? null : new Error("JPG, PNG, WEBP, GIF 이미지만 사용할 수 있습니다."))
});
const songUpload = multer({ storage: multer.diskStorage({
  destination: (_req, file, cb) => cb(null, file.fieldname === "cover" ? coversDir : soundsDir),
  filename: (_req, file, cb) => cb(null, `${id()}-${safeName(file.originalname)}`)
}), limits: { files: 2, fileSize: 100 * 1024 * 1024 }, fileFilter: (_req, file, cb) => {
  if (file.fieldname === "sound") return cb(/\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(file.originalname) ? null : new Error("지원하지 않는 오디오 형식입니다."));
  if (file.fieldname === "cover") return cb(/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype) ? null : new Error("JPG, PNG, WEBP, GIF 이미지만 사용할 수 있습니다."));
  cb(new Error("알 수 없는 파일입니다."));
}});

// ---------- Authentication ----------
app.get("/api/config", (_req, res) => res.json({ googleEnabled: !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) }));

app.post("/api/register", (req, res) => {
  const { email, password, nickname } = req.body || {};
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "올바른 이메일을 입력하세요." });
  if (typeof password !== "string" || password.length < 8) return res.status(400).json({ error: "비밀번호는 8자 이상이어야 합니다." });
  if (typeof nickname !== "string" || nickname.trim().length < 2 || nickname.trim().length > 30) return res.status(400).json({ error: "닉네임은 2~30자로 입력하세요." });

  const db = readDb();
  if (db.users.some(u => u.email.toLowerCase() === email.toLowerCase())) return res.status(409).json({ error: "이미 가입된 이메일입니다." });
  if (db.users.some(u => u.nickname.toLowerCase() === nickname.trim().toLowerCase())) return res.status(409).json({ error: "이미 사용 중인 닉네임입니다." });

  const hp = hashPassword(password);
  const user = { id: id(), email: email.toLowerCase(), nickname: nickname.trim(), provider: "local", passwordHash: hp.hash, salt: hp.salt, createdAt: new Date().toISOString() };
  db.users.push(user);
  writeDb(db);
  req.session.userId = user.id;
  res.json({ ok: true, user: publicUser(user) });
});

app.post("/api/login", (req, res) => {
  const { email, password } = req.body || {};
  const db = readDb();
  const user = db.users.find(u => u.email === String(email || "").toLowerCase());
  if (!user || !user.passwordHash || !verifyPassword(String(password || ""), user)) return res.status(401).json({ error: "이메일 또는 비밀번호가 올바르지 않습니다." });
  req.session.userId = user.id;
  res.json({ ok: true, user: publicUser(user) });
});

app.post("/api/logout", (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get("/api/me", (req, res) => res.json({ user: publicUser(userFromSession(req)), admin: !!req.session.admin }));

app.get("/auth/google", (req, res) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return res.status(503).send("Google 로그인이 아직 설정되지 않았습니다.");
  const state = crypto.randomBytes(24).toString("hex");
  req.session.googleState = state;
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", GOOGLE_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  res.redirect(url.toString());
});

app.get("/auth/google/callback", async (req, res) => {
  try {
    if (!req.query.code || !req.query.state || req.query.state !== req.session.googleState) return res.status(400).send("Google 인증 상태가 올바르지 않습니다.");
    delete req.session.googleState;
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code: req.query.code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, redirect_uri: GOOGLE_REDIRECT_URI, grant_type: "authorization_code" }) });
    const token = await tokenRes.json();
    if (!tokenRes.ok) throw new Error("Google 토큰 교환 실패");
    const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${token.access_token}` } });
    const info = await infoRes.json();
    if (!infoRes.ok || !info.sub || !info.email) throw new Error("Google 사용자 정보 확인 실패");

    const db = readDb();
    let user = db.users.find(u => u.googleSub === info.sub || u.email === info.email.toLowerCase());
    if (!user) {
      let nickname = String(info.name || info.email.split("@")[0]).trim().slice(0, 30) || "Sound User";
      let base = nickname, n = 2;
      while (db.users.some(u => u.nickname === nickname)) nickname = `${base}${n++}`.slice(0, 30);
      user = { id: id(), email: info.email.toLowerCase(), nickname, provider: "google", googleSub: info.sub, createdAt: new Date().toISOString() };
      db.users.push(user);
    } else {
      user.googleSub = info.sub;
      user.provider = user.provider === "local" ? user.provider : "google";
    }
    writeDb(db);
    req.session.userId = user.id;
    res.redirect("/account.html?login=success");
  } catch (err) {
    console.error(err);
    res.status(500).send("Google 로그인에 실패했습니다.");
  }
});

// ---------- Songs ----------
app.get("/api/sounds", (_req, res) => {
  const db = readDb();
  res.json(db.songs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(songView));
});

app.post("/api/sounds", requireUser, songUpload.fields([{ name: "sound", maxCount: 1 }, { name: "cover", maxCount: 1 }]), (req, res) => {
  const audio = req.files?.sound?.[0];
  const cover = req.files?.cover?.[0];
  const title = String(req.body.title || "").trim();
  const lyrics = String(req.body.lyrics || "");
  const allowDownload = String(req.body.allowDownload) === "true";

  if (!audio) return res.status(400).json({ error: "음악 파일을 선택하세요." });
  if (!title || title.length > 100) {
    fs.rmSync(audio.path, { force: true });
    if (cover) fs.rmSync(cover.path, { force: true });
    return res.status(400).json({ error: "제목은 1~100자로 입력하세요." });
  }
  if (lyrics.length > 20000) {
    fs.rmSync(audio.path, { force: true });
    if (cover) fs.rmSync(cover.path, { force: true });
    return res.status(400).json({ error: "가사가 너무 깁니다." });
  }

  const db = readDb();
  const song = { id: id(), title, artist: req.user.nickname, userId: req.user.id, audioFile: audio.filename, coverFile: cover?.filename || null, lyrics, allowDownload, createdAt: new Date().toISOString() };
  db.songs.push(song);
  writeDb(db);
  res.json({ ok: true, song: songView(song) });
});

app.get("/api/sounds/:id/stream", (req, res) => {
  const song = readDb().songs.find(s => s.id === req.params.id);
  if (!song || !song.audioFile) return res.status(404).send("곡을 찾을 수 없습니다.");
  const target = path.join(soundsDir, path.basename(song.audioFile));
  if (!fs.existsSync(target)) return res.status(404).send("음악 파일을 찾을 수 없습니다.");
  res.sendFile(target);
});

app.get("/api/sounds/:id/download", (req, res) => {
  const song = readDb().songs.find(s => s.id === req.params.id);
  if (!song || !song.allowDownload) return res.status(403).send("이 곡은 다운로드가 허용되지 않았습니다.");
  const target = path.join(soundsDir, path.basename(song.audioFile));
  if (!fs.existsSync(target)) return res.status(404).send("음악 파일을 찾을 수 없습니다.");
  res.download(target, `${safeName(song.title)}.${path.extname(song.audioFile).slice(1)}`);
});

app.get("/api/sounds/:id/cover", (req, res) => {
  const song = readDb().songs.find(s => s.id === req.params.id);
  if (!song || !song.coverFile) return res.status(404).send("커버 이미지가 없습니다.");
  const target = path.join(coversDir, path.basename(song.coverFile));
  if (!fs.existsSync(target)) return res.status(404).send("커버 이미지를 찾을 수 없습니다.");
  res.sendFile(target);
});

app.delete("/api/sounds/:id", requireUser, (req, res) => {
  const db = readDb();
  const index = db.songs.findIndex(s => s.id === req.params.id);
  if (index < 0) return res.status(404).json({ error: "곡을 찾을 수 없습니다." });
  const song = db.songs[index];
  if (song.userId !== req.user.id && !req.session.admin) return res.status(403).json({ error: "삭제 권한이 없습니다." });
  fs.rmSync(path.join(soundsDir, path.basename(song.audioFile)), { force: true });
  if (song.coverFile) fs.rmSync(path.join(coversDir, path.basename(song.coverFile)), { force: true });
  db.songs.splice(index, 1);
  writeDb(db);
  res.json({ ok: true });
});

// ---------- Admin ----------
app.post("/api/admin/login", (req, res) => {
  if (!ADMIN_PASSWORD || req.body?.password !== ADMIN_PASSWORD) return res.status(401).json({ error: "관리자 비밀번호가 올바르지 않습니다." });
  req.session.admin = true;
  res.json({ ok: true });
});
app.post("/api/admin/logout", (req, res) => { req.session.admin = false; res.json({ ok: true }); });
app.get("/api/admin/me", (req, res) => res.json({ admin: !!req.session.admin }));
app.get("/api/admin/sounds", requireAdmin, (_req, res) => res.json(readDb().songs.map(songView)));
app.get("/api/admin/users", requireAdmin, (_req, res) => res.json(readDb().users.map(publicUser)));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(400).json({ error: err.message || "요청 처리 중 오류가 발생했습니다." });
});

app.listen(PORT, () => console.log(`SOUND VAULT 2.0: ${BASE_URL}`));
