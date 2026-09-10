/**
 * Нейро-чат
 * database.js
 *
 * Работа с Cloudflare D1.
 *
 * Ожидаемый binding:
 *
 * env.DB
 *
 * Он будет подключён в wrangler.jsonc.
 */

/* -------------------------------------------------------------------------- */
/* УТИЛИТЫ                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Проверяет наличие D1.
 *
 * @param {object} env
 * @returns {D1Database}
 */
function getDatabase(env) {
  if (!env || !env.DB) {
    throw new Error(
      "База данных D1 не подключена. Ожидается binding env.DB.",
    );
  }

  return env.DB;
}

/**
 * Возвращает текущее время в ISO-формате.
 *
 * @returns {string}
 */
export function now() {
  return new Date().toISOString();
}

/**
 * Создаёт UUID.
 *
 * @returns {string}
 */
export function createId() {
  return crypto.randomUUID();
}

/**
 * Безопасно преобразует значение в число.
 *
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function toNumber(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

/* -------------------------------------------------------------------------- */
/* СХЕМА                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Создаёт необходимые таблицы и индексы.
 *
 * Эта функция нужна для первоначальной инициализации D1.
 *
 * В дальнейшем схема также может быть вынесена
 * в официальные D1 migrations.
 *
 * @param {object} env
 * @returns {Promise<void>}
 */
export async function ensureDatabase(env) {
  const db = getDatabase(env);

  /*
   * D1 поддерживает выполнение нескольких SQL-команд
   * через batch().
   *
   * Все таблицы используют IF NOT EXISTS,
   * поэтому повторный запуск безопасен.
   */
  await db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `),

    db.prepare(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        FOREIGN KEY (user_id)
          REFERENCES users(id)
          ON DELETE CASCADE
      )
    `),

    db.prepare(`
      CREATE TABLE IF NOT EXISTS chats (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT 'Новый чат',
        model TEXT NOT NULL DEFAULT 'neuro',
        temporary INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id)
          REFERENCES users(id)
          ON DELETE CASCADE
      )
    `),

    db.prepare(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        chat_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        model TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (chat_id)
          REFERENCES chats(id)
          ON DELETE CASCADE,
        FOREIGN KEY (user_id)
          REFERENCES users(id)
          ON DELETE CASCADE
      )
    `),

    db.prepare(`
      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        chat_id TEXT,
        filename TEXT NOT NULL,
        content_type TEXT,
        size INTEGER NOT NULL DEFAULT 0,
        storage_key TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id)
          REFERENCES users(id)
          ON DELETE CASCADE,
        FOREIGN KEY (chat_id)
          REFERENCES chats(id)
          ON DELETE SET NULL
      )
    `),

    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_users_username
      ON users(username)
    `),

    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id
      ON sessions(user_id)
    `),

    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_sessions_token_hash
      ON sessions(token_hash)
    `),

    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
      ON sessions(expires_at)
    `),

    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_chats_user_id
      ON chats(user_id)
    `),

    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_chats_user_updated
      ON chats(user_id, updated_at DESC)
    `),

    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_messages_chat_id
      ON messages(chat_id)
    `),

    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_messages_user_id
      ON messages(user_id)
    `),

    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_messages_chat_created
      ON messages(chat_id, created_at)
    `),

    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_files_user_id
      ON files(user_id)
    `),

    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_files_chat_id
      ON files(chat_id)
    `),
  ]);
}

/* -------------------------------------------------------------------------- */
/* ПОЛЬЗОВАТЕЛИ                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Находит пользователя по ID.
 *
 * @param {object} env
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
export async function getUserById(env, userId) {
  const db = getDatabase(env);

  if (!userId) {
    return null;
  }

  const result = await db
    .prepare(`
      SELECT
        id,
        username,
        password_hash,
        created_at,
        updated_at
      FROM users
      WHERE id = ?
      LIMIT 1
    `)
    .bind(userId)
    .first();

  return result || null;
}

/**
 * Находит пользователя по username.
 *
 * @param {object} env
 * @param {string} username
 * @returns {Promise<object|null>}
 */
export async function getUserByUsername(env, username) {
  const db = getDatabase(env);

  if (!username) {
    return null;
  }

  const result = await db
    .prepare(`
      SELECT
        id,
        username,
        password_hash,
        created_at,
        updated_at
      FROM users
      WHERE username = ?
      LIMIT 1
    `)
    .bind(username)
    .first();

  return result || null;
}

/**
 * Создаёт пользователя.
 *
 * @param {object} env
 * @param {object} data
 * @returns {Promise<object>}
 */
export async function createUser(
  env,
  {
    id = createId(),
    username,
    passwordHash,
  },
) {
  const db = getDatabase(env);

  const timestamp = now();

  await db
    .prepare(`
      INSERT INTO users (
        id,
        username,
        password_hash,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?)
    `)
    .bind(
      id,
      username,
      passwordHash,
      timestamp,
      timestamp,
    )
    .run();

  return {
    id,
    username,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

/**
 * Обновляет дату изменения пользователя.
 *
 * @param {object} env
 * @param {string} userId
 * @returns {Promise<void>}
 */
export async function touchUser(env, userId) {
  const db = getDatabase(env);

  await db
    .prepare(`
      UPDATE users
      SET updated_at = ?
      WHERE id = ?
    `)
    .bind(now(), userId)
    .run();
}

/**
 * Удаляет пользователя.
 *
 * @param {object} env
 * @param {string} userId
 * @returns {Promise<void>}
 */
export async function deleteUser(env, userId) {
  const db = getDatabase(env);

  await db
    .prepare(`
      DELETE FROM users
      WHERE id = ?
    `)
    .bind(userId)
    .run();
}

/* -------------------------------------------------------------------------- */
/* СЕССИИ                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Создаёт серверную сессию.
 *
 * Сам токен не хранится в базе.
 * В базе хранится только его SHA-256 hash.
 *
 * @param {object} env
 * @param {object} data
 * @returns {Promise<object>}
 */
export async function createSession(
  env,
  {
    id = createId(),
    userId,
    tokenHash,
    expiresAt,
  },
) {
  const db = getDatabase(env);

  const timestamp = now();

  await db
    .prepare(`
      INSERT INTO sessions (
        id,
        user_id,
        token_hash,
        created_at,
        expires_at
      )
      VALUES (?, ?, ?, ?, ?)
    `)
    .bind(
      id,
      userId,
      tokenHash,
      timestamp,
      expiresAt,
    )
    .run();

  return {
    id,
    userId,
    tokenHash,
    createdAt: timestamp,
    expiresAt,
  };
}

/**
 * Находит активную сессию по hash токена.
 *
 * @param {object} env
 * @param {string} tokenHash
 * @returns {Promise<object|null>}
 */
export async function getSessionByTokenHash(
  env,
  tokenHash,
) {
  const db = getDatabase(env);

  if (!tokenHash) {
    return null;
  }

  const result = await db
    .prepare(`
      SELECT
        id,
        user_id,
        token_hash,
        created_at,
        expires_at
      FROM sessions
      WHERE token_hash = ?
        AND expires_at > ?
      LIMIT 1
    `)
    .bind(
      tokenHash,
      now(),
    )
    .first();

  return result || null;
}

/**
 * Удаляет одну сессию.
 *
 * @param {object} env
 * @param {string} tokenHash
 * @returns {Promise<void>}
 */
export async function deleteSession(
  env,
  tokenHash,
) {
  const db = getDatabase(env);

  if (!tokenHash) {
    return;
  }

  await db
    .prepare(`
      DELETE FROM sessions
      WHERE token_hash = ?
    `)
    .bind(tokenHash)
    .run();
}

/**
 * Удаляет все сессии пользователя.
 *
 * @param {object} env
 * @param {string} userId
 * @returns {Promise<void>}
 */
export async function deleteUserSessions(
  env,
  userId,
) {
  const db = getDatabase(env);

  await db
    .prepare(`
      DELETE FROM sessions
      WHERE user_id = ?
    `)
    .bind(userId)
    .run();
}

/**
 * Удаляет просроченные сессии.
 *
 * @param {object} env
 * @returns {Promise<void>}
 */
export async function deleteExpiredSessions(env) {
  const db = getDatabase(env);

  await db
    .prepare(`
      DELETE FROM sessions
      WHERE expires_at <= ?
    `)
    .bind(now())
    .run();
}

/* -------------------------------------------------------------------------- */
/* ЧАТЫ                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Создаёт чат.
 *
 * @param {object} env
 * @param {object} data
 * @returns {Promise<object>}
 */
export async function createChat(
  env,
  {
    id = createId(),
    userId,
    title = "Новый чат",
    model = "neuro",
    temporary = false,
  },
) {
  const db = getDatabase(env);

  const timestamp = now();

  await db
    .prepare(`
      INSERT INTO chats (
        id,
        user_id,
        title,
        model,
        temporary,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      id,
      userId,
      title,
      model,
      temporary ? 1 : 0,
      timestamp,
      timestamp,
    )
    .run();

  return {
    id,
    userId,
    title,
    model,
    temporary: Boolean(temporary),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/**
 * Получает чат только если он принадлежит пользователю.
 *
 * @param {object} env
 * @param {string} chatId
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
export async function getChat(
  env,
  chatId,
  userId,
) {
  const db = getDatabase(env);

  if (!chatId || !userId) {
    return null;
  }

  const result = await db
    .prepare(`
      SELECT
        id,
        user_id,
        title,
        model,
        temporary,
        created_at,
        updated_at
      FROM chats
      WHERE id = ?
        AND user_id = ?
      LIMIT 1
    `)
    .bind(chatId, userId)
    .first();

  if (!result) {
    return null;
  }

  return {
    ...result,
    temporary: Boolean(
      toNumber(result.temporary),
    ),
  };
}

/**
 * Получает список чатов пользователя.
 *
 * @param {object} env
 * @param {string} userId
 * @param {number} limit
 * @returns {Promise<object[]>}
 */
export async function listChats(
  env,
  userId,
  limit = 100,
) {
  const db = getDatabase(env);

  const safeLimit = Math.min(
    Math.max(
      toNumber(limit, 100),
      1,
    ),
    200,
  );

  const result = await db
    .prepare(`
      SELECT
        id,
        user_id,
        title,
        model,
        temporary,
        created_at,
        updated_at
      FROM chats
      WHERE user_id = ?
        AND temporary = 0
      ORDER BY updated_at DESC
      LIMIT ?
    `)
    .bind(
      userId,
      safeLimit,
    )
    .all();

  return (result.results || []).map(
    (chat) => ({
      ...chat,
      temporary: Boolean(
        toNumber(chat.temporary),
      ),
    }),
  );
}

/**
 * Обновляет название чата.
 *
 * @param {object} env
 * @param {string} chatId
 * @param {string} userId
 * @param {string} title
 * @returns {Promise<object|null>}
 */
export async function renameChat(
  env,
  chatId,
  userId,
  title,
) {
  const db = getDatabase(env);

  const timestamp = now();

  const result = await db
    .prepare(`
      UPDATE chats
      SET
        title = ?,
        updated_at = ?
      WHERE id = ?
        AND user_id = ?
    `)
    .bind(
      title,
      timestamp,
      chatId,
      userId,
    )
    .run();

  if (!result.meta || result.meta.changes < 1) {
    return null;
  }

  return getChat(
    env,
    chatId,
    userId,
  );
}

/**
 * Обновляет модель чата.
 *
 * @param {object} env
 * @param {string} chatId
 * @param {string} userId
 * @param {string} model
 * @returns {Promise<object|null>}
 */
export async function updateChatModel(
  env,
  chatId,
  userId,
  model,
) {
  const db = getDatabase(env);

  const timestamp = now();

  const result = await db
    .prepare(`
      UPDATE chats
      SET
        model = ?,
        updated_at = ?
      WHERE id = ?
        AND user_id = ?
    `)
    .bind(
      model,
      timestamp,
      chatId,
      userId,
    )
    .run();

  if (!result.meta || result.meta.changes < 1) {
    return null;
  }

  return getChat(
    env,
    chatId,
    userId,
  );
}

/**
 * Обновляет время изменения чата.
 *
 * @param {object} env
 * @param {string} chatId
 * @param {string} userId
 * @returns {Promise<void>}
 */
export async function touchChat(
  env,
  chatId,
  userId,
) {
  const db = getDatabase(env);

  await db
    .prepare(`
      UPDATE chats
      SET updated_at = ?
      WHERE id = ?
        AND user_id = ?
    `)
    .bind(
      now(),
      chatId,
      userId,
    )
    .run();
}

/**
 * Удаляет чат пользователя.
 *
 * Сообщения удалятся благодаря ON DELETE CASCADE.
 *
 * @param {object} env
 * @param {string} chatId
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export async function deleteChat(
  env,
  chatId,
  userId,
) {
  const db = getDatabase(env);

  const result = await db
    .prepare(`
      DELETE FROM chats
      WHERE id = ?
        AND user_id = ?
    `)
    .bind(
      chatId,
      userId,
    )
    .run();

  return Boolean(
    result.meta &&
    result.meta.changes > 0,
  );
}

/* -------------------------------------------------------------------------- */
/* СООБЩЕНИЯ                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Добавляет сообщение в чат.
 *
 * @param {object} env
 * @param {object} data
 * @returns {Promise<object>}
 */
export async function createMessage(
  env,
  {
    id = createId(),
    chatId,
    userId,
    role,
    content,
    model = null,
  },
) {
  const db = getDatabase(env);

  const timestamp = now();

  await db
    .prepare(`
      INSERT INTO messages (
        id,
        chat_id,
        user_id,
        role,
        content,
        model,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      id,
      chatId,
      userId,
      role,
      content,
      model,
      timestamp,
    )
    .run();

  /*
   * Одновременно обновляем updated_at чата.
   */
  await db
    .prepare(`
      UPDATE chats
      SET updated_at = ?
      WHERE id = ?
        AND user_id = ?
    `)
    .bind(
      timestamp,
      chatId,
      userId,
    )
    .run();

  return {
    id,
    chatId,
    userId,
    role,
    content,
    model,
    createdAt: timestamp,
  };
}

/**
 * Получает сообщения чата.
 *
 * Проверяется и chat_id, и user_id,
 * поэтому пользователь не сможет получить
 * сообщения чужого чата.
 *
 * @param {object} env
 * @param {string} chatId
 * @param {string} userId
 * @param {number} limit
 * @returns {Promise<object[]>}
 */
export async function listMessages(
  env,
  chatId,
  userId,
  limit = 200,
) {
  const db = getDatabase(env);

  const safeLimit = Math.min(
    Math.max(
      toNumber(limit, 200),
      1,
    ),
    500,
  );

  const result = await db
    .prepare(`
      SELECT
        m.id,
        m.chat_id,
        m.user_id,
        m.role,
        m.content,
        m.model,
        m.created_at
      FROM messages AS m
      INNER JOIN chats AS c
        ON c.id = m.chat_id
      WHERE m.chat_id = ?
        AND m.user_id = ?
        AND c.user_id = ?
      ORDER BY m.created_at ASC
      LIMIT ?
    `)
    .bind(
      chatId,
      userId,
      userId,
      safeLimit,
    )
    .all();

  return result.results || [];
}

/**
 * Получает одно сообщение.
 *
 * @param {object} env
 * @param {string} messageId
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
export async function getMessage(
  env,
  messageId,
  userId,
) {
  const db = getDatabase(env);

  const result = await db
    .prepare(`
      SELECT
        id,
        chat_id,
        user_id,
        role,
        content,
        model,
        created_at
      FROM messages
      WHERE id = ?
        AND user_id = ?
      LIMIT 1
    `)
    .bind(
      messageId,
      userId,
    )
    .first();

  return result || null;
}

/* -------------------------------------------------------------------------- */
/* ФАЙЛЫ                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Сохраняет информацию о загруженном файле.
 *
 * Сам файл здесь не хранится.
 * Для содержимого позже можно использовать Cloudflare R2.
 *
 * @param {object} env
 * @param {object} data
 * @returns {Promise<object>}
 */
export async function createFile(
  env,
  {
    id = createId(),
    userId,
    chatId = null,
    filename,
    contentType = null,
    size = 0,
    storageKey = null,
  },
) {
  const db = getDatabase(env);

  const timestamp = now();

  await db
    .prepare(`
      INSERT INTO files (
        id,
        user_id,
        chat_id,
        filename,
        content_type,
        size,
        storage_key,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      id,
      userId,
      chatId,
      filename,
      contentType,
      Math.max(
        toNumber(size, 0),
        0,
      ),
      storageKey,
      timestamp,
    )
    .run();

  return {
    id,
    userId,
    chatId,
    filename,
    contentType,
    size: Math.max(
      toNumber(size, 0),
      0,
    ),
    storageKey,
    createdAt: timestamp,
  };
}

/**
 * Получает файл пользователя.
 *
 * @param {object} env
 * @param {string} fileId
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
export async function getFile(
  env,
  fileId,
  userId,
) {
  const db = getDatabase(env);

  const result = await db
    .prepare(`
      SELECT
        id,
        user_id,
        chat_id,
        filename,
        content_type,
        size,
        storage_key,
        created_at
      FROM files
      WHERE id = ?
        AND user_id = ?
      LIMIT 1
    `)
    .bind(
      fileId,
      userId,
    )
    .first();

  return result || null;
}

/**
 * Удаляет информацию о файле.
 *
 * @param {object} env
 * @param {string} fileId
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export async function deleteFile(
  env,
  fileId,
  userId,
) {
  const db = getDatabase(env);

  const result = await db
    .prepare(`
      DELETE FROM files
      WHERE id = ?
        AND user_id = ?
    `)
    .bind(
      fileId,
      userId,
    )
    .run();

  return Boolean(
    result.meta &&
    result.meta.changes > 0,
  );
}

/* -------------------------------------------------------------------------- */
/* СЕРВИСНАЯ ИНФОРМАЦИЯ                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Проверяет доступность базы данных.
 *
 * @param {object} env
 * @returns {Promise<boolean>}
 */
export async function databaseHealth(env) {
  const db = getDatabase(env);

  const result = await db
    .prepare("SELECT 1 AS ok")
    .first();

  return Boolean(
    result &&
    Number(result.ok) === 1,
  );
}

/**
 * Удобный объект API базы данных.
 *
 * Можно импортировать как:
 *
 * import * as database from "./database.js";
 *
 * @returns {object}
 */
export const database = {
  now,
  createId,
  ensureDatabase,

  getUserById,
  getUserByUsername,
  createUser,
  touchUser,
  deleteUser,

  createSession,
  getSessionByTokenHash,
  deleteSession,
  deleteUserSessions,
  deleteExpiredSessions,

  createChat,
  getChat,
  listChats,
  renameChat,
  updateChatModel,
  touchChat,
  deleteChat,

  createMessage,
  listMessages,
  getMessage,

  createFile,
  getFile,
  deleteFile,

  databaseHealth,
};