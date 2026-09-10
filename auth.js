/**
 * Нейро-чат
 * auth.js
 *
 * Авторизация:
 * - регистрация
 * - вход
 * - выход
 * - проверка текущей сессии
 *
 * Используется вместе с:
 * - database.js
 * - router.js
 *
 * В аккаунте используются только:
 * - username
 * - password
 *
 * Email, телефон и коды подтверждения НЕ используются.
 */

/* -------------------------------------------------------------------------- */
/* НАСТРОЙКИ                                                                  */
/* -------------------------------------------------------------------------- */

const SESSION_COOKIE = "neuro_session";

/*
 * Сессия живёт 30 дней.
 */
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

/*
 * Ограничения логина.
 *
 * Разрешены:
 * - латинские буквы
 * - цифры
 * - точка
 * - подчёркивание
 * - дефис
 *
 * Пример:
 *
 * yaroslav
 * yaroslav3d
 * yaroslav_3d
 * yaroslav-3d
 */
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,32}$/;

/*
 * Минимальная длина пароля.
 */
const MIN_PASSWORD_LENGTH = 6;

/* -------------------------------------------------------------------------- */
/* ИМПОРТ БАЗЫ                                                                */
/* -------------------------------------------------------------------------- */

import {
  getUserById,
  getUserByUsername,
  createUser,
  createSession,
  getSessionByTokenHash,
  deleteSession,
  deleteUserSessions,
  deleteExpiredSessions,
} from "./database.js";

/* -------------------------------------------------------------------------- */
/* JSON                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Создаёт JSON Response.
 *
 * @param {object} data
 * @param {number} status
 * @param {HeadersInit} extraHeaders
 * @returns {Response}
 */
function json(data, status = 200, extraHeaders = {}) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=UTF-8",
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

/**
 * Успешный ответ.
 *
 * @param {object} data
 * @param {number} status
 * @returns {Response}
 */
function success(data = {}, status = 200) {
  return json(
    {
      ok: true,
      ...data,
    },
    status,
  );
}

/**
 * Ошибка.
 *
 * @param {string} message
 * @param {number} status
 * @param {string} code
 * @returns {Response}
 */
function failure(
  message,
  status = 400,
  code = "BAD_REQUEST",
) {
  return json(
    {
      ok: false,
      error: {
        code,
        message,
      },
    },
    status,
  );
}

/* -------------------------------------------------------------------------- */
/* REQUEST BODY                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Безопасно читает JSON body.
 *
 * @param {Request} request
 * @returns {Promise<object|null>}
 */
async function readJson(request) {
  try {
    const contentType =
      request.headers.get("content-type") || "";

    if (
      !contentType
        .toLowerCase()
        .includes("application/json")
    ) {
      return null;
    }

    const body = await request.json();

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      return null;
    }

    return body;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* USERNAME                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Нормализует username.
 *
 * @param {unknown} value
 * @returns {string}
 */
function normalizeUsername(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .trim()
    .toLowerCase();
}

/**
 * Проверяет username.
 *
 * @param {string} username
 * @returns {string|null}
 */
function validateUsername(username) {
  if (!username) {
    return "Введите имя пользователя.";
  }

  if (username.length < 3) {
    return "Имя пользователя должно содержать минимум 3 символа.";
  }

  if (username.length > 32) {
    return "Имя пользователя не должно превышать 32 символа.";
  }

  if (!USERNAME_PATTERN.test(username)) {
    return (
      "Имя пользователя может содержать только " +
      "латинские буквы, цифры, точку, дефис и подчёркивание."
    );
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* PASSWORD                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Проверяет пароль.
 *
 * @param {unknown} value
 * @returns {string|null}
 */
function validatePassword(value) {
  if (typeof value !== "string") {
    return "Введите пароль.";
  }

  if (value.length < MIN_PASSWORD_LENGTH) {
    return (
      `Пароль должен содержать минимум ` +
      `${MIN_PASSWORD_LENGTH} символов.`
    );
  }

  if (value.length > 256) {
    return "Пароль слишком длинный.";
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* CRYPTO                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Преобразует ArrayBuffer в hex.
 *
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
function bufferToHex(buffer) {
  const bytes = new Uint8Array(buffer);

  return Array.from(bytes)
    .map(
      (byte) =>
        byte
          .toString(16)
          .padStart(2, "0"),
    )
    .join("");
}

/**
 * SHA-256.
 *
 * Используется для:
 * - session token
 *
 * Пароль отдельно хэшируется через PBKDF2.
 *
 * @param {string} value
 * @returns {Promise<string>}
 */
async function sha256(value) {
  const data =
    new TextEncoder().encode(value);

  const hash =
    await crypto.subtle.digest(
      "SHA-256",
      data,
    );

  return bufferToHex(hash);
}

/**
 * Преобразует base64 в Uint8Array.
 *
 * @param {string} value
 * @returns {Uint8Array}
 */
function base64ToBytes(value) {
  const binary =
    atob(value);

  const bytes =
    new Uint8Array(
      binary.length,
    );

  for (
    let index = 0;
    index < binary.length;
    index += 1
  ) {
    bytes[index] =
      binary.charCodeAt(index);
  }

  return bytes;
}

/**
 * Преобразует Uint8Array в base64.
 *
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function bytesToBase64(bytes) {
  let binary = "";

  for (
    let index = 0;
    index < bytes.length;
    index += 1
  ) {
    binary += String.fromCharCode(
      bytes[index],
    );
  }

  return btoa(binary);
}

/**
 * Хэширует пароль через PBKDF2.
 *
 * Формат:
 *
 * pbkdf2$iterations$salt$hash
 *
 * @param {string} password
 * @returns {Promise<string>}
 */
async function hashPassword(password) {
  const salt =
    crypto.getRandomValues(
      new Uint8Array(16),
    );

  const keyMaterial =
    await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      {
        name: "PBKDF2",
      },
      false,
      ["deriveBits"],
    );

  const iterations = 120000;

  const derivedBits =
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt,
        iterations,
        hash: "SHA-256",
      },
      keyMaterial,
      256,
    );

  const hash =
    new Uint8Array(
      derivedBits,
    );

  return [
    "pbkdf2",
    iterations,
    bytesToBase64(salt),
    bytesToBase64(hash),
  ].join("$");
}

/**
 * Проверяет пароль.
 *
 * @param {string} password
 * @param {string} storedHash
 * @returns {Promise<boolean>}
 */
async function verifyPassword(
  password,
  storedHash,
) {
  try {
    if (
      typeof storedHash !== "string"
    ) {
      return false;
    }

    const parts =
      storedHash.split("$");

    if (
      parts.length !== 4 ||
      parts[0] !== "pbkdf2"
    ) {
      return false;
    }

    const iterations =
      Number(parts[1]);

    if (
      !Number.isInteger(iterations) ||
      iterations < 10000
    ) {
      return false;
    }

    const salt =
      base64ToBytes(parts[2]);

    const expected =
      base64ToBytes(parts[3]);

    const keyMaterial =
      await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        {
          name: "PBKDF2",
        },
        false,
        ["deriveBits"],
      );

    const derivedBits =
      await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          salt,
          iterations,
          hash: "SHA-256",
        },
        keyMaterial,
        expected.length * 8,
      );

    const actual =
      new Uint8Array(
        derivedBits,
      );

    return constantTimeEqual(
      actual,
      expected,
    );
  } catch {
    return false;
  }
}

/**
 * Сравнение без раннего выхода.
 *
 * @param {Uint8Array} a
 * @param {Uint8Array} b
 * @returns {boolean}
 */
function constantTimeEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }

  let difference = 0;

  for (
    let index = 0;
    index < a.length;
    index += 1
  ) {
    difference |=
      a[index] ^ b[index];
  }

  return difference === 0;
}

/**
 * Генерирует случайный session token.
 *
 * @returns {string}
 */
function generateSessionToken() {
  const bytes =
    crypto.getRandomValues(
      new Uint8Array(32),
    );

  return bytesToBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

/* -------------------------------------------------------------------------- */
/* COOKIE                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Извлекает cookie.
 *
 * @param {Request} request
 * @param {string} name
 * @returns {string|null}
 */
function getCookie(request, name) {
  const header =
    request.headers.get("Cookie");

  if (!header) {
    return null;
  }

  const cookies =
    header.split(";");

  for (const item of cookies) {
    const separator =
      item.indexOf("=");

    if (separator === -1) {
      continue;
    }

    const key =
      item
        .slice(0, separator)
        .trim();

    if (key !== name) {
      continue;
    }

    return decodeURIComponent(
      item
        .slice(separator + 1)
        .trim(),
    );
  }

  return null;
}

/**
 * Создаёт cookie сессии.
 *
 * @param {string} token
 * @returns {string}
 */
function createSessionCookie(token) {
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${SESSION_MAX_AGE}`,
  ].join("; ");
}

/**
 * Создаёт cookie для удаления сессии.
 *
 * @returns {string}
 */
function clearSessionCookie() {
  return [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Max-Age=0",
  ].join("; ");
}

/* -------------------------------------------------------------------------- */
/* PUBLIC USER                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Убирает password_hash из пользователя.
 *
 * @param {object|null} user
 * @returns {object|null}
 */
function publicUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    username: user.username,
    createdAt:
      user.created_at,
    updatedAt:
      user.updated_at,
  };
}

/* -------------------------------------------------------------------------- */
/* SESSION                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Получает текущего пользователя.
 *
 * @param {Request} request
 * @param {object} env
 * @returns {Promise<object|null>}
 */
export async function getCurrentUser(
  request,
  env,
) {
  const token =
    getCookie(
      request,
      SESSION_COOKIE,
    );

  if (!token) {
    return null;
  }

  const tokenHash =
    await sha256(token);

  const session =
    await getSessionByTokenHash(
      env,
      tokenHash,
    );

  if (!session) {
    return null;
  }

  const user =
    await getUserById(
      env,
      session.user_id,
    );

  if (!user) {
    /*
     * Если пользователь удалён,
     * его сессия тоже больше не нужна.
     */
    await deleteSession(
      env,
      tokenHash,
    );

    return null;
  }

  return user;
}

/**
 * Требует авторизацию.
 *
 * Используется другими обработчиками.
 *
 * @param {Request} request
 * @param {object} env
 * @returns {Promise<object>}
 */
export async function requireUser(
  request,
  env,
) {
  const user =
    await getCurrentUser(
      request,
      env,
    );

  if (!user) {
    return {
      ok: false,
      response: failure(
        "Необходимо войти в аккаунт.",
        401,
        "UNAUTHORIZED",
      ),
      user: null,
    };
  }

  return {
    ok: true,
    response: null,
    user,
  };
}

/**
 * Создаёт новую сессию.
 *
 * @param {object} env
 * @param {string} userId
 * @returns {Promise<{token:string,tokenHash:string,expiresAt:string}>}
 */
async function startSession(
  env,
  userId,
) {
  const token =
    generateSessionToken();

  const tokenHash =
    await sha256(token);

  const expiresAt =
    new Date(
      Date.now() +
        SESSION_MAX_AGE * 1000,
    ).toISOString();

  await createSession(
    env,
    {
      userId,
      tokenHash,
      expiresAt,
    },
  );

  return {
    token,
    tokenHash,
    expiresAt,
  };
}

/* -------------------------------------------------------------------------- */
/* REGISTER                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Регистрация пользователя.
 *
 * POST /api/auth/register
 *
 * Body:
 *
 * {
 *   "username": "yaroslav",
 *   "password": "password123"
 * }
 *
 * @param {Request} request
 * @param {object} env
 * @returns {Promise<Response>}
 */
export async function register(
  request,
  env,
) {
  const body =
    await readJson(request);

  if (!body) {
    return failure(
      "Некорректный JSON-запрос.",
      400,
      "INVALID_JSON",
    );
  }

  const username =
    normalizeUsername(
      body.username,
    );

  const password =
    typeof body.password === "string"
      ? body.password
      : "";

  const usernameError =
    validateUsername(username);

  if (usernameError) {
    return failure(
      usernameError,
      400,
      "INVALID_USERNAME",
    );
  }

  const passwordError =
    validatePassword(password);

  if (passwordError) {
    return failure(
      passwordError,
      400,
      "INVALID_PASSWORD",
    );
  }

  /*
   * Проверяем, занят ли username.
   */
  const existingUser =
    await getUserByUsername(
      env,
      username,
    );

  if (existingUser) {
    return failure(
      "Пользователь с таким именем уже существует.",
      409,
      "USERNAME_EXISTS",
    );
  }

  /*
   * Пароль никогда не отправляется
   * в database.js в открытом виде.
   */
  const passwordHash =
    await hashPassword(password);

  let user;

  try {
    user =
      await createUser(
        env,
        {
          username,
          passwordHash,
        },
      );
  } catch (error) {
    /*
     * UNIQUE username может сработать,
     * если два запроса регистрации пришли
     * практически одновременно.
     */
    console.error(
      "Registration database error:",
      error,
    );

    const message =
      error instanceof Error
        ? error.message
        : "";

    if (
      message
        .toLowerCase()
        .includes("unique")
    ) {
      return failure(
        "Пользователь с таким именем уже существует.",
        409,
        "USERNAME_EXISTS",
      );
    }

    return failure(
      "Не удалось создать аккаунт.",
      500,
      "REGISTRATION_FAILED",
    );
  }

  /*
   * Автоматически авторизуем пользователя
   * после регистрации.
   */
  const session =
    await startSession(
      env,
      user.id,
    );

  return success(
    {
      user: publicUser(user),
    },
    201,
  ).withHeaders
    ? (() => {
        const response =
          success(
            {
              user: publicUser(user),
            },
            201,
          );

        response.headers.append(
          "Set-Cookie",
          createSessionCookie(
            session.token,
          ),
        );

        return response;
      })()
    : (() => {
        const response =
          success(
            {
              user: publicUser(user),
            },
            201,
          );

        response.headers.append(
          "Set-Cookie",
          createSessionCookie(
            session.token,
          ),
        );

        return response;
      })();
}

/* -------------------------------------------------------------------------- */
/* LOGIN                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Вход пользователя.
 *
 * POST /api/auth/login
 *
 * @param {Request} request
 * @param {object} env
 * @returns {Promise<Response>}
 */
export async function login(
  request,
  env,
) {
  const body =
    await readJson(request);

  if (!body) {
    return failure(
      "Некорректный JSON-запрос.",
      400,
      "INVALID_JSON",
    );
  }

  const username =
    normalizeUsername(
      body.username,
    );

  const password =
    typeof body.password === "string"
      ? body.password
      : "";

  if (!username || !password) {
    return failure(
      "Введите имя пользователя и пароль.",
      400,
      "MISSING_CREDENTIALS",
    );
  }

  const user =
    await getUserByUsername(
      env,
      username,
    );

  /*
   * Не раскрываем, существует ли
   * конкретный пользователь.
   */
  if (!user) {
    return failure(
      "Неверное имя пользователя или пароль.",
      401,
      "INVALID_CREDENTIALS",
    );
  }

  const valid =
    await verifyPassword(
      password,
      user.password_hash,
    );

  if (!valid) {
    return failure(
      "Неверное имя пользователя или пароль.",
      401,
      "INVALID_CREDENTIALS",
    );
  }

  /*
   * Один пользователь может иметь
   * несколько активных сессий:
   *
   * iPhone
   * iPad
   * компьютер
   *
   * Поэтому здесь НЕ удаляем старые сессии.
   */
  const session =
    await startSession(
      env,
      user.id,
    );

  /*
   * Удаляем старые просроченные сессии.
   */
  try {
    await deleteExpiredSessions(
      env,
    );
  } catch (error) {
    console.warn(
      "Expired sessions cleanup failed:",
      error,
    );
  }

  const response =
    success({
      user: publicUser(user),
    });

  response.headers.append(
    "Set-Cookie",
    createSessionCookie(
      session.token,
    ),
  );

  return response;
}

/* -------------------------------------------------------------------------- */
/* ME                                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Проверка текущего пользователя.
 *
 * GET /api/auth/me
 *
 * @param {Request} request
 * @param {object} env
 * @returns {Promise<Response>}
 */
export async function me(
  request,
  env,
) {
  const user =
    await getCurrentUser(
      request,
      env,
    );

  if (!user) {
    return json(
      {
        ok: false,
        user: null,
      },
      401,
    );
  }

  return success({
    user: publicUser(user),
  });
}

/* -------------------------------------------------------------------------- */
/* LOGOUT                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Выход текущей сессии.
 *
 * POST /api/auth/logout
 *
 * @param {Request} request
 * @param {object} env
 * @returns {Promise<Response>}
 */
export async function logout(
  request,
  env,
) {
  const token =
    getCookie(
      request,
      SESSION_COOKIE,
    );

  if (token) {
    const tokenHash =
      await sha256(token);

    await deleteSession(
      env,
      tokenHash,
    );
  }

  const response =
    success({
      user: null,
    });

  response.headers.append(
    "Set-Cookie",
    clearSessionCookie(),
  );

  return response;
}

/* -------------------------------------------------------------------------- */
/* LOGOUT ALL                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Завершает все сессии пользователя.
 *
 * Этот endpoint пока не подключён
 * к router.js, но функция готова для настроек.
 *
 * @param {Request} request
 * @param {object} env
 * @returns {Promise<Response>}
 */
export async function logoutAll(
  request,
  env,
) {
  const user =
    await getCurrentUser(
      request,
      env,
    );

  if (!user) {
    return failure(
      "Необходимо войти в аккаунт.",
      401,
      "UNAUTHORIZED",
    );
  }

  await deleteUserSessions(
    env,
    user.id,
  );

  const response =
    success({
      user: null,
    });

  response.headers.append(
    "Set-Cookie",
    clearSessionCookie(),
  );

  return response;
}

/* -------------------------------------------------------------------------- */
/* API OBJECT                                                                 */
/* -------------------------------------------------------------------------- */

export const auth = {
  register,
  login,
  me,
  logout,
  logoutAll,
  getCurrentUser,
  requireUser,
};