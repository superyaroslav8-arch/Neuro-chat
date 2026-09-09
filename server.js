const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const DATA_DIR = path.join(ROOT, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const CHATS_FILE = path.join(DATA_DIR, "chats.json");

fs.mkdirSync(DATA_DIR, { recursive: true });

function ensureFile(file, fallback) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
  }
}

ensureFile(USERS_FILE, []);
ensureFile(CHATS_FILE, []);

const sessions = new Map();

app.disable("x-powered-by");

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(express.static(ROOT, {
  index: false
}));

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.writeFileSync(
    file,
    JSON.stringify(value, null, 2)
  );
}

function clean(value, max = 12000) {
  return String(value ?? "")
    .replace(
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,
      ""
    )
    .trim()
    .slice(0, max);
}

function hashPassword(
  password,
  salt = crypto.randomBytes(16).toString("hex")
) {
  return {
    salt,
    hash: crypto
      .scryptSync(password, salt, 64)
      .toString("hex")
  };
}

function verifyPassword(password, user) {
  try {
    const actual = crypto
      .scryptSync(password, user.salt, 64)
      .toString("hex");

    return crypto.timingSafeEqual(
      Buffer.from(actual, "hex"),
      Buffer.from(user.hash, "hex")
    );
  } catch {
    return false;
  }
}

function createToken() {
  return crypto.randomBytes(32).toString("hex");
}

function setSession(res, userId) {
  const sessionToken = createToken();

  sessions.set(sessionToken, {
    userId,
    createdAt: Date.now()
  });

  res.setHeader(
    "Set-Cookie",
    `neuro_session=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`
  );
}

function getUser(req) {
  const cookie = req.headers.cookie || "";

  const match = cookie.match(
    /(?:^|;\s*)neuro_session=([^;]+)/
  );

  if (!match) {
    return null;
  }

  const session = sessions.get(match[1]);

  if (!session) {
    return null;
  }

  const users = readJson(USERS_FILE, []);

  return users.find(
    user => user.id === session.userId
  ) || null;
}

function requireUser(req, res, next) {
  const user = getUser(req);

  if (!user) {
    return res.status(401).json({
      ok: false,
      error: "Требуется вход в аккаунт."
    });
  }

  req.user = user;
  next();
}

/* =========================
   АВТОНОМНЫЙ НЕЙРО-ДВИЖОК
========================= */

const stopWords = new Set([
  "и",
  "а",
  "но",
  "это",
  "как",
  "что",
  "для",
  "или",
  "на",
  "в",
  "с",
  "по",
  "у",
  "я",
  "ты",
  "мне",
  "мы",
  "вы",
  "же",
  "не",
  "да",
  "из",
  "за",
  "к",
  "о",
  "про",
  "то"
]);

function words(text) {
  return (
    clean(text, 3000)
      .toLowerCase()
      .replace(/ё/g, "е")
      .match(/[a-zа-я0-9]+/gi) || []
  );
}

function localAnswer(message, history = []) {
  const q = clean(message, 5000);

  if (!q) {
    return "Напиши вопрос или задачу — я помогу разобраться.";
  }

  const lower = q.toLowerCase();

  const has = (...items) =>
    items.some(item => lower.includes(item));

  const wordList = words(q);

  /* Приветствие */

  if (
    has(
      "привет",
      "здравствуй",
      "добрый вечер",
      "доброе утро",
      "добрый день"
    )
  ) {
    return (
      "Привет! 👋 Я Нейро.\n\n" +
      "Готов помочь с вопросом, текстом, кодом, " +
      "идеей или твоим проектом."
    );
  }

  /* Кто такой Нейро */

  if (
    has(
      "кто ты",
      "ты кто",
      "что ты"
    )
  ) {
    return (
      "Я Нейро — помощник этого сайта.\n\n" +
      "Сейчас я работаю в автономном режиме без " +
      "внешнего API-ключа. Я умею вести контекст " +
      "диалога и помогать с задачами, кодом, " +
      "текстами и проектами."
    );
  }

  /* Спасибо */

  if (
    has(
      "спасибо",
      "благодарю"
    )
  ) {
    return (
      "Пожалуйста! 😊\n\n" +
      "Если есть следующая задача — присылай."
    );
  }

  /* Время */

  if (
    has(
      "время",
      "который час"
    )
  ) {
    return (
      `Сейчас серверное время: ${
        new Date().toLocaleString("ru-RU")
      }.`
    );
  }

  /* Дата */

  if (
    has(
      "дата",
      "какое сегодня число",
      "сегодня"
    )
  ) {
    return (
      `Сегодня ${
        new Date().toLocaleDateString(
          "ru-RU",
          {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric"
          }
        )
      }.`
    );
  }

  /* Код */

  if (
    has(
      "код",
      "javascript",
      "js",
      "html",
      "css",
      "python",
      "server.js",
      "script.js"
    )
  ) {
    return (
      "Понял, это задача по коду. 🧩\n\n" +
      "Пришли файл или вставь проблемный фрагмент " +
      "и напиши, что должно происходить.\n\n" +
      "Я помогу разобрать структуру, найти типичные " +
      "ошибки и подготовить готовую замену."
    );
  }

  /* Сайт */

  if (
    has(
      "сайт",
      "страниц",
      "интерфейс",
      "кнопк"
    )
  ) {
    return (
      "Для сайта лучше идти по слоям:\n\n" +
      "1. Интерфейс\n" +
      "2. Клиентский JavaScript\n" +
      "3. Серверный API\n" +
      "4. Хранение данных\n\n" +
      "В Neuro-chat сначала важно добиться стабильной " +
      "работы чата и авторизации, а затем подключать " +
      "дополнительные генераторы."
    );
  }

  /* 3D */

  if (
    has(
      "3d",
      "3д",
      "модель",
      "печать",
      "принтер"
    )
  ) {
    return (
      "Могу помочь с 3D-проектом: настройками печати, " +
      "Bambu Studio, поддержками, соединениями деталей " +
      "и подготовкой модели."
    );
  }

  /* Ошибки */

  if (
    has(
      "ошибк",
      "не работает",
      "сломал",
      "ошибка"
    )
  ) {
    return (
      `Давай разберём ошибку по фактам.\n\n` +
      `Я получил сообщение:\n«${q.slice(0, 240)}»\n\n` +
      "Если это ошибка сайта, пришли её текст или " +
      "скриншот — я помогу определить конкретный файл " +
      "и место, которое нужно исправить."
    );
  }

  /* Общий ответ */

  const usefulWords = wordList
    .filter(word => !stopWords.has(word))
    .slice(0, 8);

  const topic =
    usefulWords.length > 0
      ? usefulWords.join(", ")
      : "твой запрос";

  const previousUsers = history
    .filter(item => item && item.role === "user")
    .slice(-3)
    .map(item => clean(item.content, 180));

  const variants = [
    `Понял задачу. Ключевые темы здесь: ${topic}. Давай разложим её на конкретные шаги и сначала сделаем самое важное.`,

    `Хорошо. Я бы начал с главного: ${topic}. После этого можно последовательно проверить детали и убрать лишнее.`,

    `Принял. По текущему запросу вижу задачу на тему «${topic}». Могу помочь довести её до рабочего результата без лишних действий.`,

    previousUsers.length
      ? `Продолжаю с учётом предыдущего контекста: «${previousUsers[previousUsers.length - 1]}». Теперь можно перейти к следующему шагу.`
      : "Принял. Опиши желаемый результат чуть конкретнее, и я помогу построить решение."
  ];

  return variants[
    (q.length +
      wordList.length +
      history.length) %
      variants.length
  ];
}

/* =========================
   SYSTEM
========================= */

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "neuro-chat",
    mode: "autonomous",
    externalApi: false,
    time: new Date().toISOString()
  });
});

app.get("/api/status", (req, res) => {
  res.json({
    ok: true,
    ai: "local",
    externalApi: false
  });
});

/* =========================
   AUTH
========================= */

app.post("/api/auth/register", (req, res) => {
  const username = clean(
    req.body.username,
    80
  ).toLowerCase();

  const password = String(
    req.body.password || ""
  );

  if (
    !/^[a-z0-9._-]{3,40}$/.test(username)
  ) {
    return res.status(400).json({
      ok: false,
      error:
        "Логин: 3–40 символов, только английские буквы, цифры, точка, _ или -."
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      ok: false,
      error:
        "Пароль должен быть не короче 6 символов."
    });
  }

  const users = readJson(
    USERS_FILE,
    []
  );

  if (
    users.some(
      user => user.username === username
    )
  ) {
    return res.status(409).json({
      ok: false,
      error:
        "Такой пользователь уже существует."
    });
  }

  const {
    salt,
    hash
  } = hashPassword(password);

  const user = {
    id: crypto.randomUUID(),
    username,
    salt,
    hash,
    createdAt:
      new Date().toISOString()
  };

  users.push(user);

  writeJson(
    USERS_FILE,
    users
  );

  setSession(
    res,
    user.id
  );

  res.json({
    ok: true,
    user: {
      id: user.id,
      username: user.username
    }
  });
});

app.post("/api/auth/login", (req, res) => {
  const username = clean(
    req.body.username,
    80
  ).toLowerCase();

  const password = String(
    req.body.password || ""
  );

  const users = readJson(
    USERS_FILE,
    []
  );

  const user = users.find(
    item =>
      item.username === username
  );

  if (
    !user ||
    !verifyPassword(
      password,
      user
    )
  ) {
    return res.status(401).json({
      ok: false,
      error:
        "Неверный логин или пароль."
    });
  }

  setSession(
    res,
    user.id
  );

  res.json({
    ok: true,
    user: {
      id: user.id,
      username: user.username
    }
  });
});

app.post("/api/auth/logout", (req, res) => {
  const cookie =
    req.headers.cookie || "";

  const match = cookie.match(
    /(?:^|;\s*)neuro_session=([^;]+)/
  );

  if (match) {
    sessions.delete(match[1]);
  }

  res.setHeader(
    "Set-Cookie",
    "neuro_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
  );

  res.json({
    ok: true
  });
});

app.get("/api/auth/me", (req, res) => {
  const user = getUser(req);

  res.json({
    ok: true,
    authenticated: !!user,
    user: user
      ? {
          id: user.id,
          username: user.username
        }
      : null
  });
});

/* =========================
   CHATS
========================= */

app.get(
  "/api/chats",
  requireUser,
  (req, res) => {
    const chats = readJson(
      CHATS_FILE,
      []
    )
      .filter(
        chat =>
          chat.userId ===
          req.user.id
      )
      .sort(
        (a, b) =>
          new Date(b.updatedAt) -
          new Date(a.updatedAt)
      );

    res.json({
      ok: true,
      chats: chats.map(chat => ({
        id: chat.id,
        title: chat.title,
        updatedAt: chat.updatedAt
      }))
    });
  }
);

app.post(
  "/api/chats",
  requireUser,
  (req, res) => {
    const chats = readJson(
      CHATS_FILE,
      []
    );

    const chat = {
      id: crypto.randomUUID(),
      userId: req.user.id,
      title:
        clean(
          req.body.title,
          80
        ) ||
        "Новый чат",
      messages: [],
      createdAt:
        new Date().toISOString(),
      updatedAt:
        new Date().toISOString()
    };

    chats.push(chat);

    writeJson(
      CHATS_FILE,
      chats
    );

    res.json({
      ok: true,
      chat
    });
  }
);

app.get(
  "/api/chats/:id",
  requireUser,
  (req, res) => {
    const chats = readJson(
      CHATS_FILE,
      []
    );

    const chat = chats.find(
      item =>
        item.id ===
          req.params.id &&
        item.userId ===
          req.user.id
    );

    if (!chat) {
      return res.status(404).json({
        ok: false,
        error: "Чат не найден."
      });
    }

    res.json({
      ok: true,
      chat
    });
  }
);

app.delete(
  "/api/chats/:id",
  requireUser,
  (req, res) => {
    let chats = readJson(
      CHATS_FILE,
      []
    );

    const oldLength =
      chats.length;

    chats = chats.filter(
      chat =>
        !(
          chat.id ===
            req.params.id &&
          chat.userId ===
            req.user.id
        )
    );

    writeJson(
      CHATS_FILE,
      chats
    );

    res.json({
      ok: true,
      deleted:
        oldLength !==
        chats.length
    });
  }
);

/* =========================
   CHAT
========================= */

app.post(
  "/api/chat",
  requireUser,
  (req, res) => {
    const message = clean(
      req.body.message,
      5000
    );

    if (!message) {
      return res.status(400).json({
        ok: false,
        error:
          "Пустое сообщение."
      });
    }

    const chats = readJson(
      CHATS_FILE,
      []
    );

    let chat = chats.find(
      item =>
        item.id ===
          req.body.chatId &&
        item.userId ===
          req.user.id
    );

    if (!chat) {
      chat = {
        id: crypto.randomUUID(),
        userId: req.user.id,
        title:
          message.slice(0, 60),
        messages: [],
        createdAt:
          new Date().toISOString(),
        updatedAt:
          new Date().toISOString()
      };

      chats.push(chat);
    }

    chat.messages.push({
      role: "user",
      content: message,
      createdAt:
        new Date().toISOString()
    });

    const answer = localAnswer(
      message,
      chat.messages
    );

    chat.messages.push({
      role: "assistant",
      content: answer,
      createdAt:
        new Date().toISOString()
    });

    chat.updatedAt =
      new Date().toISOString();

    writeJson(
      CHATS_FILE,
      chats
    );

    res.json({
      ok: true,
      chatId: chat.id,
      message: {
        role: "assistant",
        content: answer
      }
    });
  }
);

/* =========================
   GENERATION PLACEHOLDERS
========================= */

app.post(
  "/api/generate/image",
  requireUser,
  (req, res) => {
    res.status(501).json({
      ok: false,
      error:
        "Генератор изображений пока не подключён. Интерфейс готов для подключения модели."
    });
  }
);

app.post(
  "/api/generate/video",
  requireUser,
  (req, res) => {
    res.status(501).json({
      ok: false,
      error:
        "Генератор видео пока не подключён. Интерфейс готов для подключения модели."
    });
  }
);

/* =========================
   FRONTEND
========================= */

app.get("/*splat", (req, res, next) => {
  if (
    req.path.startsWith("/api/")
  ) {
    return next();
  }

  res.sendFile(
    path.join(
      ROOT,
      "index.html"
    )
  );
});

app.use(
  (req, res) => {
    res.status(404).json({
      ok: false,
      error:
        "Маршрут не найден."
    });
  }
);

app.use(
  (err, req, res, next) => {
    console.error(err);

    res.status(500).json({
      ok: false,
      error:
        "Внутренняя ошибка сервера."
    });
  }
);

app.listen(
  PORT,
  () => {
    console.log(
      `Neuro-chat запущен на порту ${PORT}`
    );
  }
);