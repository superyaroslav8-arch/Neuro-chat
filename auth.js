import {
  createUser,
  findUserByUsername,
  findUserById,
  createSession,
  findSession,
  deleteSession,
  deleteUserSessions
} from "./database.js";

const SESSION_COOKIE = "neuro_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

const USERNAME_RE = /^[a-zA-Z0-9._-]{3,32}$/;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers
    }
  });
}

function ok(data = {}) {
  return json({
    ok: true,
    ...data
  });
}

function fail(message, status = 400) {
  return json(
    {
      ok: false,
      error: message
    },
    status
  );
}

function getCookie(request, name) {
  const cookieHeader = request.headers.get("cookie") || "";

  const cookies = cookieHeader.split(";");

  for (const item of cookies) {
    const index = item.indexOf("=");

    if (index === -1) {
      continue;
    }

    const key = item.slice(0, index).trim();

    if (key !== name) {
      continue;
    }

    return decodeURIComponent(item.slice(index + 1).trim());
  }

  return null;
}

function createCookie(name, value, maxAge) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Secure"
  ];

  if (maxAge !== undefined) {
    parts.push(`Max-Age=${maxAge}`);
  }

  return parts.join("; ");
}

function randomBytes(length = 32) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function createId() {
  return bytesToHex(randomBytes(24));
}

function normalizeUsername(username) {
  return String(username || "").trim();
}

function validateUsername(username) {
  if (!username) {
    return "Введите имя пользователя.";
  }

  if (!USERNAME_RE.test(username)) {
    return "Имя пользователя должно содержать 3–32 латинских символа, цифры, точку, дефис или подчёркивание.";
  }

  return null;
}

function validatePassword(password) {
  if (!password) {
    return "Введите пароль.";
  }

  if (String(password).length < 6) {
    return "Пароль должен содержать минимум 6 символов.";
  }

  if (String(password).length > 128) {
    return "Пароль слишком длинный.";
  }

  return null;
}

async function hashPassword(password, saltHex = null) {
  const salt = saltHex
    ? hexToBytes(saltHex)
    : randomBytes(16);

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
      salt,
      iterations: 120000,
      hash: "SHA-256"
    },
    key,
    256
  );

  return {
    salt: bytesToHex(salt),
    hash: bytesToHex(new Uint8Array(bits))
  };
}

function hexToBytes(hex) {
  const clean = String(hex || "");

  if (clean.length % 2 !== 0) {
    throw new Error("Некорректная соль.");
  }

  const result = new Uint8Array(clean.length / 2);

  for (let i = 0; i < result.length; i += 1) {
    result[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }

  return result;
}

function safeUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    username: user.username,
    createdAt: user.createdAt
  };
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export async function getCurrentUser(request, env) {
  const sessionId = getCookie(request, SESSION_COOKIE);

  if (!sessionId) {
    return null;
  }

  const session = await findSession(env, sessionId);

  if (!session) {
    return null;
  }

  if (session.expiresAt <= Date.now()) {
    await deleteSession(env, sessionId);
    return null;
  }

  return await findUserById(env, session.userId);
}

export async function requireUser(request, env) {
  const user = await getCurrentUser(request, env);

  if (!user) {
    return {
      user: null,
      response: fail("Требуется авторизация.", 401)
    };
  }

  return {
    user,
    response: null
  };
}

export async function register(request, env) {
  const body = await readJson(request);

  const username = normalizeUsername(body.username);
  const password = String(body.password || "");

  const usernameError = validateUsername(username);

  if (usernameError) {
    return fail(usernameError);
  }

  const passwordError = validatePassword(password);

  if (passwordError) {
    return fail(passwordError);
  }

  const existing = await findUserByUsername(env, username);

  if (existing) {
    return fail("Пользователь с таким именем уже существует.", 409);
  }

  const passwordData = await hashPassword(password);

  const user = {
    id: createId(),
    username,
    passwordHash: passwordData.hash,
    passwordSalt: passwordData.salt,
    createdAt: Date.now()
  };

  await createUser(env, user);

  const sessionId = createId();

  await createSession(env, {
    id: sessionId,
    userId: user.id,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_MAX_AGE * 1000
  });

  return ok(
    {
      user: safeUser(user)
    },
    201,
    {
      "Set-Cookie": createCookie(
        SESSION_COOKIE,
        sessionId,
        SESSION_MAX_AGE
      )
    }
  );
}

export async function login(request, env) {
  const body = await readJson(request);

  const username = normalizeUsername(body.username);
  const password = String(body.password || "");

  if (!username || !password) {
    return fail("Введите имя пользователя и пароль.");
  }

  const user = await findUserByUsername(env, username);

  if (!user) {
    return fail("Неверное имя пользователя или пароль.", 401);
  }

  const passwordData = await hashPassword(
    password,
    user.passwordSalt
  );

  if (passwordData.hash !== user.passwordHash) {
    return fail("Неверное имя пользователя или пароль.", 401);
  }

  const sessionId = createId();

  await createSession(env, {
    id: sessionId,
    userId: user.id,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_MAX_AGE * 1000
  });

  return ok(
    {
      user: safeUser(user)
    },
    200,
    {
      "Set-Cookie": createCookie(
        SESSION_COOKIE,
        sessionId,
        SESSION_MAX_AGE
      )
    }
  );
}

export async function me(request, env) {
  const user = await getCurrentUser(request, env);

  if (!user) {
    return ok({
      authenticated: false,
      user: null
    });
  }

  return ok({
    authenticated: true,
    user: safeUser(user)
  });
}

export async function logout(request, env) {
  const sessionId = getCookie(request, SESSION_COOKIE);

  if (sessionId) {
    await deleteSession(env, sessionId);
  }

  return ok(
    {
      authenticated: false,
      user: null
    },
    200,
    {
      "Set-Cookie": createCookie(
        SESSION_COOKIE,
        "",
        0
      )
    }
  );
}

export async function logoutAll(request, env) {
  const user = await getCurrentUser(request, env);

  if (user) {
    await deleteUserSessions(env, user.id);
  }

  return ok(
    {
      authenticated: false,
      user: null
    },
    200,
    {
      "Set-Cookie": createCookie(
        SESSION_COOKIE,
        "",
        0
      )
    }
  );
}

export const auth = {
  getCurrentUser,
  requireUser,
  register,
  login,
  me,
  logout,
  logoutAll
};