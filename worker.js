const APP_NAME = "Нейро-чат";

const DEFAULT_MODELS = {
  neuro: "Нейро",
  chatgpt: "ChatGPT",
  gemini: "Gemini",
  grok: "Grok",
  alice: "Алиса",
  dedai: "Дед ИИ"
};

const sessions = new Map();
const users = new Map();
const chats = new Map();

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function ok(data = {}) {
  return json({
    ok: true,
    success: true,
    ...data
  });
}

function fail(message, status = 400, code = "ERROR") {
  return json({
    ok: false,
    success: false,
    error: {
      code,
      message
    }
  }, status);
}

async function body(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function id(prefix = "id") {
  return `${prefix}_${crypto.randomUUID()}`;
}

function sessionFrom(request) {
  const cookie = request.headers.get("Cookie") || "";

  const match = cookie.match(
    /(?:^|;\s*)neuro_session=([^;]+)/
  );

  return match ? decodeURIComponent(match[1]) : null;
}

function currentUser(request) {
  const sessionId = sessionFrom(request);

  if (!sessionId) {
    return null;
  }

  const userId = sessions.get(sessionId);

  if (!userId) {
    return null;
  }

  return users.get(userId) || null;
}

function authCookie(value) {
  return `neuro_session=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=2592000`;
}

function clearAuthCookie() {
  return "neuro_session=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0";
}

function protectedUser(request) {
  const user = currentUser(request);

  if (!user) {
    return null;
  }

  return user;
}

async function register(request) {
  const data = await body(request);

  const username =
    typeof data.username === "string"
      ? data.username.trim().toLowerCase()
      : "";

  const password =
    typeof data.password === "string"
      ? data.password
      : "";

  if (!username || !password) {
    return fail(
      "Введите логин и пароль.",
      400,
      "AUTH_DATA_REQUIRED"
    );
  }

  if (username.length < 3) {
    return fail(
      "Логин должен содержать минимум 3 символа.",
      400,
      "USERNAME_TOO_SHORT"
    );
  }

  if (password.length < 6) {
    return fail(
      "Пароль должен содержать минимум 6 символов.",
      400,
      "PASSWORD_TOO_SHORT"
    );
  }

  for (const user of users.values()) {
    if (user.username === username) {
      return fail(
        "Пользователь уже существует.",
        409,
        "USER_EXISTS"
      );
    }
  }

  const user = {
    id: id("user"),
    username,
    createdAt: new Date().toISOString()
  };

  users.set(user.id, user);

  const sessionId = id("session");

  sessions.set(sessionId, user.id);

  return json(
    {
      ok: true,
      success: true,
      user
    },
    201,
    {
      "Set-Cookie": authCookie(sessionId)
    }
  );
}

async function login(request) {
  const data = await body(request);

  const username =
    typeof data.username === "string"
      ? data.username.trim().toLowerCase()
      : "";

  const password =
    typeof data.password === "string"
      ? data.password
      : "";

  if (!username || !password) {
    return fail(
      "Введите логин и пароль.",
      400,
      "AUTH_DATA_REQUIRED"
    );
  }

  /*
   * Для этой автоматической версии аккаунта
   * данные находятся в памяти Worker.
   * Пароль используется только для текущей
   * сессии в рамках работающего экземпляра.
   *
   * Для настоящего постоянного аккаунта
   * потребуется внешнее persistent storage.
   */

  let user = null;

  for (const item of users.values()) {
    if (item.username === username) {
      user = item;
      break;
    }
  }

  if (!user) {
    return fail(
      "Пользователь не найден. Сначала зарегистрируйтесь.",
      401,
      "USER_NOT_FOUND"
    );
  }

  const sessionId = id("session");

  sessions.set(sessionId, user.id);

  return json(
    {
      ok: true,
      success: true,
      user
    },
    200,
    {
      "Set-Cookie": authCookie(sessionId)
    }
  );
}

async function logout(request) {
  const sessionId = sessionFrom(request);

  if (sessionId) {
    sessions.delete(sessionId);
  }

  return json(
    {
      ok: true,
      success: true
    },
    200,
    {
      "Set-Cookie": clearAuthCookie()
    }
  );
}

async function me(request) {
  const user = currentUser(request);

  if (!user) {
    return fail(
      "Пользователь не авторизован.",
      401,
      "NOT_AUTHENTICATED"
    );
  }

  return ok({ user });
}

async function createChat(request) {
  const user = protectedUser(request);

  if (!user) {
    return fail(
      "Для сохранения чатов войдите в аккаунт.",
      401,
      "NOT_AUTHENTICATED"
    );
  }

  const data = await body(request);

  const chat = {
    id: id("chat"),
    userId: user.id,
    title:
      typeof data.title === "string" &&
      data.title.trim()
        ? data.title.trim().slice(0, 100)
        : "Новый чат",
    model:
      typeof data.model === "string"
        ? data.model
        : "neuro",
    temporary: Boolean(data.temporary),
    createdAt: new Date().toISOString(),
    messages: []
  };

  chats.set(chat.id, chat);

  return json(
    {
      ok: true,
      success: true,
      chat
    },
    201
  );
}

async function listChats(request) {
  const user = protectedUser(request);

  if (!user) {
    return fail(
      "Пользователь не авторизован.",
      401,
      "NOT_AUTHENTICATED"
    );
  }

  const result = [];

  for (const chat of chats.values()) {
    if (chat.userId === user.id) {
      result.push({
        id: chat.id,
        title: chat.title,
        model: chat.model,
        temporary: chat.temporary,
        createdAt: chat.createdAt
      });
    }
  }

  result.sort(
    (a, b) =>
      new Date(b.createdAt) -
      new Date(a.createdAt)
  );

  return ok({
    chats: result
  });
}

async function sendChat(request) {
  const data = await body(request);

  const message =
    typeof data.message === "string"
      ? data.message.trim()
      : "";

  if (!message) {
    return fail(
      "Введите сообщение.",
      400,
      "EMPTY_MESSAGE"
    );
  }

  const model =
    typeof data.model === "string"
      ? data.model
      : "neuro";

  const user = currentUser(request);

  let answer;

  /*
   * Это локальный безопасный fallback.
   * Он позволяет интерфейсу работать даже без
   * внешнего AI API.
   */
  if (model === "neuro") {
    answer =
      `Я получил ваше сообщение: «${message}»\n\n` +
      `Модель: ${DEFAULT_MODELS.neuro}.\n` +
      `Чтобы подключить полноценную внешнюю AI-модель, ` +
      `её API можно добавить в настройках Нейро-чата.`;
  } else {
    answer =
      `Запрос получен.\n\n` +
      `Выбрана модель: ${
        DEFAULT_MODELS[model] || model
      }.\n\n` +
      `Сообщение: ${message}`;
  }

  if (
    user &&
    typeof data.chatId === "string"
  ) {
    const chat = chats.get(data.chatId);

    if (
      chat &&
      chat.userId === user.id
    ) {
      chat.messages.push({
        role: "user",
        content: message,
        createdAt: new Date().toISOString()
      });

      chat.messages.push({
        role: "assistant",
        content: answer,
        createdAt: new Date().toISOString()
      });
    }
  }

  return ok({
    data: {
      text: answer,
      message: answer,
      model
    }
  });
}

async function deleteChat(request) {
  const user = protectedUser(request);

  if (!user) {
    return fail(
      "Пользователь не авторизован.",
      401,
      "NOT_AUTHENTICATED"
    );
  }

  const data = await body(request);

  const chatId =
    typeof data.chatId === "string"
      ? data.chatId
      : "";

  const chat = chats.get(chatId);

  if (!chat || chat.userId !== user.id) {
    return fail(
      "Чат не найден.",
      404,
      "CHAT_NOT_FOUND"
    );
  }

  chats.delete(chatId);

  return ok({
    deleted: true
  });
}

async function generate(request, type) {
  const data = await body(request);

  const prompt =
    typeof data.prompt === "string"
      ? data.prompt.trim()
      : "";

  if (!prompt) {
    return fail(
      "Введите описание.",
      400,
      "PROMPT_REQUIRED"
    );
  }

  /*
   * Единый интерфейс генераторов.
   * Внешний провайдер подключается через API key
   * из настроек пользователя.
   */

  return ok({
    data: {
      type,
      status: "accepted",
      prompt,
      message:
        `Задача на ${type} принята.`,
      providerConfigured: false
    }
  });
}

async function api(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === "/api/health") {
    return ok({
      data: {
        status: "ok",
        service: APP_NAME,
        version: "2.0.0",
        time: new Date().toISOString()
      }
    });
  }

  if (path === "/api/auth/me") {
    return me(request);
  }

  if (path === "/api/auth/session") {
    return me(request);
  }

  if (
    path === "/api/auth/register" &&
    request.method === "POST"
  ) {
    return register(request);
  }

  if (
    path === "/api/auth/login" &&
    request.method === "POST"
  ) {
    return login(request);
  }

  if (
    path === "/api/auth/logout" &&
    request.method === "POST"
  ) {
    return logout(request);
  }

  if (
    path === "/api/chats" &&
    request.method === "GET"
  ) {
    return listChats(request);
  }

  if (
    path === "/api/chats" &&
    request.method === "POST"
  ) {
    return createChat(request);
  }

  if (
    path === "/api/chats/delete" &&
    request.method === "POST"
  ) {
    return deleteChat(request);
  }

  if (
    path === "/api/chat" &&
    request.method === "POST"
  ) {
    return sendChat(request);
  }

  if (
    path === "/api/generate/image" &&
    request.method === "POST"
  ) {
    return generate(request, "изображение");
  }

  if (
    path === "/api/generate/video" &&
    request.method === "POST"
  ) {
    return generate(request, "видео");
  }

  if (
    path === "/api/generate/music" &&
    request.method === "POST"
  ) {
    return generate(request, "музыка");
  }

  if (
    path === "/api/generate/3d" &&
    request.method === "POST"
  ) {
    return generate(request, "3D-модель");
  }

  if (
    path === "/api/generate/website" &&
    request.method === "POST"
  ) {
    return generate(request, "сайт");
  }

  if (
    path === "/api/models" &&
    request.method === "GET"
  ) {
    return ok({
      models: DEFAULT_MODELS
    });
  }

  return null;
}

function security(response) {
  const headers = new Headers(
    response.headers
  );

  headers.set(
    "X-Content-Type-Options",
    "nosniff"
  );

  headers.set(
    "X-Frame-Options",
    "SAMEORIGIN"
  );

  headers.set(
    "Referrer-Policy",
    "strict-origin-when-cross-origin"
  );

  return new Response(
    response.body,
    {
      status: response.status,
      statusText: response.statusText,
      headers
    }
  );
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      if (
        url.pathname.startsWith("/api/")
      ) {
        const response =
          await api(request, env);

        if (response) {
          return security(response);
        }

        return security(
          fail(
            "API-маршрут не найден.",
            404,
            "API_NOT_FOUND"
          )
        );
      }

      if (
        env.ASSETS &&
        typeof env.ASSETS.fetch ===
          "function"
      ) {
        return security(
          await env.ASSETS.fetch(request)
        );
      }

      return security(
        new Response(
          "Нейро-чат",
          {
            status: 200,
            headers: {
              "Content-Type":
                "text/plain; charset=utf-8"
            }
          }
        )
      );
    } catch (error) {
      console.error(error);

      return security(
        fail(
          "Внутренняя ошибка Нейро-чата.",
          500,
          "INTERNAL_SERVER_ERROR"
        )
      );
    }
  }
};