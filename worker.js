import {
  routeRequest,
} from "./router.js";

import {
  chat,
  generateImage,
  generateVideo,
  generateMusic,
  generate3D,
  getAIStatus,
} from "./ai.js";

/* -------------------------------------------------------------------------- */
/* Основные настройки                                                         */
/* -------------------------------------------------------------------------- */

const SERVICE_NAME = "neuro-chat";

const PROTECTED_SOURCE_FILES = new Set([
  "/worker.js",
  "/router.js",
  "/database.js",
  "/auth.js",
  "/ai.js",
  "/package.json",
  "/wrangler.jsonc",
  "/.gitignore",
]);

/* -------------------------------------------------------------------------- */
/* JSON                                                                       */
/* -------------------------------------------------------------------------- */

function json(data, status = 200, extraHeaders = {}) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });

  return new Response(
    JSON.stringify(data),
    {
      status,
      headers,
    },
  );
}

/* -------------------------------------------------------------------------- */
/* Ошибки                                                                     */
/* -------------------------------------------------------------------------- */

function normalizeError(error) {
  const status =
    Number.isInteger(error?.status) &&
    error.status >= 400 &&
    error.status <= 599
      ? error.status
      : 500;

  return {
    status,
    code:
      typeof error?.code === "string" &&
      error.code
        ? error.code
        : "INTERNAL_SERVER_ERROR",

    message:
      typeof error?.message === "string" &&
      error.message
        ? error.message
        : "Внутренняя ошибка сервера.",
  };
}

async function safe(handler) {
  try {
    return await handler();
  } catch (error) {
    const normalized =
      normalizeError(error);

    return json(
      {
        success: false,
        error: {
          code: normalized.code,
          message: normalized.message,
        },
      },
      normalized.status,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Безопасность HTTP                                                          */
/* -------------------------------------------------------------------------- */

function addSecurityHeaders(response) {
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

/* -------------------------------------------------------------------------- */
/* Чтение тела запроса                                                        */
/* -------------------------------------------------------------------------- */

async function readBody(request) {
  const contentType =
    request.headers.get(
      "content-type",
    ) || "";

  if (
    contentType
      .toLowerCase()
      .includes("application/json")
  ) {
    try {
      return await request.json();
    } catch {
      const error =
        new Error(
          "Некорректный JSON в запросе.",
        );

      error.code =
        "INVALID_JSON";

      error.status = 400;

      throw error;
    }
  }

  const text =
    await request.text();

  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      message: text,
    };
  }
}

/* -------------------------------------------------------------------------- */
/* AI: обычный чат                                                            */
/* -------------------------------------------------------------------------- */

async function chatHandler(
  request,
  env,
) {
  if (request.method !== "POST") {
    return json(
      {
        success: false,
        error: {
          code:
            "METHOD_NOT_ALLOWED",
          message:
            "Метод не поддерживается.",
        },
      },
      405,
      {
        Allow: "POST",
      },
    );
  }

  const body =
    await readBody(request);

  const message =
    typeof body.message === "string"
      ? body.message.trim()
      : "";

  if (!message) {
    return json(
      {
        success: false,
        error: {
          code: "EMPTY_MESSAGE",
          message:
            "Введите сообщение.",
        },
      },
      400,
    );
  }

  /*
   * Если frontend передал полную историю,
   * используем её.
   *
   * Если истории нет, отправляем текущее
   * сообщение как первое сообщение.
   */

  let messages;

  if (
    Array.isArray(body.messages) &&
    body.messages.length > 0
  ) {
    messages = body.messages;
  } else {
    messages = [
      {
        role: "user",
        content: message,
      },
    ];
  }

  const result =
    await chat(env, {
      model:
        typeof body.model === "string"
          ? body.model
          : "neuro",

      messages,

      systemPrompt:
        typeof body.systemPrompt ===
          "string"
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

  return json({
    success: true,

    data: {
      text: result.text,

      message: result.text,

      model:
        typeof body.model === "string"
          ? body.model
          : "neuro",

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
/* Генерация                                                                  */
/* -------------------------------------------------------------------------- */

async function generationHandler(
  request,
  env,
  generator,
) {
  if (request.method !== "POST") {
    return json(
      {
        success: false,
        error: {
          code:
            "METHOD_NOT_ALLOWED",
          message:
            "Метод не поддерживается.",
        },
      },
      405,
      {
        Allow: "POST",
      },
    );
  }

  const body =
    await readBody(request);

  const result =
    await generator(
      env,
      body,
    );

  return json({
    success: true,
    data: result,
  });
}

/* -------------------------------------------------------------------------- */
/* API handlers                                                               */
/* -------------------------------------------------------------------------- */

function createHandlers() {
  return {
    chat: {
      send: async (
        request,
        env,
        ctx,
      ) =>
        safe(() =>
          chatHandler(
            request,
            env,
            ctx,
          ),
        ),
    },

    generate: {
      image: async (
        request,
        env,
      ) =>
        safe(() =>
          generationHandler(
            request,
            env,
            generateImage,
          ),
        ),

      video: async (
        request,
        env,
      ) =>
        safe(() =>
          generationHandler(
            request,
            env,
            generateVideo,
          ),
        ),

      music: async (
        request,
        env,
      ) =>
        safe(() =>
          generationHandler(
            request,
            env,
            generateMusic,
          ),
        ),

      "3d": async (
        request,
        env,
      ) =>
        safe(() =>
          generationHandler(
            request,
            env,
            generate3D,
          ),
        ),
    },

    ai: {
      status: async (
        request,
        env,
      ) => {
        if (
          request.method !== "GET"
        ) {
          return json(
            {
              success: false,
              error: {
                code:
                  "METHOD_NOT_ALLOWED",
                message:
                  "Метод не поддерживается.",
              },
            },
            405,
            {
              Allow: "GET",
            },
          );
        }

        return json({
          success: true,
          data: getAIStatus(env),
        });
      },
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Защита серверных файлов                                                    */
/* -------------------------------------------------------------------------- */

function isProtectedSource(
  pathname,
) {
  return PROTECTED_SOURCE_FILES.has(
    pathname,
  );
}

function isDangerousPath(
  pathname,
) {
  const lower =
    pathname.toLowerCase();

  return (
    lower.includes("/.git/") ||
    lower.startsWith("/.env") ||
    lower.includes("/node_modules/")
  );
}

/* -------------------------------------------------------------------------- */
/* API                                                                        */
/* -------------------------------------------------------------------------- */

async function handleApi(
  request,
  env,
  ctx,
) {
  const handlers =
    createHandlers();

  return routeRequest(
    request,
    env,
    ctx,
    handlers,
  );
}

/* -------------------------------------------------------------------------- */
/* Health                                                                     */
/* -------------------------------------------------------------------------- */

function healthResponse() {
  return json({
    success: true,

    data: {
      status: "ok",
      service: SERVICE_NAME,
      timestamp:
        new Date().toISOString(),
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Главный Worker                                                             */
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
      /* -------------------------------------------------------------- */
      /* Блокируем опасные пути                                         */
      /* -------------------------------------------------------------- */

      if (
        isDangerousPath(
          url.pathname,
        )
      ) {
        return new Response(
          "Not Found",
          {
            status: 404,
          },
        );
      }

      /* -------------------------------------------------------------- */
      /* Не отдаём серверный код браузеру                               */
      /* -------------------------------------------------------------- */

      if (
        isProtectedSource(
          url.pathname,
        )
      ) {
        return new Response(
          "Not Found",
          {
            status: 404,
          },
        );
      }

      /* -------------------------------------------------------------- */
      /* Health                                                         */
      /* -------------------------------------------------------------- */

      if (
        url.pathname ===
        "/api/health"
      ) {
        return addSecurityHeaders(
          healthResponse(),
        );
      }

      /* -------------------------------------------------------------- */
      /* AI status                                                      */
      /* -------------------------------------------------------------- */

      if (
        url.pathname ===
        "/api/ai/status"
      ) {
        return addSecurityHeaders(
          await safe(() =>
            json({
              success: true,
              data: getAIStatus(
                env,
              ),
            }),
          ),
        );
      }

      /* -------------------------------------------------------------- */
      /* API                                                            */
      /* -------------------------------------------------------------- */

      if (
        url.pathname.startsWith(
          "/api/",
        )
      ) {
        const response =
          await handleApi(
            request,
            env,
            ctx,
          );

        if (response) {
          return addSecurityHeaders(
            response,
          );
        }

        return addSecurityHeaders(
          json(
            {
              success: false,
              error: {
                code:
                  "API_NOT_FOUND",
                message:
                  "API-маршрут не найден.",
              },
            },
            404,
          ),
        );
      }

      /* -------------------------------------------------------------- */
      /* Статический сайт                                               */
      /* -------------------------------------------------------------- */

      if (
        env?.ASSETS &&
        typeof env.ASSETS.fetch ===
          "function"
      ) {
        const response =
          await env.ASSETS.fetch(
            request,
          );

        return addSecurityHeaders(
          response,
        );
      }

      /* -------------------------------------------------------------- */
      /* Нет ASSETS                                                     */
      /* -------------------------------------------------------------- */

      return addSecurityHeaders(
        json(
          {
            success: false,
            error: {
              code:
                "ASSETS_NOT_CONFIGURED",
              message:
                "Статические файлы Cloudflare Assets не настроены.",
            },
          },
          500,
        ),
      );
    } catch (error) {
      const normalized =
        normalizeError(error);

      return addSecurityHeaders(
        json(
          {
            success: false,

            error: {
              code:
                normalized.code,

              message:
                normalized.message,
            },
          },
          normalized.status,
        ),
      );
    }
  },
};