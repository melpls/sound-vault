require("dotenv").config();

const express = require("express");
const session = require("express-session");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!ADMIN_PASSWORD || !SESSION_SECRET) {
  console.error("ERROR: .env에 ADMIN_PASSWORD와 SESSION_SECRET을 설정하세요.");
  process.exit(1);
}

const publicDir = path.join(__dirname, "public");
const soundsDir = path.join(__dirname, "sounds");
fs.mkdirSync(soundsDir, { recursive: true });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: 1000 * 60 * 60 * 8
  }
}));

app.use(express.static(publicDir));
app.use("/sounds", express.static(soundsDir));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, soundsDir),
  filename: (_req, file, cb) => {
    const safe = path.basename(file.originalname)
      .replace(/[^\w가-힣 .()-]/g, "_")
      .replace(/\s+/g, " ")
      .trim();
    cb(null, `${Date.now()}-${safe}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(file.originalname);
    cb(ok ? null : new Error("지원하지 않는 오디오 형식입니다."), ok);
  }
});

function isAdmin(req, res, next) {
  if (req.session.admin) return next();
  res.status(401).json({ error: "관리자 인증이 필요합니다." });
}

function listSounds() {
  return fs.readdirSync(soundsDir)
    .filter(name => /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(name))
    .map(name => ({
      name,
      url: `/sounds/${encodeURIComponent(name)}`
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

app.get("/api/sounds", (_req, res) => {
  res.json(listSounds());
});

app.post("/api/login", (req, res) => {
  const { password } = req.body;
  if (typeof password !== "string" || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "비밀번호가 올바르지 않습니다." });
  }
  req.session.admin = true;
  res.json({ ok: true });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/me", (req, res) => {
  res.json({ admin: !!req.session.admin });
});

app.post("/api/upload", isAdmin, upload.single("sound"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "파일이 없습니다." });
  res.json({ ok: true, sound: { name: req.file.filename, url: `/sounds/${encodeURIComponent(req.file.filename)}` } });
});

app.delete("/api/sounds/:name", isAdmin, (req, res) => {
  const name = path.basename(req.params.name);
  const target = path.join(soundsDir, name);

  if (!fs.existsSync(target)) {
    return res.status(404).json({ error: "파일을 찾을 수 없습니다." });
  }

  fs.unlinkSync(target);
  res.json({ ok: true });
});

app.use((err, _req, res, _next) => {
  res.status(400).json({ error: err.message || "요청 처리 중 오류가 발생했습니다." });
});

app.listen(PORT, () => {
  console.log(`SOUND VAULT: http://localhost:${PORT}`);
});