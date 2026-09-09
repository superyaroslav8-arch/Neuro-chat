"use strict";
/*
 * =========================================================
 * NEURO CHAT — SERVER
 * server.js
 * =========================================================
 *
 * Переменные окружения:
 *
 * PORT=3000
 *
 * AI_API_URL=https://...
 * AI_API_KEY=...
 * AI_MODEL=...
 *
 * SESSION_SECRET=...
 *
 * Не помещайте AI_API_KEY в index.html или script.js.
 * =========================================================
 */
const express = require("express");
const path = require("path");
const crypto = require("crypto");
const app = express();
/* =========================================================
   CONFIG
   ========================================================= */
const PORT = Number(process.env.PORT) || 3000;
const AI_API_URL =
  process.env.AI_API_URL || "";
const AI_API_KEY =
  process.env.AI_API_KEY || "";
const AI_MODEL =
  process.env.AI_MODEL || "";
const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  "change-this-session-secret";
/*
 * Ограничение размера обычного JSON-запроса.
 */
app.use(express.json({ limit: "2mb" }));
/*
 * Статические файлы Neuro Chat.
 */
app.use(
  express.static(
    path.join(__dirname)
  )
);
/* =========================================================
   SIMPLE DATABASE
   =========================================================
 *
 * Это временное серверное хранилище.
 *
 * Для Cloudflare Workers / serverless-развёртывания
 * его нельзя считать постоянной базой данных.
 *
 * Если твой текущий проект уже использует БД,
 * этот блок нужно заменить на неё.
 */
const users = new Map();
const sessions = new Map();
/* =========================================================
   HELPERS
   ========================================================= */
function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}
function isValidUsername(username) {
  /*
   * Разрешаем:
   * латинские буквы
   * цифры
   * .
   * _
   * -
   *
   * Минимум 3 символа.
   */
  return /^[a-zA-Z0-9._-]{3,40}$/.test(
    username
  );
}
function isValidPassword(password) {
  return (
    typeof password === "string" &&
    password.length >= 6 &&
    password.length <= 200
  );
}
function hashPassword(password, salt) {
  return crypto
    .pbkdf2Sync(
      password,
      salt,
      120000,
      64,
      "sha512"
    )
    .toString("hex");
}
function createPasswordRecord(password) {
  const salt =
    crypto.randomBytes(32).toString("hex");
  const hash =
    hashPassword(password, salt);
  return {
    salt,
    hash
  };
}
function verifyPassword(password, record) {
  const hash =
    hashPassword(
      password,
      record.salt
    );
  return crypto.timingSafeEqual(
    Buffer.from(hash, "hex"),
    Buffer.from(record.hash, "hex")
  );
}
function createSession(userId) {
  const sessionId =
    crypto.randomBytes(32).toString("hex");
  sessions.set(sessionId, {
    userId,
    createdAt: Date.now(),
    lastUsedAt: Date.now()
  });
  return sessionId;
}
function parseCookies(header) {
  const cookies = {};
  if (!header) {
    return cookies;
  }
  header
    .split(";")
    .forEach((part) => {
      const index = part.indexOf("=");
      if (index === -1) return;
      const key =
        part
          .slice(0, index)
          .trim();
      const value =
        part
          .slice(index + 1)
          .trim();
      cookies[key] =
        decodeURIComponent(value);
    });
  return cookies;
}
function getSession(req) {
  const cookies =
    parseCookies(
      req.headers.cookie
    );
  const sessionId =
    cookies.neuro_session;
  if (!sessionId) {
    return null;
  }
  const session =
    sessions.get(sessionId);
  if (!session) {
    return null;
  }
  const user =
    [...users.values()].find(
      (item) =>
        item.id === session.userId
    );
  if (!user) {
    sessions.delete(sessionId);
    return null;
  }
  session.lastUsedAt =
    Date.now();
  return {
    sessionId,
    session,
    user
  };
}
function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    name: user.name
  };
}
function setSessionCookie(
  res,
  sessionId
) {
  /*
   * HttpOnly:
   * JavaScript не может прочитать cookie.
   * SameSite=Lax:
   * защищает от части CSRF-сценариев.
   * Secure:
   * включаем на HTTPS.
   */
  const secure =
    process.env.NODE_ENV ===
      "production"
      ? "; Secure"
      : "";
  res.setHeader(
    "Set-Cookie",
    `neuro_session=${encodeURIComponent(
      sessionId
    )}; Path=/; HttpOnly; SameSite=Lax${secure}`
  );
}
function clearSessionCookie(res) {
  res.setHeader(
    "Set-Cookie",
    "neuro_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
  );
}
function sendError(
  res,
  status,
  message
) {
  return res.status(status).json({
    ok: false,
    error: message
  });
}
function cleanAIError(error) {
  if (!error) {
    return "Не удалось получить ответ от Neuro.";
  }
  const message =
    String(
      error.message ||
      error
    );
  /*
   * Не отправляем пользователю:
   * IP
   * stack trace
   * внутренние URL
   * технические данные
   */
  if (
    /ECONNREFUSED/i.test(message) ||
    /ENOTFOUND/i.test(message) ||
    /ECONNRESET/i.test(message)
  ) {
    return "AI-сервис временно недоступен. Попробуйте ещё раз.";
  }
  if (
    /fetch failed/i.test(message) ||
    /network/i.test(message)
  ) {
    return "Не удалось связаться с AI-сервисом. Попробуйте ещё раз.";
  }
  return "Не удалось получить ответ от Neuro.";
}
/* =========================================================
   AUTH MIDDLEWARE
   ========================================================= */
function requireAuth(
  req,
  res,
  next
) {
  const auth =
    getSession(req);
  if (!auth) {
    return sendError(
      res,
      401,
      "Требуется авторизация."
    );
  }
  req.user = auth.user;
  req.session = auth.session;
  next();
}
/* =========================================================
   AUTH — SESSION
   ========================================================= */
app.get(
  "/api/auth/session",
  (req, res) => {
    const auth =
      getSession(req);
    if (!auth) {
      return res.json({
        ok: true,
        authenticated: false
      });
    }
    return res.json({
      ok: true,
      authenticated: true,
      user: publicUser(
        auth.user
      )
    });
  }
);
/* =========================================================
   AUTH — REGISTER
   ========================================================= */
app.post(
  "/api/auth/register",
  (req, res) => {
    const username =
      normalizeUsername(
        req.body?.username
      );
    const password =
      req.body?.password;
    if (!isValidUsername(username)) {
      return sendError(
        res,
        400,
        "Логин должен содержать от 3 до 40 латинских букв, цифр, точек, дефисов или символов _."
      );
    }
    if (!isValidPassword(password)) {
      return sendError(
        res,
        400,
        "Пароль должен содержать минимум 6 символов."
      );
    }
    if (users.has(username)) {
      return sendError(
        res,
        409,
        "Пользователь с таким логином уже существует."
      );
    }
    const passwordRecord =
      createPasswordRecord(
        password
      );
    const user = {
      id: crypto.randomUUID(),
      username,
      name: username,
      ...passwordRecord,
      createdAt: Date.now()
    };
    users.set(
      username,
      user
    );
    const sessionId =
      createSession(
        user.id
      );
    setSessionCookie(
      res,
      sessionId
    );
    return res.status(201).json({
      ok: true,
      user: publicUser(user)
    });
  }
);
/* =========================================================
   AUTH — LOGIN
   ========================================================= */
app.post(
  "/api/auth/login",
  (req, res) => {
    const username =
      normalizeUsername(
        req.body?.username
      );
    const password =
      req.body?.password;
    if (
      !username ||
      !password
    ) {
      return sendError(
        res,
        400,
        "Введите логин и пароль."
      );
    }
    const user =
      users.get(username);
    if (!user) {
      return sendError(
        res,
        401,
        "Неверный логин или пароль."
      );
    }
    let valid = false;
    try {
      valid =
        verifyPassword(
          password,
          user
        );
    } catch {
      valid = false;
    }
    if (!valid) {
      return sendError(
        res,
        401,
        "Неверный логин или пароль."
      );
    }
    const sessionId =
      createSession(
        user.id
      );
    setSessionCookie(
      res,
      sessionId
    );
    return res.json({
      ok: true,
      user: publicUser(user)
    });
  }
);
/* =========================================================
   AUTH — LOGOUT
   ========================================================= */
app.post(
  "/api/auth/logout",
  (req, res) => {
    const cookies =
      parseCookies(
        req.headers.cookie
      );
    const sessionId =
      cookies.neuro_session;
    if (sessionId) {
      sessions.delete(
        sessionId
      );
    }
    clearSessionCookie(res);
    return res.json({
      ok: true
    });
  }
);
/* =========================================================
   AI
   ========================================================= */
async function askAI({
  messages,
  tool
}) {
  if (!AI_API_URL) {
    throw new Error(
      "AI_API_URL is not configured."
    );
  }
  if (!AI_API_KEY) {
    throw new Error(
      "AI_API_KEY is not configured."
    );
  }
  const controller =
    new AbortController();
  const timeout =
    setTimeout(
      () => controller.abort(),
      120000
    );
  try {
    /*
     * Формат запроса ниже соответствует
     * OpenAI-compatible Chat Completions API.
     * Если твой провайдер использует другой формат,
     * этот участок нужно адаптировать под его API.
     */
    const body = {
      model: AI_MODEL,
      messages
    };
    const response =
      await fetch(
        AI_API_URL,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
            "Authorization":
              `Bearer ${AI_API_KEY}`
          },
          body:
            JSON.stringify(body),
          signal:
            controller.signal
        }
      );
    const text =
      await response.text();
    let data = null;
    try {
      data =
        JSON.parse(text);
    } catch {
      data = null;
    }
    if (!response.ok) {
      console.error(
        "AI provider status:",
        response.status
      );
      throw new Error(
        "AI provider returned an error."
      );
    }
    /*
     * Поддерживаем несколько распространённых
     * вариантов ответа.
     */
    const answer =
      data?.choices?.[0]?.message?.content ||
      data?.choices?.[0]?.text ||
      data?.answer ||
      data?.response ||
      data?.content ||
      data?.text ||
      "";
    if (
      typeof answer !== "string" ||
      !answer.trim()
    ) {
      throw new Error(
        "AI provider returned an empty response."
      );
    }
    return answer.trim();
  } finally {
    clearTimeout(timeout);
  }
}
/* =========================================================
   CHAT
   ========================================================= */
app.post(
  "/api/chat",
  requireAuth,
  async (req, res) => {
    try {
      const message =
        typeof req.body?.message ===
        "string"
          ? req.body.message.trim()
          : "";
      if (!message) {
        return sendError(
          res,
          400,
          "Сообщение не может быть пустым."
        );
      }
      if (message.length > 12000) {
        return sendError(
          res,
          400,
          "Сообщение слишком длинное."
        );
      }
      const incomingMessages =
        Array.isArray(
          req.body?.messages
        )
          ? req.body.messages
          : [];
      /*
       * Защищаем сервер от слишком больших
       * или неправильных объектов истории.
       */
      const history =
        incomingMessages
          .filter(
            (item) =>
              item &&
              (
                item.role ===
                  "user" ||
                item.role ===
                  "assistant"
              ) &&
              typeof item.content ===
                "string"
          )
          .slice(-30)
          .map(
            (item) => ({
              role: item.role,
              content:
                item.content.slice(
                  0,
                  12000
                )
            })
          );
      const tool =
        typeof req.body?.tool ===
        "string"
          ? req.body.tool
          : null;
      const messages = [
        {
          role: "system",
          content:
            "Ты Neuro — интеллектуальный AI-помощник. Отвечай на русском языке, если пользователь пишет по-русски. Отвечай понятно, точно и полезно. Не утверждай то, чего не знаешь."
        },
        ...history
      ];
      /*
       * Не дублируем последнее сообщение,
       * если frontend уже передал его в history.
       */
      const last =
        messages[
          messages.length - 1
        ];
      if (
        !last ||
        last.role !== "user" ||
        last.content !== message
      ) {
        messages.push({
          role: "user",
          content: message
        });
      }
      if (tool) {
        messages[0].content +=
          `\nПользователь сейчас использует инструмент: ${tool}.`;
      }
      const answer =
        await askAI({
          messages,
          tool
        });
      return res.json({
        ok: true,
        answer
      });
    } catch (error) {
      console.error(
        "Chat error:",
        error
      );
      return sendError(
        res,
        502,
        cleanAIError(error)
      );
    }
  }
);
/* =========================================================
   HEALTH
   ========================================================= */
app.get(
  "/api/health",
  (req, res) => {
    res.json({
      ok: true,
      service: "Neuro Chat",
      aiConfigured:
        Boolean(
          AI_API_URL &&
          AI_API_KEY
        )
    });
  }
);
/* =========================================================
   SPA FALLBACK
   ========================================================= */
app.get(
  "*",
  (req, res, next) => {
    /*
     * API-маршруты сюда попадать не должны.
     */
    if (
      req.path.startsWith(
        "/api/"
      )
    ) {
      return next();
    }
    res.sendFile(
      path.join(
        __dirname,
        "index.html"
      )
    );
  }
);
/* =========================================================
   ERROR HANDLER
   ========================================================= */
app.use(
  (err, req, res, next) => {
    console.error(
      "Unhandled server error:",
      err
    );
    if (res.headersSent) {
      return next(err);
    }
    return sendError(
      res,
      500,
      "Внутренняя ошибка сервера."
    );
  }
);
/* =========================================================
   START
   ========================================================= */
app.listen(
  PORT,
  () => {
    console.log(
      `Neuro Chat server started on port ${PORT}`
    );
    if (!AI_API_URL) {
      console.warn(
        "AI_API_URL is not configured."
      );
    }
    if (!AI_API_KEY) {
      console.warn(
        "AI_API_KEY is not configured."
      );
    }
  }
);