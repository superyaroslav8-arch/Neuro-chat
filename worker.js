const MODEL = "@cf/meta/llama-3.1-8b-instruct";
const COOKIE_NAME = "neuro_session";
const SESSION_DAYS = 30;

export class NeuroDB {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sql = state.storage.sql;

    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS chats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        temporary INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
  }

  userByUsername(username) {
    return this.sql
      .exec(
        "SELECT id, username, password_hash, created_at FROM users WHERE username = ?",
        username
      )
      .toArray()[0] || null;
  }

  userById(id) {
    return this.sql
      .exec(
        "SELECT id, username, created_at FROM users WHERE id = ?",
        id
      )
      .toArray()[0] || null;
  }

  createUser(username, passwordHash) {
    const now = Date.now();

    this.sql.exec(
      "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
      username,
      passwordHash,
      now
    );

    return this.userByUsername(username);
  }

  createSession(userId) {
    const token = crypto.randomUUID() + "-" + crypto.randomUUID();
    const expiresAt = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;

    this.sql.exec(
      "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)",
      token,
      userId,
      expiresAt
    );

    return { token, expiresAt };
  }

  session(token) {
    if (!token) return null;

    const row = this.sql
      .exec(
        "SELECT token, user_id, expires_at FROM sessions WHERE token = ?",
        token
      )
      .toArray()[0];

    if (!row) return null;

    if (row.expires_at < Date.now()) {
      this.sql.exec("DELETE FROM sessions WHERE token = ?", token);
      return null;
    }

    return row;
  }

  deleteSession(token) {
    if (token) {
      this.sql.exec("DELETE FROM sessions WHERE token = ?", token);
    }
  }

  createChat(userId, title = "Новый чат", temporary = false) {
    const now = Date.now();

    this.sql.exec(
      `INSERT INTO chats
       (user_id, title, temporary, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      userId,
      title,
      temporary ? 1 : 0,
      now,
      now
    );

    return this.sql
      .exec(
        "SELECT * FROM chats WHERE id = last_insert_rowid()"
      )
      .toArray()[0];
  }

  chats(userId) {
    return this.sql
      .exec(
        `SELECT id, title, temporary, created_at, updated_at
         FROM chats
         WHERE user_id = ?
         ORDER BY updated_at DESC`,
        userId
      )
      .toArray();
  }

  chat(userId, chatId) {
    return this.sql
      .exec(
        `SELECT *
         FROM chats
         WHERE id = ? AND user_id = ?`,
        chatId,
        userId
      )
      .toArray()[0] || null;
  }

  renameChat(userId, chatId, title) {
    this.sql.exec(
      `UPDATE chats
       SET title = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
      title,
      Date.now(),
      chatId,
      userId
    );
  }

  deleteChat(userId, chatId) {
    this.sql.exec(
      "DELETE FROM messages WHERE chat_id = ?",
      chatId
    );

    this.sql.exec(
      "DELETE FROM chats WHERE id = ? AND user_id = ?",
      chatId,
      userId
    );
  }

  messages(userId, chatId) {
    const chat = this.chat(userId, chatId);
    if (!chat) return [];

    return this.sql
      .exec(
        `SELECT id, role, content, created_at
         FROM messages
         WHERE chat_id = ?
         ORDER BY id ASC`,
        chatId
      )
      .toArray();
  }

  addMessage(chatId, role, content) {
    this.sql.exec(
      `INSERT INTO messages
       (chat_id, role, content, created_at)
       VALUES (?, ?, ?, ?)`,
      chatId,
      role,
      content,
      Date.now()
    );

    this.sql.exec(
      "UPDATE chats SET updated_at = ? WHERE id = ?",
      Date.now(),
      chatId
    );
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (url.pathname.startsWith("/api/")) {
        return await api(request, env, url);
      }

      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error(error);

      if (url.pathname.startsWith("/api/")) {
        return json({
          ok: false,
          error: "Внутренняя ошибка сервера."
        }, 500);
      }

      return new Response("Internal Server Error", {
        status: 500,
        headers: {
          "content-type": "text/plain; charset=utf-8"
        }
      });
    }
  }
};

async function api(request, env, url) {
  const path = url.pathname;

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders()
    });
  }

  if (path === "/api/health" && request.method === "GET") {
    return json({
      ok: true,
      service: "Neuro-chat",
      ai: Boolean(env.AI)
    });
  }

  const db = await getDB(env);
  const user = await currentUser(request, db);

  if (path === "/api/auth/register" && request.method === "POST") {
    return register(request, db);
  }

  if (path === "/api/auth/login" && request.method === "POST") {
    return login(request, db);
  }

  if (path === "/api/auth/logout" && request.method === "POST") {
    const token = getCookie(request, COOKIE_NAME);

    if (token) {
      db.deleteSession(token);
    }

    return json({
      ok: true
    }, 200, clearCookie(COOKIE_NAME));
  }

  if (path === "/api/auth/me" && request.method === "GET") {
    return json({
      ok: true,
      authenticated: Boolean(user),
      user: user ? {
        id: user.id,
        username: user.username
      } : null
    });
  }

  if (!user) {
    return json({
      ok: false,
      error: "Требуется авторизация."
    }, 401);
  }

  if (path === "/api/chats" && request.method === "GET") {
    return json({
      ok: true,
      chats: db.chats(user.id)
    });
  }

  if (path === "/api/chats" && request.method === "POST") {
    const body = await readJSON(request);

    const title =
      typeof body.title === "string" && body.title.trim()
        ? body.title.trim().slice(0, 100)
        : "Новый чат";

    const chat = db.createChat(
      user.id,
      title,
      Boolean(body.temporary)
    );

    return json({
      ok: true,
      chat
    }, 201);
  }

  const chatMatch = path.match(/^\/api\/chats\/(\d+)$/);

  if (chatMatch) {
    const chatId = Number(chatMatch[1]);

    if (request.method === "GET") {
      const chat = db.chat(user.id, chatId);

      if (!chat) {
        return json({
          ok: false,
          error: "Чат не найден."
        }, 404);
      }

      return json({
        ok: true,
        chat,
        messages: db.messages(user.id, chatId)
      });
    }

    if (request.method === "DELETE") {
      db.deleteChat(user.id, chatId);

      return json({
        ok: true
      });
    }

    if (request.method === "PATCH") {
      const body = await readJSON(request);

      const title =
        typeof body.title === "string"
          ? body.title.trim().slice(0, 100)
          : "";

      if (!title) {
        return json({
          ok: false,
          error: "Название чата не может быть пустым."
        }, 400);
      }

      db.renameChat(user.id, chatId, title);

      return json({
        ok: true
      });
    }
  }

  if (path === "/api/chat" && request.method === "POST") {
    return chat(request, env, db, user);
  }

  if (path === "/api/tools" && request.method === "POST") {
    return tools(request, env, db, user);
  }

  return json({
    ok: false,
    error: "API route not found."
  }, 404);
}

async function register(request, db) {
  const body = await readJSON(request);

  const username = normalizeUsername(body.username);
  const password = String(body.password || "");

  if (!validUsername(username)) {
    return json({
      ok: false,
      error: "Логин: минимум 3 символа, только латинские буквы, цифры, точка, тире и подчёркивание."
    }, 400);
  }

  if (password.length < 6) {
    return json({
      ok: false,
      error: "Пароль должен содержать минимум 6 символов."
    }, 400);
  }

  if (db.userByUsername(username)) {
    return json({
      ok: false,
      error: "Такой пользователь уже существует."
    }, 409);
  }

  const passwordHash = await hashPassword(password);
  const user = db.createUser(username, passwordHash);
  const session = db.createSession(user.id);

  return json({
    ok: true,
    user: {
      id: user.id,
      username: user.username
    }
  }, 201, setCookie(
    COOKIE_NAME,
    session.token,
    session.expiresAt
  ));
}

async function login(request, db) {
  const body = await readJSON(request);

  const username = normalizeUsername(body.username);
  const password = String(body.password || "");

  const user = db.userByUsername(username);

  if (!user) {
    return json({
      ok: false,
      error: "Неверный логин или пароль."
    }, 401);
  }

  const valid = await verifyPassword(
    password,
    user.password_hash
  );

  if (!valid) {
    return json({
      ok: false,
      error: "Неверный логин или пароль."
    }, 401);
  }

  const session = db.createSession(user.id);

  return json({
    ok: true,
    user: {
      id: user.id,
      username: user.username
    }
  }, 200, setCookie(
    COOKIE_NAME,
    session.token,
    session.expiresAt
  ));
}

async function chat(request, env, db, user) {
  const body = await readJSON(request);

  let chatId = Number(body.chatId || 0);
  let message = String(body.message || "").trim();

  if (!message) {
    return json({
      ok: false,
      error: "Введите сообщение."
    }, 400);
  }

  if (message.length > 12000) {
    message = message.slice(0, 12000);
  }

  let chatRow = chatId
    ? db.chat(user.id, chatId)
    : null;

  if (!chatRow) {
    const title = message.length > 45
      ? message.slice(0, 45) + "…"
      : message;

    chatRow = db.createChat(user.id, title, Boolean(body.temporary));
    chatId = chatRow.id;
  }

  db.addMessage(chatId, "user", message);

  const history = db
    .messages(user.id, chatId)
    .slice(-20)
    .map(item => ({
      role: item.role === "assistant" ? "assistant" : "user",
      content: item.content
    }));

  if (!env.AI) {
    const answer =
      "AI-провайдер Cloudflare Workers AI ещё не подключён. " +
      "Сам Нейро-чат и база данных работают корректно.";

    db.addMessage(chatId, "assistant", answer);

    return json({
      ok: true,
      chatId,
      answer,
      fallback: true
    });
  }

  const result = await env.AI.run(MODEL, {
    messages: [
      {
        role: "system",
        content:
          "Ты Нейро-чат — универсальный AI-помощник. " +
          "Отвечай на русском языке, если пользователь пишет по-русски. " +
          "Отвечай ясно, полезно и без выдуманных фактов."
      },
      ...history
    ]
  });

  const answer = extractAIText(result);

  db.addMessage(
    chatId,
    "assistant",
    answer
  );

  return json({
    ok: true,
    chatId,
    answer
  });
}

async function tools(request, env, db, user) {
  const body = await readJSON(request);
  const tool = String(body.tool || "");

  const descriptions = {
    image:
      "Инструмент создания изображения выбран. Для генерации изображения нужен подключённый image-generation провайдер.",
    video:
      "Инструмент создания видео выбран. Для генерации видео нужен подключённый видеопровайдер.",
    music:
      "Инструмент создания музыки выбран. Для генерации музыки нужен подключённый музыкальный провайдер.",
    model3d:
      "Инструмент создания 3D-модели выбран. Для генерации 3D-модели нужен подключённый 3D-провайдер.",
    website:
      "Инструмент создания сайта выбран. Я могу подготовить HTML, CSS и JavaScript прямо в чате.",
    code:
      "Режим кода включён. Отправьте код или задачу — Нейро-чат поможет написать или исправить его.",
    file:
      "Файл принят интерфейсом. Его содержимое можно использовать в следующем сообщении."
  };

  if (!descriptions[tool]) {
    return json({
      ok: false,
      error: "Неизвестный инструмент."
    }, 400);
  }

  return json({
    ok: true,
    tool,
    message: descriptions[tool]
  });
}

async function getDB(env) {
  const id = env.NEURO_DB.idFromName("global");
  const stub = env.NEURO_DB.get(id);

  return new DBClient(stub);
}

class DBClient {
  constructor(stub) {
    this.stub = stub;
  }

  async call(method, ...args) {
    const response = await this.stub.fetch(
      "https://database/" + method,
      {
        method: "POST",
        body: JSON.stringify(args)
      }
    );

    if (!response.ok) {
      throw new Error("Database error");
    }

    return response.json();
  }

  userByUsername(value) {
    return this.call("userByUsername", value);
  }

  userById(value) {
    return this.call("userById", value);
  }

  createUser(...args) {
    return this.call("createUser", ...args);
  }

  createSession(...args) {
    return this.call("createSession", ...args);
  }

  session(...args) {
    return this.call("session", ...args);
  }

  deleteSession(...args) {
    return this.call("deleteSession", ...args);
  }

  createChat(...args) {
    return this.call("createChat", ...args);
  }

  chats(...args) {
    return this.call("chats", ...args);
  }

  chat(...args) {
    return this.call("chat", ...args);
  }

  renameChat(...args) {
    return this.call("renameChat", ...args);
  }

  deleteChat(...args) {
    return this.call("deleteChat", ...args);
  }

  messages(...args) {
    return this.call("messages", ...args);
  }

  addMessage(...args) {
    return this.call("addMessage", ...args);
  }
}

async function currentUser(request, db) {
  const token = getCookie(request, COOKIE_NAME);
  if (!token) return null;

  const session = await db.session(token);
  if (!session) return null;

  return db.userById(session.user_id);
}

function extractAIText(result) {
  if (!result) {
    return "Не удалось получить ответ от AI.";
  }

  if (typeof result === "string") {
    return result;
  }

  if (typeof result.response === "string") {
    return result.response;
  }

  if (typeof result.text === "string") {
    return result.text;
  }

  if (Array.isArray(result.output)) {
    return result.output
      .map(x => typeof x === "string" ? x : x.text || "")
      .join("");
  }

  return JSON.stringify(result);
}

async function hashPassword(password) {
  const salt = crypto.randomUUID();

  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: encoder.encode(salt),
      iterations: 120000,
      hash: "SHA-256"
    },
    key,
    256
  );

  return salt + ":" + bytesToHex(new Uint8Array(bits));
}

async function verifyPassword(password, stored) {
  const [salt, expected] = String(stored).split(":");

  if (!salt || !expected) return false;

  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: encoder.encode(salt),
      iterations: 120000,
      hash: "SHA-256"
    },
    key,
    256
  );

  return bytesToHex(new Uint8Array(bits)) === expected;
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function validUsername(username) {
  return /^[a-z0-9._-]{3,40}$/.test(username);
}

async function readJSON(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";

  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");

    if (key === name) {
      return rest.join("=");
    }
  }

  return null;
}

function setCookie(name, value, expiresAt) {
  const date = new Date(expiresAt).toUTCString();

  return {
    "Set-Cookie":
      `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${date}`
  };
}

function clearCookie(name) {
  return {
    "Set-Cookie":
      `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
  };
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders(),
      ...extraHeaders
    }
  });
}

NeuroDB.prototype.handle = async function(request) {
  const url = new URL(request.url);
  const method = url.pathname.slice(1);

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const args = await request.json();

  try {
    const result = await this[method](...args);

    return new Response(JSON.stringify(result ?? null), {
      headers: {
        "content-type": "application/json"
      }
    });
  } catch (error) {
    console.error(error);

    return new Response(JSON.stringify({
      error: "Database operation failed."
    }), {
      status: 500,
      headers: {
        "content-type": "application/json"
      }
    });
  }
};

NeuroDB.prototype.fetch = NeuroDB.prototype.handle;