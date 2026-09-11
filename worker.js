const MODEL = "@cf/meta/llama-3.1-8b-instruct";

const COOKIE_NAME = "neuro_session";
const SESSION_DAYS = 30;

const MAX_MESSAGE_LENGTH = 12000;
const MAX_HISTORY = 20;


/* =========================================================
   MAIN WORKER
   ========================================================= */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (url.pathname.startsWith("/api/")) {
        return await handleApi(request, env, url);
      }

      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error("Worker error:", error);

      if (url.pathname.startsWith("/api/")) {
        return json(
          {
            ok: false,
            error: "Внутренняя ошибка сервера."
          },
          500
        );
      }

      return new Response(
        "Internal Server Error",
        {
          status: 500,
          headers: {
            "content-type":
              "text/plain; charset=utf-8"
          }
        }
      );
    }
  }
};


/* =========================================================
   API
   ========================================================= */

async function handleApi(request, env, url) {
  const path = url.pathname;

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders()
    });
  }


  /* -------------------------
     HEALTH
     ------------------------- */

  if (
    path === "/api/health" &&
    request.method === "GET"
  ) {
    return json({
      ok: true,
      service: "Neuro-chat",
      ai: Boolean(env.AI),
      database: Boolean(env.STATE)
    });
  }


  /* -------------------------
     DATABASE
     ------------------------- */

  const db = getDB(env);

  const user = await currentUser(
    request,
    db
  );


  /* -------------------------
     AUTH
     ------------------------- */

  if (
    path === "/api/auth/register" &&
    request.method === "POST"
  ) {
    return register(request, db);
  }


  if (
    path === "/api/auth/login" &&
    request.method === "POST"
  ) {
    return login(request, db);
  }


  if (
    path === "/api/auth/logout" &&
    request.method === "POST"
  ) {
    const token = getCookie(
      request,
      COOKIE_NAME
    );

    if (token) {
      await db.deleteSession(token);
    }

    return json(
      {
        ok: true
      },
      200,
      clearCookie(COOKIE_NAME)
    );
  }


  if (
    path === "/api/auth/me" &&
    request.method === "GET"
  ) {
    return json({
      ok: true,
      authenticated: Boolean(user),
      user: user
        ? {
            id: user.id,
            username: user.username
          }
        : null
    });
  }


  /* -------------------------
     AUTH REQUIRED
     ------------------------- */

  if (!user) {
    return json(
      {
        ok: false,
        error: "Требуется авторизация."
      },
      401
    );
  }


  /* -------------------------
     CHATS
     ------------------------- */

  if (
    path === "/api/chats" &&
    request.method === "GET"
  ) {
    return json({
      ok: true,
      chats: await db.chats(user.id)
    });
  }


  if (
    path === "/api/chats" &&
    request.method === "POST"
  ) {
    const body =
      await readJSON(request);

    const title =
      typeof body.title === "string" &&
      body.title.trim()
        ? body.title
            .trim()
            .slice(0, 100)
        : "Новый чат";

    const chat =
      await db.createChat(
        user.id,
        title,
        Boolean(body.temporary)
      );

    return json(
      {
        ok: true,
        chat
      },
      201
    );
  }


  /* -------------------------
     SINGLE CHAT
     ------------------------- */

  const chatMatch =
    path.match(
      /^\/api\/chats\/(\d+)$/
    );


  if (chatMatch) {
    const chatId =
      Number(chatMatch[1]);


    if (
      request.method === "GET"
    ) {
      const chat =
        await db.chat(
          user.id,
          chatId
        );

      if (!chat) {
        return json(
          {
            ok: false,
            error: "Чат не найден."
          },
          404
        );
      }

      const messages =
        await db.messages(
          user.id,
          chatId
        );

      return json({
        ok: true,
        chat,
        messages
      });
    }


    if (
      request.method === "DELETE"
    ) {
      await db.deleteChat(
        user.id,
        chatId
      );

      return json({
        ok: true
      });
    }


    if (
      request.method === "PATCH"
    ) {
      const body =
        await readJSON(request);

      const title =
        typeof body.title === "string"
          ? body.title
              .trim()
              .slice(0, 100)
          : "";

      if (!title) {
        return json(
          {
            ok: false,
            error:
              "Название чата не может быть пустым."
          },
          400
        );
      }

      await db.renameChat(
        user.id,
        chatId,
        title
      );

      return json({
        ok: true
      });
    }
  }


  /* -------------------------
     AI CHAT
     ------------------------- */

  if (
    path === "/api/chat" &&
    request.method === "POST"
  ) {
    return chat(
      request,
      env,
      db,
      user
    );
  }


  /* -------------------------
     TOOLS
     ------------------------- */

  if (
    path === "/api/tools" &&
    request.method === "POST"
  ) {
    return tools(
      request,
      db,
      user
    );
  }


  return json(
    {
      ok: false,
      error: "API route not found."
    },
    404
  );
}


/* =========================================================
   AI CHAT
   ========================================================= */

async function chat(
  request,
  env,
  db,
  user
) {
  const body =
    await readJSON(request);

  let chatId =
    Number(body.chatId || 0);

  let message =
    String(
      body.message || ""
    ).trim();


  if (!message) {
    return json(
      {
        ok: false,
        error: "Введите сообщение."
      },
      400
    );
  }


  if (
    message.length >
    MAX_MESSAGE_LENGTH
  ) {
    message =
      message.slice(
        0,
        MAX_MESSAGE_LENGTH
      );
  }


  /* -------------------------
     FIND / CREATE CHAT
     ------------------------- */

  let chatRow =
    chatId
      ? await db.chat(
          user.id,
          chatId
        )
      : null;


  if (!chatRow) {
    const title =
      message.length > 45
        ? message.slice(0, 45) + "…"
        : message;

    chatRow =
      await db.createChat(
        user.id,
        title,
        Boolean(
          body.temporary
        )
      );

    chatId =
      chatRow.id;
  }


  /* -------------------------
     SAVE USER MESSAGE
     ------------------------- */

  await db.addMessage(
    chatId,
    "user",
    message
  );


  /* -------------------------
     HISTORY
     ------------------------- */

  const storedMessages =
    await db.messages(
      user.id,
      chatId
    );


  const history =
    storedMessages
      .slice(-MAX_HISTORY)
      .map(item => ({
        role:
          item.role ===
          "assistant"
            ? "assistant"
            : "user",

        content:
          item.content
      }));


  /* -------------------------
     AI CHECK
     ------------------------- */

  if (!env.AI) {
    return json(
      {
        ok: false,
        error:
          "Workers AI не подключён. Проверь AI binding в Cloudflare."
      },
      503
    );
  }


  /* -------------------------
     AI REQUEST
     ------------------------- */

  let result;

  try {
    result =
      await env.AI.run(
        MODEL,
        {
          messages: [
            {
              role: "system",
              content:
                [
                  "Ты — Нейро, универсальный AI-помощник проекта «Нейро-чат».",
                  "Ты являешься самим помощником, а не сайтом о помощнике.",
                  "Если пользователь пишет по-русски, отвечай по-русски.",
                  "Отвечай непосредственно на запрос пользователя.",
                  "Не выдумывай факты.",
                  "Если не знаешь ответа — честно скажи об этом.",
                  "Для программирования давай рабочий код.",
                  "Не добавляй ненужные вступления.",
                  "Будь полезным, точным и понятным."
                ].join(" ")
            },

            ...history
          ]
        }
      );
  } catch (error) {
    console.error(
      "Workers AI error:",
      error
    );

    return json(
      {
        ok: false,
        error:
          "Не удалось получить ответ от AI. Попробуй ещё раз."
      },
      502
    );
  }


  const answer =
    extractAIText(result);


  if (!answer) {
    return json(
      {
        ok: false,
        error:
          "AI не вернул текстовый ответ."
      },
      502
    );
  }


  /* -------------------------
     SAVE AI MESSAGE
     ------------------------- */

  await db.addMessage(
    chatId,
    "assistant",
    answer
  );


  return json({
    ok: true,
    chatId,
    answer,
    model: MODEL
  });
}


/* =========================================================
   TOOLS
   ========================================================= */

async function tools(
  request,
  db,
  user
) {
  const body =
    await readJSON(request);

  const tool =
    String(
      body.tool || ""
    );


  const descriptions = {

    image:
      "Создание изображений. Нейро подготовит запрос и сможет использовать подключённый генератор изображений.",

    video:
      "Создание видео. Нейро подготовит сценарий и запрос для подключённого видеогенератора.",

    music:
      "Создание музыки. Нейро подготовит описание композиции и запрос для музыкального генератора.",

    model3d:
      "Создание 3D-модели. Нейро поможет подготовить описание и техническое задание для 3D-модели.",

    website:
      "Режим создания сайта. Нейро может написать HTML, CSS и JavaScript.",

    code:
      "Режим программирования. Нейро помогает писать, объяснять и исправлять код.",

    file:
      "Файл добавлен. Нейро может помочь разобрать его содержимое."
  };


  if (
    !descriptions[tool]
  ) {
    return json(
      {
        ok: false,
        error:
          "Неизвестный инструмент."
      },
      400
    );
  }


  return json({
    ok: true,
    tool,
    message:
      descriptions[tool]
  });
}


/* =========================================================
   AUTH
   ========================================================= */

async function register(
  request,
  db
) {
  const body =
    await readJSON(request);

  const username =
    normalizeUsername(
      body.username
    );

  const password =
    String(
      body.password || ""
    );


  if (
    !validUsername(username)
  ) {
    return json(
      {
        ok: false,
        error:
          "Логин должен содержать от 3 до 40 символов: латинские буквы, цифры, точку, тире или подчёркивание."
      },
      400
    );
  }


  if (
    password.length < 6
  ) {
    return json(
      {
        ok: false,
        error:
          "Пароль должен содержать минимум 6 символов."
      },
      400
    );
  }


  const existing =
    await db.userByUsername(
      username
    );


  if (existing) {
    return json(
      {
        ok: false,
        error:
          "Такой пользователь уже существует."
      },
      409
    );
  }


  const passwordHash =
    await hashPassword(
      password
    );


  const user =
    await db.createUser(
      username,
      passwordHash
    );


  const session =
    await db.createSession(
      user.id
    );


  return json(
    {
      ok: true,
      user: {
        id: user.id,
        username: user.username
      }
    },
    201,
    setCookie(
      COOKIE_NAME,
      session.token,
      session.expiresAt
    )
  );
}


async function login(
  request,
  db
) {
  const body =
    await readJSON(request);

  const username =
    normalizeUsername(
      body.username
    );

  const password =
    String(
      body.password || ""
    );


  const user =
    await db.userByUsername(
      username
    );


  if (!user) {
    return json(
      {
        ok: false,
        error:
          "Неверный логин или пароль."
      },
      401
    );
  }


  const valid =
    await verifyPassword(
      password,
      user.password_hash
    );


  if (!valid) {
    return json(
      {
        ok: false,
        error:
          "Неверный логин или пароль."
      },
      401
    );
  }


  const session =
    await db.createSession(
      user.id
    );


  return json(
    {
      ok: true,
      user: {
        id: user.id,
        username: user.username
      }
    },
    200,
    setCookie(
      COOKIE_NAME,
      session.token,
      session.expiresAt
    )
  );
}


/* =========================================================
   DATABASE ACCESS
   ========================================================= */

function getDB(env) {
  const id =
    env.STATE.idFromName(
      "global"
    );

  const stub =
    env.STATE.get(id);

  return new DBClient(stub);
}


class DBClient {

  constructor(stub) {
    this.stub = stub;
  }


  async call(
    method,
    ...args
  ) {
    const response =
      await this.stub.fetch(
        "https://neuro-state/" +
        method,
        {
          method: "POST",
          headers: {
            "content-type":
              "application/json"
          },
          body:
            JSON.stringify(args)
        }
      );


    if (!response.ok) {
      const text =
        await response.text();

      console.error(
        "Database error:",
        text
      );

      throw new Error(
        "Ошибка базы данных."
      );
    }


    return response.json();
  }


  userByUsername(value) {
    return this.call(
      "userByUsername",
      value
    );
  }


  userById(value) {
    return this.call(
      "userById",
      value
    );
  }


  createUser(...args) {
    return this.call(
      "createUser",
      ...args
    );
  }


  createSession(...args) {
    return this.call(
      "createSession",
      ...args
    );
  }


  session(...args) {
    return this.call(
      "session",
      ...args
    );
  }


  deleteSession(...args) {
    return this.call(
      "deleteSession",
      ...args
    );
  }


  createChat(...args) {
    return this.call(
      "createChat",
      ...args
    );
  }


  chats(...args) {
    return this.call(
      "chats",
      ...args
    );
  }


  chat(...args) {
    return this.call(
      "chat",
      ...args
    );
  }


  renameChat(...args) {
    return this.call(
      "renameChat",
      ...args
    );
  }


  deleteChat(...args) {
    return this.call(
      "deleteChat",
      ...args
    );
  }


  messages(...args) {
    return this.call(
      "messages",
      ...args
    );
  }


  addMessage(...args) {
    return this.call(
      "addMessage",
      ...args
    );
  }
}


/* =========================================================
   DURABLE OBJECT
   ========================================================= */

export class NeuroState {

  constructor(state) {
    this.state = state;
    this.sql =
      state.storage.sql;

    this.initialized =
      false;
  }


  ensureDatabase() {
    if (this.initialized) {
      return;
    }

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

    this.initialized =
      true;
  }


  async fetch(request) {
    this.ensureDatabase();

    const url =
      new URL(request.url);

    const method =
      url.pathname
        .replace(/^\/+/, "");


    try {
      const args =
        await request.json();


      switch (method) {

        case "userByUsername":
          return this.response(
            this.userByUsername(
              args[0]
            )
          );


        case "userById":
          return this.response(
            this.userById(
              args[0]
            )
          );


        case "createUser":
          return this.response(
            this.createUser(
              args[0],
              args[1]
            )
          );


        case "createSession":
          return this.response(
            this.createSession(
              args[0]
            )
          );


        case "session":
          return this.response(
            this.session(
              args[0]
            )
          );


        case "deleteSession":
          return this.response(
            this.deleteSession(
              args[0]
            )
          );


        case "createChat":
          return this.response(
            this.createChat(
              args[0],
              args[1],
              args[2]
            )
          );


        case "chats":
          return this.response(
            this.chats(
              args[0]
            )
          );


        case "chat":
          return this.response(
            this.chat(
              args[0],
              args[1]
            )
          );


        case "renameChat":
          return this.response(
            this.renameChat(
              args[0],
              args[1],
              args[2]
            )
          );


        case "deleteChat":
          return this.response(
            this.deleteChat(
              args[0],
              args[1]
            )
          );


        case "messages":
          return this.response(
            this.messages(
              args[0],
              args[1]
            )
          );


        case "addMessage":
          return this.response(
            this.addMessage(
              args[0],
              args[1],
              args[2]
            )
          );


        default:
          return new Response(
            JSON.stringify({
              ok: false,
              error:
                "Database method not found."
            }),
            {
              status: 404,
              headers: {
                "content-type":
                  "application/json"
              }
            }
          );
      }

    } catch (error) {
      console.error(
        "Durable Object error:",
        error
      );

      return new Response(
        JSON.stringify({
          ok: false,
          error:
            "Database error."
        }),
        {
          status: 500,
          headers: {
            "content-type":
              "application/json"
          }
        }
      );
    }
  }


  response(data) {
    return new Response(
      JSON.stringify(data ?? null),
      {
        status: 200,
        headers: {
          "content-type":
            "application/json"
        }
      }
    );
  }


  userByUsername(
    username
  ) {
    return (
      this.sql
        .exec(
          `
          SELECT
            id,
            username,
            password_hash,
            created_at
          FROM users
          WHERE username = ?
          `,
          username
        )
        .toArray()[0]
      || null
    );
  }


  userById(id) {
    return (
      this.sql
        .exec(
          `
          SELECT
            id,
            username,
            created_at
          FROM users
          WHERE id = ?
          `,
          id
        )
        .toArray()[0]
      || null
    );
  }


  createUser(
    username,
    passwordHash
  ) {
    const now =
      Date.now();

    this.sql.exec(
      `
      INSERT INTO users
        (
          username,
          password_hash,
          created_at
        )
      VALUES (?, ?, ?)
      `,
      username,
      passwordHash,
      now
    );

    return this.userByUsername(
      username
    );
  }


  createSession(
    userId
  ) {
    const token =
      crypto.randomUUID() +
      "-" +
      crypto.randomUUID();

    const expiresAt =
      Date.now() +
      SESSION_DAYS *
      24 *
      60 *
      60 *
      1000;

    this.sql.exec(
      `
      INSERT INTO sessions
        (
          token,
          user_id,
          expires_at
        )
      VALUES (?, ?, ?)
      `,
      token,
      userId,
      expiresAt
    );

    return {
      token,
      expiresAt
    };
  }


  session(token) {
    if (!token) {
      return null;
    }

    const row =
      this.sql
        .exec(
          `
          SELECT
            token,
            user_id,
            expires_at
          FROM sessions
          WHERE token = ?
          `,
          token
        )
        .toArray()[0];


    if (!row) {
      return null;
    }


    if (
      row.expires_at <
      Date.now()
    ) {
      this.sql.exec(
        `
        DELETE FROM sessions
        WHERE token = ?
        `,
        token
      );

      return null;
    }


    return row;
  }


  deleteSession(
    token
  ) {
    if (!token) {
      return {
        ok: true
      };
    }

    this.sql.exec(
      `
      DELETE FROM sessions
      WHERE token = ?
      `,
      token
    );

    return {
      ok: true
    };
  }


  createChat(
    userId,
    title,
    temporary
  ) {
    const now =
      Date.now();

    this.sql.exec(
      `
      INSERT INTO chats
        (
          user_id,
          title,
          temporary,
          created_at,
          updated_at
        )
      VALUES (?, ?, ?, ?, ?)
      `,
      userId,
      title,
      temporary ? 1 : 0,
      now,
      now
    );


    return this.sql
      .exec(
        `
        SELECT *
        FROM chats
        WHERE id =
          last_insert_rowid()
        `
      )
      .toArray()[0];
  }


  chats(userId) {
    return this.sql
      .exec(
        `
        SELECT
          id,
          title,
          temporary,
          created_at,
          updated_at
        FROM chats
        WHERE user_id = ?
        ORDER BY updated_at DESC
        `,
        userId
      )
      .toArray();
  }


  chat(
    userId,
    chatId
  ) {
    return (
      this.sql
        .exec(
          `
          SELECT *
          FROM chats
          WHERE id = ?
            AND user_id = ?
          `,
          chatId,
          userId
        )
        .toArray()[0]
      || null
    );
  }


  renameChat(
    userId,
    chatId,
    title
  ) {
    this.sql.exec(
      `
      UPDATE chats
      SET
        title = ?,
        updated_at = ?
      WHERE id = ?
        AND user_id = ?
      `,
      title,
      Date.now(),
      chatId,
      userId
    );

    return {
      ok: true
    };
  }


  deleteChat(
    userId,
    chatId
  ) {
    this.sql.exec(
      `
      DELETE FROM messages
      WHERE chat_id = ?
      `,
      chatId
    );

    this.sql.exec(
      `
      DELETE FROM chats
      WHERE id = ?
        AND user_id = ?
      `,
      chatId,
      userId
    );

    return {
      ok: true
    };
  }


  messages(
    userId,
    chatId
  ) {
    const chat =
      this.chat(
        userId,
        chatId
      );

    if (!chat) {
      return [];
    }

    return this.sql
      .exec(
        `
        SELECT
          id,
          role,
          content,
          created_at
        FROM messages
        WHERE chat_id = ?
        ORDER BY id ASC
        `,
        chatId
      )
      .toArray();
  }


  addMessage(
    chatId,
    role,
    content
  ) {
    const now =
      Date.now();

    this.sql.exec(
      `
      INSERT INTO messages
        (
          chat_id,
          role,
          content,
          created_at
        )
      VALUES (?, ?, ?, ?)
      `,
      chatId,
      role,
      content,
      now
    );


    this.sql.exec(
      `
      UPDATE chats
      SET updated_at = ?
      WHERE id = ?
      `,
      now,
      chatId
    );


    return {
      ok: true
    };
  }
}


/* =========================================================
   CURRENT USER
   ========================================================= */

async function currentUser(
  request,
  db
) {
  const token =
    getCookie(
      request,
      COOKIE_NAME
    );

  if (!token) {
    return null;
  }

  const session =
    await db.session(token);

  if (!session) {
    return null;
  }

  return db.userById(
    session.user_id
  );
}


/* =========================================================
   AI RESPONSE
   ========================================================= */

function extractAIText(
  result
) {
  if (!result) {
    return "";
  }


  if (
    typeof result ===
    "string"
  ) {
    return result.trim();
  }


  if (
    typeof result.response ===
    "string"
  ) {
    return result.response.trim();
  }


  if (
    typeof result.text ===
    "string"
  ) {
    return result.text.trim();
  }


  if (
    Array.isArray(
      result.output
    )
  ) {
    return result.output
      .map(item => {
        if (
          typeof item ===
          "string"
        ) {
          return item;
        }

        return item?.text || "";
      })
      .join("")
      .trim();
  }


  return "";
}


/* =========================================================
   PASSWORD
   ========================================================= */

async function hashPassword(
  password
) {
  const salt =
    crypto.randomUUID();

  const encoder =
    new TextEncoder();


  const key =
    await crypto.subtle.importKey(
      "raw",
      encoder.encode(
        password
      ),
      "PBKDF2",
      false,
      ["deriveBits"]
    );


  const bits =
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt:
          encoder.encode(
            salt
          ),
        iterations: 120000,
        hash: "SHA-256"
      },
      key,
      256
    );


  return (
    salt +
    ":" +
    bytesToHex(
      new Uint8Array(bits)
    )
  );
}


async function verifyPassword(
  password,
  stored
) {
  const [
    salt,
    expected
  ] =
    String(stored)
      .split(":");


  if (
    !salt ||
    !expected
  ) {
    return false;
  }


  const encoder =
    new TextEncoder();


  const key =
    await crypto.subtle.importKey(
      "raw",
      encoder.encode(
        password
      ),
      "PBKDF2",
      false,
      ["deriveBits"]
    );


  const bits =
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt:
          encoder.encode(
            salt
          ),
        iterations: 120000,
        hash: "SHA-256"
      },
      key,
      256
    );


  return (
    bytesToHex(
      new Uint8Array(bits)
    ) === expected
  );
}


function bytesToHex(
  bytes
) {
  return Array
    .from(bytes)
    .map(
      byte =>
        byte
          .toString(16)
          .padStart(2, "0")
    )
    .join("");
}


/* =========================================================
   HELPERS
   ========================================================= */

function normalizeUsername(
  value
) {
  return String(
    value || ""
  )
    .trim()
    .toLowerCase();
}


function validUsername(
  username
) {
  return /^[a-z0-9._-]{3,40}$/
    .test(username);
}


async function readJSON(
  request
) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}


function getCookie(
  request,
  name
) {
  const header =
    request.headers.get(
      "Cookie"
    ) || "";


  for (
    const part of
      header.split(";")
  ) {
    const [
      key,
      ...rest
    ] =
      part
        .trim()
        .split("=");


    if (
      key === name
    ) {
      return rest.join(
        "="
      );
    }
  }


  return null;
}


/* =========================================================
   RESPONSES
   ========================================================= */

function json(
  data,
  status = 200,
  extraHeaders = {}
) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "content-type":
          "application/json; charset=utf-8",

        ...corsHeaders(),

        ...extraHeaders
      }
    }
  );
}


function corsHeaders() {
  return {
    "access-control-allow-origin":
      "*",

    "access-control-allow-methods":
      "GET,POST,PATCH,DELETE,OPTIONS",

    "access-control-allow-headers":
      "Content-Type",

    "access-control-allow-credentials":
      "true"
  };
}


function setCookie(
  name,
  value,
  expiresAt
) {
  const expires =
    new Date(
      expiresAt
    ).toUTCString();


  return {
    "Set-Cookie":
      `${name}=${encodeURIComponent(value)}; Expires=${expires}; Path=/; HttpOnly; Secure; SameSite=Lax`
  };
}


function clearCookie(
  name
) {
  return {
    "Set-Cookie":
      `${name}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`
  };
}