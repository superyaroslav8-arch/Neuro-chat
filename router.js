import {
  auth
} from "./auth.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function error(message, status = 400) {
  return json(
    {
      ok: false,
      error: message
    },
    status
  );
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function withCors(response) {
  const headers = new Headers(response.headers);

  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  headers.set(
    "access-control-allow-headers",
    "Content-Type, Authorization"
  );

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function notFound() {
  return error("API-маршрут не найден.", 404);
}

function methodNotAllowed() {
  return error("Метод запроса не поддерживается.", 405);
}

function serviceUnavailable() {
  return error("Сервис временно недоступен.", 503);
}

function normalizePath(pathname) {
  if (!pathname) {
    return "/";
  }

  const normalized = pathname.replace(/\/+/g, "/");

  if (normalized.length > 1 && normalized.endsWith("/")) {
    return normalized.slice(0, -1);
  }

  return normalized;
}

function getChatIdFromPath(pathname) {
  const match = pathname.match(
    /^\/api\/chats\/([^/]+)(?:\/messages)?$/
  );

  return match ? decodeURIComponent(match[1]) : null;
}

function isMessagesPath(pathname) {
  return /^\/api\/chats\/[^/]+\/messages$/.test(pathname);
}

function isChatPath(pathname) {
  return /^\/api\/chats\/[^/]+$/.test(pathname);
}

function getHandler(handlers, ...names) {
  let current = handlers;

  for (const name of names) {
    if (!current) {
      return null;
    }

    current = current[name];
  }

  return typeof current === "function" ? current : null;
}

async function call(handler, request, env, ...args) {
  if (!handler) {
    return serviceUnavailable();
  }

  try {
    const response = await handler(request, env, ...args);

    if (response instanceof Response) {
      return response;
    }

    return json(response);
  } catch (err) {
    console.error(err);

    return error(
      err?.message || "Внутренняя ошибка сервера.",
      500
    );
  }
}

export async function routeRequest(request, env, handlers = {}) {
  const url = new URL(request.url);
  const pathname = normalizePath(url.pathname);
  const method = request.method.toUpperCase();

  if (method === "OPTIONS") {
    return withCors(
      new Response(null, {
        status: 204
      })
    );
  }

  if (!pathname.startsWith("/api/")) {
    return null;
  }

  /*
   * HEALTH
   */
  if (pathname === "/api/health") {
    if (method !== "GET") {
      return withCors(methodNotAllowed());
    }

    return withCors(
      await call(
        getHandler(handlers, "health"),
        request,
        env
      )
    );
  }

  /*
   * AUTH
   */
  if (pathname === "/api/auth/me") {
    if (method !== "GET") {
      return withCors(methodNotAllowed());
    }

    return withCors(
      await call(
        getHandler(handlers, "auth", "me") ||
          auth.me,
        request,
        env
      )
    );
  }

  if (pathname === "/api/auth/register") {
    if (method !== "POST") {
      return withCors(methodNotAllowed());
    }

    return withCors(
      await call(
        getHandler(handlers, "auth", "register") ||
          auth.register,
        request,
        env
      )
    );
  }

  if (pathname === "/api/auth/login") {
    if (method !== "POST") {
      return withCors(methodNotAllowed());
    }

    return withCors(
      await call(
        getHandler(handlers, "auth", "login") ||
          auth.login,
        request,
        env
      )
    );
  }

  if (pathname === "/api/auth/logout") {
    if (method !== "POST") {
      return withCors(methodNotAllowed());
    }

    return withCors(
      await call(
        getHandler(handlers, "auth", "logout") ||
          auth.logout,
        request,
        env
      )
    );
  }

  /*
   * CHATS
   */
  if (pathname === "/api/chats") {
    if (method !== "GET" && method !== "POST") {
      return withCors(methodNotAllowed());
    }

    const handler = getHandler(
      handlers,
      "chats",
      method === "GET" ? "list" : "create"
    );

    return withCors(
      await call(
        handler,
        request,
        env
      )
    );
  }

  /*
   * CHAT MESSAGES
   *
   * GET  /api/chats/:id/messages
   * POST /api/chats/:id/messages
   */
  if (isMessagesPath(pathname)) {
    const chatId = getChatIdFromPath(pathname);

    if (method !== "GET" && method !== "POST") {
      return withCors(methodNotAllowed());
    }

    const handler = getHandler(
      handlers,
      "chats",
      method === "GET" ? "messages" : "sendMessage"
    );

    return withCors(
      await call(
        handler,
        request,
        env,
        chatId
      )
    );
  }

  /*
   * SINGLE CHAT
   *
   * DELETE /api/chats/:id
   */
  if (isChatPath(pathname)) {
    const chatId = getChatIdFromPath(pathname);

    if (method !== "DELETE" && method !== "PATCH") {
      return withCors(methodNotAllowed());
    }

    const handler = getHandler(
      handlers,
      "chats",
      method === "DELETE" ? "delete" : "rename"
    );

    return withCors(
      await call(
        handler,
        request,
        env,
        chatId
      )
    );
  }

  /*
   * MAIN AI CHAT
   */
  if (pathname === "/api/chat") {
    if (method !== "POST") {
      return withCors(methodNotAllowed());
    }

    return withCors(
      await call(
        getHandler(handlers, "chat", "send"),
        request,
        env
      )
    );
  }

  /*
   * GENERATION
   */
  const generationRoutes = {
    "/api/generate/image": "image",
    "/api/generate/video": "video",
    "/api/generate/music": "music",
    "/api/generate/3d": "3d"
  };

  if (generationRoutes[pathname]) {
    if (method !== "POST") {
      return withCors(methodNotAllowed());
    }

    return withCors(
      await call(
        getHandler(
          handlers,
          "generate",
          generationRoutes[pathname]
        ),
        request,
        env
      )
    );
  }

  /*
   * FILES
   */
  if (pathname === "/api/files/upload") {
    if (method !== "POST") {
      return withCors(methodNotAllowed());
    }

    return withCors(
      await call(
        getHandler(handlers, "files", "upload"),
        request,
        env
      )
    );
  }

  /*
   * SETTINGS
   */
  if (pathname === "/api/settings") {
    if (method !== "GET" && method !== "POST") {
      return withCors(methodNotAllowed());
    }

    const handler = getHandler(
      handlers,
      "settings",
      method === "GET" ? "get" : "save"
    );

    return withCors(
      await call(
        handler,
        request,
        env
      )
    );
  }

  /*
   * PERMISSIONS
   */
  if (pathname === "/api/permissions") {
    if (method !== "GET" && method !== "POST") {
      return withCors(methodNotAllowed());
    }

    const handler = getHandler(
      handlers,
      "permissions",
      method === "GET" ? "get" : "save"
    );

    return withCors(
      await call(
        handler,
        request,
        env
      )
    );
  }

  /*
   * PLUGINS
   */
  if (pathname === "/api/plugins") {
    if (method !== "GET" && method !== "POST") {
      return withCors(methodNotAllowed());
    }

    const handler = getHandler(
      handlers,
      "plugins",
      method === "GET" ? "get" : "save"
    );

    return withCors(
      await call(
        handler,
        request,
        env
      )
    );
  }

  /*
   * AI STATUS
   */
  if (pathname === "/api/ai/status") {
    if (method !== "GET") {
      return withCors(methodNotAllowed());
    }

    return withCors(
      await call(
        getHandler(handlers, "ai", "status"),
        request,
        env
      )
    );
  }

  /*
   * UNKNOWN API
   */
  return withCors(notFound());
}

export {
  json,
  error,
  readJson
};