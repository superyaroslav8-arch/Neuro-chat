/**
 * Нейро-чат
 * router.js
 *
 * Центральная маршрутизация API.
 *
 * ВАЖНО:
 * - Этот файл не отвечает за HTML.
 * - Все API-ошибки возвращаются в JSON.
 * - Методы проверяются до передачи запроса обработчику.
 * - Следующие модули (#5–#8) подключаются через переданный объект handlers.
 */

/**
 * Создаёт JSON-ответ.
 *
 * @param {unknown} data
 * @param {number} status
 * @param {HeadersInit} extraHeaders
 * @returns {Response}
 */
export function jsonResponse(data, status = 200, extraHeaders = {}) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=UTF-8",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });

  return new Response(JSON.stringify(data), {
    status,
    headers,
  });
}

/**
 * Создаёт стандартный API-ответ с ошибкой.
 *
 * @param {string} message
 * @param {number} status
 * @param {string} [code]
 * @param {unknown} [details]
 * @returns {Response}
 */
export function errorResponse(
  message,
  status = 500,
  code = "INTERNAL_ERROR",
  details = undefined,
) {
  const body = {
    ok: false,
    error: {
      code,
      message,
    },
  };

  if (details !== undefined) {
    body.error.details = details;
  }

  return jsonResponse(body, status);
}

/**
 * Создаёт стандартный успешный API-ответ.
 *
 * @param {unknown} data
 * @param {number} status
 * @returns {Response}
 */
export function successResponse(data = {}, status = 200) {
  return jsonResponse(
    {
      ok: true,
      ...data,
    },
    status,
  );
}

/**
 * Проверяет, является ли запрос API-запросом.
 *
 * @param {URL} url
 * @returns {boolean}
 */
export function isApiRequest(url) {
  return url.pathname === "/api" || url.pathname.startsWith("/api/");
}

/**
 * Нормализует HTTP-метод.
 *
 * @param {Request} request
 * @returns {string}
 */
function getMethod(request) {
  return request.method.toUpperCase();
}

/**
 * Безопасно получает путь.
 *
 * @param {Request} request
 * @returns {string}
 */
function getPath(request) {
  try {
    return new URL(request.url).pathname;
  } catch {
    return "";
  }
}

/**
 * Проверяет разрешённый HTTP-метод.
 *
 * @param {Request} request
 * @param {string[]} methods
 * @returns {Response|null}
 */
function checkMethod(request, methods) {
  const method = getMethod(request);

  if (methods.includes(method)) {
    return null;
  }

  return errorResponse(
    `Метод ${method} не поддерживается для этого API-маршрута.`,
    405,
    "METHOD_NOT_ALLOWED",
    {
      allowedMethods: methods,
    },
  );
}

/**
 * Вызывает обработчик и преобразует неожиданные ошибки
 * в нормальный JSON-ответ.
 *
 * @param {Function} handler
 * @param {Request} request
 * @param {object} env
 * @param {object} ctx
 * @returns {Promise<Response>}
 */
async function executeHandler(handler, request, env, ctx) {
  try {
    const result = await handler(request, env, ctx);

    if (result instanceof Response) {
      return result;
    }

    return successResponse(
      result && typeof result === "object"
        ? result
        : { data: result },
    );
  } catch (error) {
    console.error("API handler error:", error);

    const message =
      error instanceof Error && error.message
        ? error.message
        : "Внутренняя ошибка сервера.";

    return errorResponse(
      message,
      500,
      "INTERNAL_ERROR",
    );
  }
}

/**
 * Возвращает обработчик маршрута.
 *
 * Все обработчики будут реализованы в следующих файлах:
 *
 * #5 database.js
 * #6 auth.js
 * #7 ai.js
 * #8 worker.js
 *
 * @param {string} path
 * @param {string} method
 * @param {object} handlers
 * @returns {{ handler: Function, methods: string[] }|null}
 */
function resolveRoute(path, method, handlers) {
  const routes = [
    /*
     * AUTH
     */

    {
      path: "/api/auth/me",
      methods: ["GET"],
      handler: handlers.auth?.me,
    },

    {
      path: "/api/auth/login",
      methods: ["POST"],
      handler: handlers.auth?.login,
    },

    {
      path: "/api/auth/register",
      methods: ["POST"],
      handler: handlers.auth?.register,
    },

    {
      path: "/api/auth/logout",
      methods: ["POST"],
      handler: handlers.auth?.logout,
    },

    /*
     * CHATS
     */

    {
      path: "/api/chats",
      methods: ["GET", "POST"],
      handler:
        method === "GET"
          ? handlers.chats?.list
          : handlers.chats?.create,
    },

    {
      path: "/api/chat",
      methods: ["POST"],
      handler: handlers.chat?.send,
    },

    {
      path: "/api/chat/delete",
      methods: ["POST", "DELETE"],
      handler: handlers.chats?.delete,
    },

    {
      path: "/api/chat/rename",
      methods: ["POST", "PATCH"],
      handler: handlers.chats?.rename,
    },

    /*
     * GENERATION
     */

    {
      path: "/api/generate/image",
      methods: ["POST"],
      handler: handlers.generate?.image,
    },

    {
      path: "/api/generate/video",
      methods: ["POST"],
      handler: handlers.generate?.video,
    },

    {
      path: "/api/generate/music",
      methods: ["POST"],
      handler: handlers.generate?.music,
    },

    {
      path: "/api/generate/3d",
      methods: ["POST"],
      handler: handlers.generate?.model3d,
    },

    /*
     * FILES
     */

    {
      path: "/api/files/upload",
      methods: ["POST"],
      handler: handlers.files?.upload,
    },

    /*
     * HEALTH
     */

    {
      path: "/api/health",
      methods: ["GET"],
      handler: handlers.health,
    },
  ];

  const route = routes.find((item) => item.path === path);

  if (!route) {
    return null;
  }

  /*
   * Маршрут известен, но конкретный обработчик ещё не подключён.
   *
   * Это предотвращает падение Worker из-за undefined-функции.
   */
  if (typeof route.handler !== "function") {
    return {
      handler: async () =>
        errorResponse(
          "Этот API-маршрут ещё не подключён на сервере.",
          503,
          "SERVICE_NOT_READY",
        ),
      methods: route.methods,
    };
  }

  return {
    handler: route.handler,
    methods: route.methods,
  };
}

/**
 * Основная функция маршрутизации API.
 *
 * @param {Request} request
 * @param {object} env
 * @param {object} ctx
 * @param {object} handlers
 * @returns {Promise<Response>}
 */
export async function routeApi(request, env, ctx, handlers = {}) {
  const path = getPath(request);

  if (!path) {
    return errorResponse(
      "Некорректный URL запроса.",
      400,
      "INVALID_URL",
    );
  }

  const method = getMethod(request);

  const route = resolveRoute(path, method, handlers);

  /*
   * API-маршрут не существует.
   */
  if (!route) {
    return errorResponse(
      "API-маршрут не найден.",
      404,
      "NOT_FOUND",
      {
        path,
        method,
      },
    );
  }

  /*
   * Проверяем HTTP-метод.
   */
  const methodError = checkMethod(request, route.methods);

  if (methodError) {
    methodError.headers.set(
      "Allow",
      route.methods.join(", "),
    );

    return methodError;
  }

  /*
   * Передаём запрос реальному обработчику.
   */
  return executeHandler(
    route.handler,
    request,
    env,
    ctx,
  );
}

/**
 * Главная точка маршрутизации.
 *
 * worker.js сможет использовать:
 *
 * const response = await routeRequest(
 *   request,
 *   env,
 *   ctx,
 *   handlers
 * );
 *
 * @param {Request} request
 * @param {object} env
 * @param {object} ctx
 * @param {object} handlers
 * @returns {Promise<Response|null>}
 */
export async function routeRequest(
  request,
  env,
  ctx,
  handlers = {},
) {
  let url;

  try {
    url = new URL(request.url);
  } catch {
    return errorResponse(
      "Некорректный URL.",
      400,
      "INVALID_URL",
    );
  }

  /*
   * Всё, что начинается с /api/,
   * обрабатывается нашим API-роутером.
   */
  if (isApiRequest(url)) {
    return routeApi(
      request,
      env,
      ctx,
      handlers,
    );
  }

  /*
   * Не API — worker.js должен самостоятельно
   * передать запрос обработчику статических файлов.
   */
  return null;
}