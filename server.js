"use strict";

const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const dotenv = require("dotenv");
const OpenAI = require("openai");

dotenv.config();

const app = express();

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const CHATS_FILE = path.join(DATA_DIR, "chats.json");

const SESSION_COOKIE = "neuro_session";
const SESSION_MAX_AGE = 1000 * 60 * 60 * 24 * 30;

const sessions = new Map();

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    })
  : null;

function ensureData() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, "[]", "utf8");
  }

  if (!fs.existsSync(CHATS_FILE)) {
    fs.writeFileSync(CHATS_FILE, "[]", "utf8");
  }
}

ensureData();

function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return [];
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(
    file,
    JSON.stringify(data, null, 2),
    "utf8"
  );
}

function users() {
  return readJSON(USERS_FILE);
}

function chats() {
  return readJSON(CHATS_FILE);
}

function id() {
  return crypto.randomUUID();
}

function now() {
  return new Date().toISOString();
}

function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function validUsername(username) {
  return /^[a-zA-Zа-яА-Я0-9_.-]{3,40}$/.test(username);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto
    .pbkdf2Sync(password, salt, 120000, 64, "sha512")
    .toString("hex");

  return {
    salt,
    hash
  };
}

function verifyPassword(password, salt, expectedHash) {
  const actual = crypto
    .pbkdf2Sync(password, salt, 120000, 64, "sha512")
    .toString("hex");

  return crypto.timingSafeEqual(
    Buffer.from(actual, "hex"),
    Buffer.from(expectedHash, "hex")
  );
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    createdAt: user.createdAt
  };
}

function createSession(userId) {
  const token = crypto.randomBytes(48).toString("hex");

  sessions.set(token, {
    userId,
    expiresAt: Date.now() + SESSION_MAX_AGE
  });

  return token;
}

function parseCookies(req) {
  const header = req.headers.cookie || "";

  const result = {};

  for (const part of header.split(";")) {
    const index = part.indexOf("=");

    if (index === -1) {
      continue;
    }

    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();

    result[key] = decodeURIComponent(value);
  }

  return result;
}

function setSessionCookie(res, token) {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${Math.floor(
      SESSION_MAX_AGE / 1000
    )}`
  );
}

function clearSessionCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`
  );
}

function getCurrentUser(req) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];

  if (!token) {
    return null;
  }

  const session = sessions.get(token);

  if (!session) {
    return null;
  }

  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }

  return users().find(
    user => user.id === session.userId
  ) || null;
}

function requireAuth(req, res, next) {
  const user = getCurrentUser(req);

  if (!user) {
    return res.status(401).json({
      error: "Требуется авторизация."
    });
  }

  req.user = user;

  next();
}

function safeError(error) {
  console.error(error);

  if (error && error.message) {
    return error.message;
  }

  return "Внутренняя ошибка сервера.";
}

app.disable("x-powered-by");

app.use(
  express.json({
    limit: "20mb"
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "20mb"
  })
);

app.use(express.static(__dirname));

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "Neuro Chat",
    aiConfigured: Boolean(openai)
  });
});

/* =========================
   AUTH
========================= */

app.post("/api/auth/register", (req, res) => {
  try {
    const username = normalizeUsername(req.body.username);
    const password = String(req.body.password || "");

    if (!validUsername(username)) {
      return res.status(400).json({
        error:
          "Имя пользователя: от 3 до 40 символов. Разрешены буквы, цифры, _, - и ."
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: "Пароль должен содержать минимум 6 символов."
      });
    }

    const allUsers = users();

    if (
      allUsers.some(
        user => user.username === username
      )
    ) {
      return res.status(409).json({
        error: "Пользователь с таким именем уже существует."
      });
    }

    const passwordData = hashPassword(password);

    const user = {
      id: id(),
      username,
      passwordHash: passwordData.hash,
      passwordSalt: passwordData.salt,
      createdAt: now()
    };

    allUsers.push(user);

    writeJSON(USERS_FILE, allUsers);

    const token = createSession(user.id);

    setSessionCookie(res, token);

    res.json({
      ok: true,
      user: publicUser(user)
    });
  } catch (error) {
    res.status(500).json({
      error: safeError(error)
    });
  }
});

app.post("/api/auth/login", (req, res) => {
  try {
    const username = normalizeUsername(req.body.username);
    const password = String(req.body.password || "");

    const user = users().find(
      item => item.username === username
    );

    if (!user) {
      return res.status(401).json({
        error: "Неверное имя пользователя или пароль."
      });
    }

    const correct = verifyPassword(
      password,
      user.passwordSalt,
      user.passwordHash
    );

    if (!correct) {
      return res.status(401).json({
        error: "Неверное имя пользователя или пароль."
      });
    }

    const token = createSession(user.id);

    setSessionCookie(res, token);

    res.json({
      ok: true,
      user: publicUser(user)
    });
  } catch (error) {
    res.status(500).json({
      error: safeError(error)
    });
  }
});

app.post("/api/auth/logout", (req, res) => {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];

  if (token) {
    sessions.delete(token);
  }

  clearSessionCookie(res);

  res.json({
    ok: true
  });
});

app.get("/api/auth/me", (req, res) => {
  const user = getCurrentUser(req);

  res.json({
    user: user ? publicUser(user) : null
  });
});

/* =========================
   CHATS
========================= */

app.get("/api/chats", requireAuth, (req, res) => {
  const result = chats()
    .filter(chat => chat.userId === req.user.id)
    .sort(
      (a, b) =>
        new Date(b.updatedAt) -
        new Date(a.updatedAt)
    )
    .map(chat => ({
      id: chat.id,
      title: chat.title,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt
    }));

  res.json({
    chats: result
  });
});

app.post("/api/chats", requireAuth, (req, res) => {
  try {
    const title =
      String(req.body.title || "Новый чат")
        .trim()
        .slice(0, 100) || "Новый чат";

    const allChats = chats();

    const chat = {
      id: id(),
      userId: req.user.id,
      title,
      createdAt: now(),
      updatedAt: now(),
      messages: []
    };

    allChats.push(chat);

    writeJSON(CHATS_FILE, allChats);

    res.json({
      ok: true,
      chat: {
        id: chat.id,
        title: chat.title,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt
      }
    });
  } catch (error) {
    res.status(500).json({
      error: safeError(error)
    });
  }
});

app.get("/api/chats/:chatId", requireAuth, (req, res) => {
  const chat = chats().find(
    item =>
      item.id === req.params.chatId &&
      item.userId === req.user.id
  );

  if (!chat) {
    return res.status(404).json({
      error: "Чат не найден."
    });
  }

  res.json({
    chat: {
      id: chat.id,
      title: chat.title,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      messages: chat.messages || []
    }
  });
});

app.delete("/api/chats/:chatId", requireAuth, (req, res) => {
  const allChats = chats();

  const index = allChats.findIndex(
    item =>
      item.id === req.params.chatId &&
      item.userId === req.user.id
  );

  if (index === -1) {
    return res.status(404).json({
      error: "Чат не найден."
    });
  }

  allChats.splice(index, 1);

  writeJSON(CHATS_FILE, allChats);

  res.json({
    ok: true
  });
});

/* =========================
   TEXT AI
========================= */

app.post("/api/chat", requireAuth, async (req, res) => {
  try {
    const chatId = String(req.body.chatId || "");
    const prompt = String(req.body.prompt || "").trim();

    if (!chatId) {
      return res.status(400).json({
        error: "Не указан chatId."
      });
    }

    if (!prompt) {
      return res.status(400).json({
        error: "Введите сообщение."
      });
    }

    const allChats = chats();

    const chat = allChats.find(
      item =>
        item.id === chatId &&
        item.userId === req.user.id
    );

    if (!chat) {
      return res.status(404).json({
        error: "Чат не найден."
      });
    }

    if (!openai) {
      return res.status(503).json({
        error:
          "ИИ не настроен на сервере. Добавьте OPENAI_API_KEY в переменные окружения сервера."
      });
    }

    const userMessage = {
      id: id(),
      role: "user",
      content: prompt,
      createdAt: now()
    };

    chat.messages = chat.messages || [];
    chat.messages.push(userMessage);

    const recentMessages = chat.messages
      .slice(-30)
      .map(message => ({
        role: message.role,
        content: message.content
      }));

    const response = await openai.responses.create({
      model:
        process.env.OPENAI_MODEL ||
        "gpt-5.6-luna",
      instructions:
        "Ты — Нейро, дружелюбный и точный AI-помощник. Отвечай на русском языке, если пользователь пишет по-русски. Не выдумывай факты. Если информации недостаточно, прямо скажи об этом.",
      input: recentMessages
    });

    const answer =
      response.output_text ||
      "Не удалось получить текстовый ответ.";

    const assistantMessage = {
      id: id(),
      role: "assistant",
      content: answer,
      createdAt: now()
    };

    chat.messages.push(assistantMessage);

    if (
      chat.title === "Новый чат" &&
      prompt.length > 0
    ) {
      chat.title =
        prompt.slice(0, 45) +
        (prompt.length > 45 ? "…" : "");
    }

    chat.updatedAt = now();

    writeJSON(CHATS_FILE, allChats);

    res.json({
      ok: true,
      message: assistantMessage,
      chat: {
        id: chat.id,
        title: chat.title,
        updatedAt: chat.updatedAt
      }
    });
  } catch (error) {
    res.status(500).json({
      error: safeError(error)
    });
  }
});

/* =========================
   IMAGE GENERATION
========================= */

app.post(
  "/api/generate/image",
  requireAuth,
  async (req, res) => {
    try {
      const prompt = String(
        req.body.prompt || ""
      ).trim();

      if (!prompt) {
        return res.status(400).json({
          error: "Введите описание изображения."
        });
      }

      if (!openai) {
        return res.status(503).json({
          error:
            "Генерация изображений не настроена. Добавьте OPENAI_API_KEY."
        });
      }

      const result =
        await openai.images.generate({
          model:
            process.env.OPENAI_IMAGE_MODEL ||
            "gpt-image-2",
          prompt,
          size: "1024x1024"
        });

      const item =
        result.data &&
        result.data[0];

      if (!item) {
        throw new Error(
          "Модель не вернула изображение."
        );
      }

      let imageUrl = null;

      if (item.url) {
        imageUrl = item.url;
      }

      if (item.b64_json) {
        imageUrl =
          `data:image/png;base64,${item.b64_json}`;
      }

      if (!imageUrl) {
        throw new Error(
          "Сервер не получил изображение."
        );
      }

      res.json({
        ok: true,
        image: imageUrl
      });
    } catch (error) {
      res.status(500).json({
        error: safeError(error)
      });
    }
  }
);

/* =========================
   VIDEO PLACEHOLDER
========================= */

app.post(
  "/api/generate/video",
  requireAuth,
  async (req, res) => {
    res.status(501).json({
      error:
        "Генерация видео пока не подключена к API в этой версии."
    });
  }
);

/* =========================
   SPA FALLBACK
========================= */

app.get("*", (req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({
      error: "API endpoint не найден."
    });
  }

  res.sendFile(
    path.join(__dirname, "index.html")
  );
});

/* =========================
   ERROR HANDLER
========================= */

app.use((error, req, res, next) => {
  console.error(error);

  if (res.headersSent) {
    return next(error);
  }

  res.status(500).json({
    error: "Внутренняя ошибка сервера."
  });
});

app.listen(PORT, () => {
  console.log(
    `Neuro Chat запущен: http://localhost:${PORT}`
  );

  console.log(
    `AI API: ${openai ? "подключён" : "не настроен"}`
  );
});