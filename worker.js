import { routeRequest } from "./router.js";

import {
  auth,
} from "./auth.js";

import {
  ensureDatabase,
  createChat,
  listChats,
  getChat,
  renameChat,
  deleteChat,
  createMessage,
  listMessages,
  createFile,
  databaseHealth,
} from "./database.js";

import {
  chat,
  generateImage,
  generateVideo,
  generateMusic,
  generate3D,
  getAIStatus,
} from "./ai.js";

const SERVICE_NAME = "neuro-chat";

const PROTECTED_FILES = new Set([
  "/worker.js",
  "/router.js",
  "/auth.js",
  "/database.js",
  "/ai.js",
  "/wrangler.jsonc",
  "/package.json",
  "/.gitignore",
]);

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

function error(message, status = 500, code = "INTERNAL_ERROR") {
  return json(
    {
      ok: false,
      success: false,
      error: {
        code,
        message,
      },
    },
    status,
  );
}

function success(data = {}, status = 200) {
  return json(
    {
      ok: true,
      success: true,
      ...data,
    },
    status,
  );
}

async function readJson(request) {
  try {
    const contentType =
      request.headers.get("content-type") || "";

    if (
      !contentType
        .toLowerCase()
        .includes("application/json")
    ) {
      return {};
    }

    const body = await request.json();

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      return {};
    }

    return body;
  } catch {
    return {};
  }
}

async function currentUser(request, env) {
  try {
    return await auth.getCurrentUser(request, env);
  } catch {
    return null;
  }
}

async function requireUser(request, env) {
  const result =
    await auth.requireUser(request, env);

  if (!result.ok) {
    return {
      ok: false,
      response: result.response,
      user: null,
    };
  }

  return {
    ok: true,
    response: null,
    user: result.user,
  };
}

/* -------------------------------------------------------------------------- */
/* AUTH                                                                       */
/* -------------------------------------------------------------------------- */

async function authMe(request, env) {
  if (request.method !== "GET") {
    return error(
      "Метод не поддерживается.",
      405,
      "METHOD_NOT_ALLOWED",
    );
  }

  const user =
    await currentUser(request, env);

  if (!user) {
    return json(
      {
        ok: false,
        success: false,
        user: null,
      },
      401,
    );
  }

  return success({
    user: {
      id: user.id,
      username: user.username,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    },
  });
}

/* -------------------------------------------------------------------------- */
/* CHATS                                                                       */
/* -------------------------------------------------------------------------- */

async function chatsList(request, env) {
  const access =
    await requireUser(request, env);

  if (!access.ok) {
    return access.response;
  }

  const chats =
    await listChats(
      env,
      access.user.id,
      100,
    );

  return success({
    chats,
  });
}

async function chatsCreate(request, env) {
  const access =
    await requireUser(request, env);

  if (!access.ok) {
    return access.response;
  }

  const body =
    await readJson(request);

  const title =
    typeof body.title === "string" &&
    body.title.trim()
      ? body.title.trim().slice(0, 120)
      : "Новый чат";

  const model =
    typeof body.model === "string"
      ? body.model.trim()
      : "neuro";

  const temporary =
    Boolean(body.temporary);

  const chatRecord =
    await createChat(env, {
      userId: access.user.id,
      title,
      model,
      temporary,
    });

  return success(
    {
      chat: chatRecord,
    },
    201,
  );
}

async function chatsRename(request, env) {
  const access =
    await requireUser(request, env);

  if (!access.ok) {
    return access.response;
  }

  const body =
    await readJson(request);

  const chatId =
    typeof body.chatId === "string"
      ? body.chatId.trim()
      : "";

  const title =
    typeof body.title === "string"
      ? body.title.trim()
      : "";

  if (!chatId || !title) {
    return error(
      "Не указан чат или новое название.",
      400,
      "INVALID_CHAT_DATA",
    );
  }

  const result =
    await renameChat(
      env,
      chatId,
      access.user.id,
      title.slice(0, 120),
    );

  if (!result) {
    return error(
      "Чат не найден.",
      404,
      "CHAT_NOT_FOUND",
    );
  }

  return success({
    chat: result,
  });
}

async function chatsDelete(request, env) {
  const access =
    await requireUser(request, env);

  if (!access.ok) {
    return access.response;
  }

  const body =
    await readJson(request);

  const chatId =
    typeof body.chatId === "string"
      ? body.chatId.trim()
      : "";

  if (!chatId) {
    return error(
      "Не указан чат.",
      400,
      "CHAT_ID_REQUIRED",
    );
  }

  const deleted =
    await deleteChat(
      env,
      chatId,
      access.user.id,
    );

  if (!deleted) {
    return error(
      "Чат не найден.",
      404,
      "CHAT_NOT_FOUND",
    );
  }

  return success({
    deleted: true,
    chatId,
  });
}

/* -------------------------------------------------------------------------- */
/* CHAT                                                                        */
/* -------------------------------------------------------------------------- */

async function chatHandler(request, env) {
  if (request.method !== "POST") {
    return error(
      "Метод не поддерживается.",
      405,
      "METHOD_NOT_ALLOWED",
    );
  }

  const body =
    await readJson(request);

  const message =
    typeof body.message === "string"
      ? body.message.trim()
      : "";

  if (!message) {
    return error(
      "Введите сообщение.",
      400,
      "EMPTY_MESSAGE",
    );
  }

  const model =
    typeof body.model === "string"
      ? body.model
      : "neuro";

  const messages =
    Array.isArray(body.messages) &&
    body.messages.length
      ? body.messages
      : [
          {
            role: "user",
            content: message,
          },
        ];

  const result =
    await chat(env, {
      model,
      messages,
      systemPrompt:
        typeof body.systemPrompt === "string"
          ? body.systemPrompt
          : undefined,
      maxOutputTokens:
        Number.isInteger(
          body.maxOutputTokens,
        )
          ? Math.min(
              Math.max(
                body.maxOutputTokens,
                128,
              ),
              4096,
            )
          : 2048,
    });

  const user =
    await currentUser(request, env);

  /*
   * Если пользователь вошёл и передал chatId,
   * сохраняем сообщения в D1.
   */
  if (user && typeof body.chatId === "string") {
    const chatId =
      body.chatId.trim();

    if (chatId) {
      const ownedChat =
        await getChat(
          env,
          chatId,
          user.id,
        );

      if (ownedChat) {
        await createMessage(env, {
          chatId,
          userId: user.id,
          role: "user",
          content: message,
          model,
        });

        await createMessage(env, {
          chatId,
          userId: user.id,
          role: "assistant",
          content: result.text,
          model,
        });
      }
    }
  }

  return success({
    data: {
      text: result.text,
      message: result.text,
      model,
      provider:
        result.provider || null,
      providerModel:
        result.model || null,
      responseId:
        result.responseId || null,
    },
  });
}

/* -------------------------------------------------------------------------- */
/* GENERATION                                                                  */
/* -------------------------------------------------------------------------- */

async function generation(
  request,
  env,
  generator,
) {
  if (request.method !== "POST") {
    return error(
      "Метод не поддерживается.",
      405,
      "METHOD_NOT_ALLOWED",
    );
  }

  const body =
    await readJson(request);

  const result =
    await generator(env, body);

  return success({
    data: result,
  });
}

/* -------------------------------------------------------------------------- */
/* FILES                                                                       */
/* -------------------------------------------------------------------------- */

async function filesUpload(request, env) {
  if (request.method !== "POST") {
    return error(
      "Метод не поддерживается.",
      405,
      "METHOD_NOT_ALLOWED",
    );
  }

  const access =
    await requireUser(request, env);

  if (!access.ok) {
    return access.response;
  }

  const body =
    await readJson(request);

  const filename =
    typeof body.filename === "string"
      ? body.filename.trim()
      : "";

  if (!filename) {
    return error(
      "Не указано имя файла.",
      400,
      "FILENAME_REQUIRED",
    );
  }

  const file =
    await createFile(env, {
      userId: access.user.id,
      chatId:
        typeof body.chatId === "string"
          ? body.chatId
          : null,
      filename: filename.slice(0, 255),
      contentType:
        typeof body.contentType === "string"
          ? body.contentType
          : null,
      size:
        Number.isFinite(body.size)
          ? Math.max(0, Number(body.size))
          : 0,
      storageKey:
        typeof body.storageKey === "string"
          ? body.storageKey
          : null,
    });

  return success({
    file,
  });
}

/* -------------------------------------------------------------------------- */
/* HEALTH                                                                      */
/* -------------------------------------------------------------------------- */

async function health(request, env) {
  if (request.method !== "GET") {
    return error(
      "Метод не поддерживается.",
      405,
      "METHOD_NOT_ALLOWED",
    );
  }

  let database = false;

  try {
    database =
      await databaseHealth(env);
  } catch {
    database = false;
  }

  return success({
    data: {
      status: "ok",
      service: SERVICE_NAME,
      database,
      ai: getAIStatus(env),
      timestamp:
        new Date().toISOString(),
    },
  });
}

/* -------------------------------------------------------------------------- */
/* HANDLERS                                                                    */
/* -------------------------------------------------------------------------- */

function createHandlers() {
  return {
    auth: {
      me: authMe,
      login: auth.login,
      register: auth.register,
      logout: auth.logout,
    },

    chats: {
      list: chatsList,
      create: chatsCreate,
      rename: chatsRename,
      delete: chatsDelete,
    },

    chat: {
      send: chatHandler,
    },

    generate: {
      image: (request, env) =>
        generation(
          request,
          env,
          generateImage,
        ),

      video: (request, env) =>
        generation(
          request,
          env,
          generateVideo,
        ),

      music: (request, env) =>
        generation(
          request,
          env,
          generateMusic,
        ),

      model3d: (request, env) =>
        generation(
          request,
          env,
          generate3D,
        ),
    },

    files: {
      upload: filesUpload,
    },

    health,
  };
}

/* -------------------------------------------------------------------------- */
/* SECURITY                                                                    */
/* -------------------------------------------------------------------------- */

function securityHeaders(response) {
  const headers =
    new Headers(response.headers);

  headers.set(
    "X-Content-Type-Options",
    "nosniff",
  );

  headers.set(
    "X-Frame-Options",
    "DENY",
  );

  headers.set(
    "Referrer-Policy",
    "strict-origin-when-cross-origin",
  );

  headers.set(
    "Permissions-Policy",
    "camera=(), geolocation=(), microphone=(self)",
  );

  return new Response(
    response.body,
    {
      status: response.status,
      statusText: response.statusText,
      headers,
    },
  );
}

function isDangerousPath(pathname) {
  const path =
    pathname.toLowerCase();

  return (
    path.includes("/.git/") ||
    path.startsWith("/.env") ||
    path.includes("/node_modules/")
  );
}

/* -------------------------------------------------------------------------- */
/* DATABASE INITIALIZATION                                                     */
/* -------------------------------------------------------------------------- */

async function initializeDatabase(env) {
  if (!env?.DB) {
    return;
  }

  try {
    await ensureDatabase(env);
  } catch (databaseError) {
    console.error(
      "D1 initialization error:",
      databaseError,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* WORKER                                                                      */
/* -------------------------------------------------------------------------- */

export default {
  async fetch(
    request,
    env,
    ctx,
  ) {
    const url =
      new URL(request.url);

    try {
      if (
        isDangerousPath(
          url.pathname,
        )
      ) {
        return securityHeaders(
          new Response(
            "Not Found",
            {
              status: 404,
            },
          ),
        );
      }

      if (
        PROTECTED_FILES.has(
          url.pathname,
        )
      ) {
        return securityHeaders(
          new Response(
            "Not Found",
            {
              status: 404,
            },
          ),
        );
      }

      /*
       * Инициализация D1.
       * waitUntil не блокирует отдачу
       * обычных статических страниц.
       */
      if (env?.DB) {
        ctx.waitUntil(
          initializeDatabase(env),
        );
      }

      if (
        url.pathname ===
        "/api/health"
      ) {
        return securityHeaders(
          await health(
            request,
            env,
          ),
        );
      }

      if (
        url.pathname ===
        "/api/ai/status"
      ) {
        if (
          request.method !== "GET"
        ) {
          return securityHeaders(
            error(
              "Метод не поддерживается.",
              405,
              "METHOD_NOT_ALLOWED",
            ),
          );
        }

        return securityHeaders(
          success({
            data:
              getAIStatus(env),
          }),
        );
      }

      if (
        url.pathname.startsWith(
          "/api/",
        )
      ) {
        const response =
          await routeRequest(
            request,
            env,
            ctx,
            createHandlers(),
          );

        if (response) {
          return securityHeaders(
            response,
          );
        }

        return securityHeaders(
          error(
            "API-маршрут не найден.",
            404,
            "API_NOT_FOUND",
          ),
        );
      }

      /*
       * Все обычные запросы отдаём
       * через Cloudflare Assets.
       */
      if (
        env?.ASSETS &&
        typeof env.ASSETS.fetch ===
          "function"
      ) {
        const assetResponse =
          await env.ASSETS.fetch(
            request,
          );

        return securityHeaders(
          assetResponse,
        );
      }

      return securityHeaders(
        error(
          "Cloudflare Assets не настроены.",
          500,
          "ASSETS_NOT_CONFIGURED",
        ),
      );
    } catch (caughtError) {
      console.error(
        "Worker error:",
        caughtError,
      );

      return securityHeaders(
        error(
          caughtError?.message ||
            "Внутренняя ошибка сервера.",
          Number.isInteger(
            caughtError?.status,
          )
            ? caughtError.status
            : 500,
          caughtError?.code ||
            "INTERNAL_SERVER_ERROR",
        ),
      );
    }
  },
};