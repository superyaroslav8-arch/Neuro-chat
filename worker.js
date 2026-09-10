import {
  createUser,
  findUserByUsername,
  findUserById,
  createSession,
  findSession,
  deleteSession,
  deleteUserSessions,
  createChat,
  listChats,
  getChat,
  renameChat,
  deleteChat,
  createMessage,
  listMessages,
  getSettings,
  saveSettings,
  getPermissions,
  savePermissions,
  getPlugins,
  savePlugins
} from "./database.js";

import {
  register,
  login,
  me,
  logout,
  logoutAll,
  getCurrentUser
} from "./auth.js";

import {
  chat,
  generateImage,
  generateVideo,
  generateMusic,
  generate3D,
  getAIStatus
} from "./ai.js";

import { routeRequest } from "./router.js";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS
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

async function body(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

async function requireUser(request, env) {
  const user = await getCurrentUser(request, env);

  if (!user) {
    return null;
  }

  return user;
}

function publicUser(user) {
  if (!user) return null;

  return {
    id: user.id,
    username: user.username,
    createdAt: user.createdAt
  };
}

async function handleChat(request, env) {
  const data = await body(request);
  const user = await requireUser(request, env);

  const model = data.model || "neuro";
  const messages = Array.isArray(data.messages)
    ? data.messages
    : [];

  const result = await chat({
    env,
    model,
    messages,
    userId: user?.id || null
  });

  return json({
    ok: true,
    message: result.message,
    model: result.model,
    modelName: result.modelName,
    provider: result.provider
  });
}

async function handleCreateChat(request, env) {
  const user = await requireUser(request, env);

  if (!user) {
    return error("Для сохранения чатов войдите в аккаунт.", 401);
  }

  const data = await body(request);

  const title =
    String(data.title || "Новый чат")
      .trim()
      .slice(0, 100) || "Новый чат";

  const chatData = await createChat(env, {
    id: crypto.randomUUID(),
    userId: user.id,
    title,
    model: data.model || "neuro",
    createdAt: Date.now(),
    updatedAt: Date.now()
  });

  return json({
    ok: true,
    chat: chatData
  }, 201);
}

async function handleListChats(request, env) {
  const user = await requireUser(request, env);

  if (!user) {
    return json({
      ok: true,
      chats: []
    });
  }

  return json({
    ok: true,
    chats: await listChats(env, user.id)
  });
}

async function handleMessages(request, env, chatId) {
  const user = await requireUser(request, env);

  if (!user) {
    return error("Требуется авторизация.", 401);
  }

  const chatData = await getChat(
    env,
    chatId,
    user.id
  );

  if (!chatData) {
    return error("Чат не найден.", 404);
  }

  if (request.method === "GET") {
    return json({
      ok: true,
      messages: await listMessages(
        env,
        chatId,
        user.id
      )
    });
  }

  const data = await body(request);

  const message = await createMessage(env, {
    id: crypto.randomUUID(),
    chatId,
    userId: user.id,
    role: data.role || "user",
    content: String(data.content || "").slice(0, 20000),
    createdAt: Date.now()
  });

  return json({
    ok: true,
    message
  }, 201);
}

async function handleDeleteChat(request, env, chatId) {
  const user = await requireUser(request, env);

  if (!user) {
    return error("Требуется авторизация.", 401);
  }

  await deleteChat(
    env,
    chatId,
    user.id
  );

  return json({
    ok: true
  });
}

async function handleRenameChat(request, env, chatId) {
  const user = await requireUser(request, env);

  if (!user) {
    return error("Требуется авторизация.", 401);
  }

  const data = await body(request);

  const title =
    String(data.title || "Новый чат")
      .trim()
      .slice(0, 100);

  if (!title) {
    return error("Название чата не может быть пустым.");
  }

  const result = await renameChat(
    env,
    chatId,
    user.id,
    title
  );

  return json({
    ok: true,
    chat: result
  });
}

async function handleSettingsGet(request, env) {
  const user = await requireUser(request, env);

  if (!user) {
    return error("Требуется авторизация.", 401);
  }

  return json({
    ok: true,
    settings: await getSettings(env, user.id)
  });
}

async function handleSettingsSave(request, env) {
  const user = await requireUser(request, env);

  if (!user) {
    return error("Требуется авторизация.", 401);
  }

  const data = await body(request);

  const settings = {
    ...(data.settings || {})
  };

  return json({
    ok: true,
    settings: await saveSettings(
      env,
      user.id,
      settings
    )
  });
}

async function handlePermissionsGet(request, env) {
  const user = await requireUser(request, env);

  if (!user) {
    return error("Требуется авторизация.", 401);
  }

  return json({
    ok: true,
    permissions: await getPermissions(
      env,
      user.id
    )
  });
}

async function handlePermissionsSave(request, env) {
  const user = await requireUser(request, env);

  if (!user) {
    return error("Требуется авторизация.", 401);
  }

  const data = await body(request);

  return json({
    ok: true,
    permissions: await savePermissions(
      env,
      user.id,
      data.permissions || {}
    )
  });
}

async function handlePluginsGet(request, env) {
  const user = await requireUser(request, env);

  if (!user) {
    return json({
      ok: true,
      plugins: {}
    });
  }

  return json({
    ok: true,
    plugins: await getPlugins(
      env,
      user.id
    )
  });
}

async function handlePluginsSave(request, env) {
  const user = await requireUser(request, env);

  if (!user) {
    return error("Требуется авторизация.", 401);
  }

  const data = await body(request);

  return json({
    ok: true,
    plugins: await savePlugins(
      env,
      user.id,
      data.plugins || {}
    )
  });
}

async function handleHealth() {
  return json({
    ok: true,
    service: "Нейро-чат",
    version: "2.0.0",
    time: new Date().toISOString()
  });
}

function createHandlers(env) {
  return {
    health: handleHealth,

    auth: {
      register,
      login,
      me,
      logout,
      logoutAll
    },

    chats: {
      list: handleListChats,
      create: handleCreateChat,

      messages: handleMessages,
      sendMessage: handleMessages,

      delete: handleDeleteChat,
      rename: handleRenameChat
    },

    chat: {
      send: handleChat
    },

    generate: {
      image: async (request, env) => {
        const data = await body(request);

        const result = await generateImage({
          env,
          prompt: data.prompt
        });

        return json({
          ok: true,
          ...result
        });
      },

      video: async () => {
        const result = await generateVideo();

        return json({
          ok: true,
          ...result
        });
      },

      music: async () => {
        const result = await generateMusic();

        return json({
          ok: true,
          ...result
        });
      },

      "3d": async () => {
        const result = await generate3D();

        return json({
          ok: true,
          ...result
        });
      }
    },

    settings: {
      get: handleSettingsGet,
      save: handleSettingsSave
    },

    permissions: {
      get: handlePermissionsGet,
      save: handlePermissionsSave
    },

    plugins: {
      get: handlePluginsGet,
      save: handlePluginsSave
    },

    ai: {
      status: async (request, env) => {
        return json({
          ok: true,
          ...getAIStatus(env)
        });
      }
    }
  };
}

/* --------------------------------------------------
   Durable Object
-------------------------------------------------- */

export class NeuroState {
  constructor(state) {
    this.state = state;
    this.sql = state.storage.sql;
    this.ready = this.initialize();
  }

  async initialize() {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS chats (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        model TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        chat_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS user_data (
        user_id TEXT PRIMARY KEY,
        settings TEXT NOT NULL DEFAULT '{}',
        permissions TEXT NOT NULL DEFAULT '{}',
        plugins TEXT NOT NULL DEFAULT '{}'
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_user
      ON sessions(user_id);

      CREATE INDEX IF NOT EXISTS idx_chats_user
      ON chats(user_id);

      CREATE INDEX IF NOT EXISTS idx_messages_chat
      ON messages(chat_id);
    `);
  }

  async fetch(request) {
    await this.ready;

    if (request.method !== "POST") {
      return new Response("OK");
    }

    const input = await request.json();

    try {
      const result = await this.execute(
        input.action,
        input.payload || {}
      );

      return Response.json({
        result
      });
    } catch (error) {
      console.error(error);

      return Response.json(
        {
          error:
            error?.message ||
            "Ошибка хранилища."
        },
        {
          status: 500
        }
      );
    }
  }

  async execute(action, data) {
    switch (action) {
      case "init":
        return true;

      case "createUser":
        this.sql.exec(
          `
          INSERT INTO users
          (id, username, password_hash, password_salt, created_at)
          VALUES (?, ?, ?, ?, ?)
          `,
          data.id,
          data.username,
          data.passwordHash,
          data.passwordSalt,
          data.createdAt
        );

        return data;

      case "findUserByUsername": {
        const row = this.sql
          .exec(
            `
            SELECT
              id,
              username,
              password_hash AS passwordHash,
              password_salt AS passwordSalt,
              created_at AS createdAt
            FROM users
            WHERE username = ?
            LIMIT 1
            `,
            data.username
          )
          .toArray()[0];

        return row || null;
      }

      case "findUserById": {
        const row = this.sql
          .exec(
            `
            SELECT
              id,
              username,
              password_hash AS passwordHash,
              password_salt AS passwordSalt,
              created_at AS createdAt
            FROM users
            WHERE id = ?
            LIMIT 1
            `,
            data.userId
          )
          .toArray()[0];

        return row || null;
      }

      case "createSession":
        this.sql.exec(
          `
          INSERT INTO sessions
          (id, user_id, created_at, expires_at)
          VALUES (?, ?, ?, ?)
          `,
          data.id,
          data.userId,
          data.createdAt,
          data.expiresAt
        );

        return data;

      case "findSession": {
        const row = this.sql
          .exec(
            `
            SELECT
              id,
              user_id AS userId,
              created_at AS createdAt,
              expires_at AS expiresAt
            FROM sessions
            WHERE id = ?
            LIMIT 1
            `,
            data.sessionId
          )
          .toArray()[0];

        return row || null;
      }

      case "deleteSession":
        this.sql.exec(
          `
          DELETE FROM sessions
          WHERE id = ?
          `,
          data.sessionId
        );

        return true;

      case "deleteUserSessions":
        this.sql.exec(
          `
          DELETE FROM sessions
          WHERE user_id = ?
          `,
          data.userId
        );

        return true;

      case "createChat":
        this.sql.exec(
          `
          INSERT INTO chats
          (id, user_id, title, model, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
          `,
          data.id,
          data.userId,
          data.title,
          data.model,
          data.createdAt,
          data.updatedAt
        );

        return data;

      case "listChats":
        return this.sql
          .exec(
            `
            SELECT
              id,
              user_id AS userId,
              title,
              model,
              created_at AS createdAt,
              updated_at AS updatedAt
            FROM chats
            WHERE user_id = ?
            ORDER BY updated_at DESC
            `,
            data.userId
          )
          .toArray();

      case "getChat":
        return (
          this.sql
            .exec(
              `
              SELECT
                id,
                user_id AS userId,
                title,
                model,
                created_at AS createdAt,
                updated_at AS updatedAt
              FROM chats
              WHERE id = ?
              AND user_id = ?
              LIMIT 1
              `,
              data.chatId,
              data.userId
            )
            .toArray()[0] || null
        );

      case "renameChat":
        this.sql.exec(
          `
          UPDATE chats
          SET title = ?, updated_at = ?
          WHERE id = ?
          AND user_id = ?
          `,
          data.title,
          Date.now(),
          data.chatId,
          data.userId
        );

        return this.sql
          .exec(
            `
            SELECT
              id,
              user_id AS userId,
              title,
              model,
              created_at AS createdAt,
              updated_at AS updatedAt
            FROM chats
            WHERE id = ?
            AND user_id = ?
            LIMIT 1
            `,
            data.chatId,
            data.userId
          )
          .toArray()[0] || null;

      case "deleteChat":
        this.sql.exec(
          `
          DELETE FROM messages
          WHERE chat_id = ?
          AND user_id = ?
          `,
          data.chatId,
          data.userId
        );

        this.sql.exec(
          `
          DELETE FROM chats
          WHERE id = ?
          AND user_id = ?
          `,
          data.chatId,
          data.userId
        );

        return true;

      case "createMessage":
        this.sql.exec(
          `
          INSERT INTO messages
          (id, chat_id, user_id, role, content, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
          `,
          data.id,
          data.chatId,
          data.userId,
          data.role,
          data.content,
          data.createdAt
        );

        this.sql.exec(
          `
          UPDATE chats
          SET updated_at = ?
          WHERE id = ?
          AND user_id = ?
          `,
          Date.now(),
          data.chatId,
          data.userId
        );

        return data;

      case "listMessages":
        return this.sql
          .exec(
            `
            SELECT
              id,
              chat_id AS chatId,
              user_id AS userId,
              role,
              content,
              created_at AS createdAt
            FROM messages
            WHERE chat_id = ?
            AND user_id = ?
            ORDER BY created_at ASC
            `,
            data.chatId,
            data.userId
          )
          .toArray();

      case "getSettings":
        return this.getUserData(
          data.userId
        ).settings;

      case "saveSettings":
        return this.saveUserData(
          data.userId,
          "settings",
          data.settings
        );

      case "getPermissions":
        return this.getUserData(
          data.userId
        ).permissions;

      case "savePermissions":
        return this.saveUserData(
          data.userId,
          "permissions",
          data.permissions
        );

      case "getPlugins":
        return this.getUserData(
          data.userId
        ).plugins;

      case "savePlugins":
        return this.saveUserData(
          data.userId,
          "plugins",
          data.plugins
        );

      default:
        throw new Error(
          `Неизвестная операция: ${action}`
        );
    }
  }

  getUserData(userId) {
    const row = this.sql
      .exec(
        `
        SELECT
          settings,
          permissions,
          plugins
        FROM user_data
        WHERE user_id = ?
        LIMIT 1
        `,
        userId
      )
      .toArray()[0];

    if (!row) {
      this.sql.exec(
        `
        INSERT INTO user_data
        (user_id, settings, permissions, plugins)
        VALUES (?, '{}', '{}', '{}')
        `,
        userId
      );

      return {
        settings: {},
        permissions: {},
        plugins: {}
      };
    }

    return {
      settings: JSON.parse(row.settings || "{}"),
      permissions: JSON.parse(row.permissions || "{}"),
      plugins: JSON.parse(row.plugins || "{}")
    };
  }

  saveUserData(userId, field, value) {
    const current = this.getUserData(userId);

    current[field] = value || {};

    this.sql.exec(
      `
      INSERT INTO user_data
      (user_id, settings, permissions, plugins)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id)
      DO UPDATE SET
        settings = excluded.settings,
        permissions = excluded.permissions,
        plugins = excluded.plugins
      `,
      userId,
      JSON.stringify(current.settings),
      JSON.stringify(current.permissions),
      JSON.stringify(current.plugins)
    );

    return current[field];
  }
}

export default {
  async fetch(request, env) {
    try {
      const apiResponse = await routeRequest(
        request,
        {
          ...env,

          getUserSettings: async (userId) =>
            getSettings(env, userId)
        },
        createHandlers(env)
      );

      if (apiResponse) {
        return apiResponse;
      }

      if (env.ASSETS) {
        return env.ASSETS.fetch(request);
      }

      return new Response(
        "Нейро-чат",
        {
          status: 200,
          headers: {
            "content-type": "text/plain; charset=utf-8"
          }
        }
      );
    } catch (err) {
      console.error(err);

      if (
        new URL(request.url).pathname.startsWith("/api/")
      ) {
        return error(
          err?.message ||
            "Внутренняя ошибка сервера.",
          500
        );
      }

      return new Response(
        "Нейро-чат временно недоступен.",
        {
          status: 500,
          headers: {
            "content-type": "text/plain; charset=utf-8"
          }
        }
      );
    }
  }
};