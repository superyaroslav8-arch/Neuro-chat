const STATE_NAME = "main";

async function callState(env, action, payload = {}) {
  if (!env.STATE) {
    throw new Error("Хранилище STATE не подключено.");
  }

  const id = env.STATE.idFromName(STATE_NAME);
  const state = env.STATE.get(id);

  const response = await state.fetch("https://neuro-state.internal/", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      action,
      payload
    })
  });

  const data = await response.json();

  if (!response.ok || data?.error) {
    throw new Error(data?.error || "Ошибка хранилища.");
  }

  return data.result;
}

export async function initDatabase(env) {
  return callState(env, "init");
}

export async function createUser(env, user) {
  return callState(env, "createUser", user);
}

export async function findUserByUsername(env, username) {
  return callState(env, "findUserByUsername", {
    username
  });
}

export async function findUserById(env, userId) {
  return callState(env, "findUserById", {
    userId
  });
}

export async function createSession(env, session) {
  return callState(env, "createSession", session);
}

export async function findSession(env, sessionId) {
  return callState(env, "findSession", {
    sessionId
  });
}

export async function deleteSession(env, sessionId) {
  return callState(env, "deleteSession", {
    sessionId
  });
}

export async function deleteUserSessions(env, userId) {
  return callState(env, "deleteUserSessions", {
    userId
  });
}

export async function createChat(env, chat) {
  return callState(env, "createChat", chat);
}

export async function listChats(env, userId) {
  return callState(env, "listChats", {
    userId
  });
}

export async function getChat(env, chatId, userId) {
  return callState(env, "getChat", {
    chatId,
    userId
  });
}

export async function renameChat(env, chatId, userId, title) {
  return callState(env, "renameChat", {
    chatId,
    userId,
    title
  });
}

export async function deleteChat(env, chatId, userId) {
  return callState(env, "deleteChat", {
    chatId,
    userId
  });
}

export async function createMessage(env, message) {
  return callState(env, "createMessage", message);
}

export async function listMessages(env, chatId, userId) {
  return callState(env, "listMessages", {
    chatId,
    userId
  });
}

export async function getSettings(env, userId) {
  return callState(env, "getSettings", {
    userId
  });
}

export async function saveSettings(env, userId, settings) {
  return callState(env, "saveSettings", {
    userId,
    settings
  });
}

export async function getPermissions(env, userId) {
  return callState(env, "getPermissions", {
    userId
  });
}

export async function savePermissions(env, userId, permissions) {
  return callState(env, "savePermissions", {
    userId,
    permissions
  });
}

export async function getPlugins(env, userId) {
  return callState(env, "getPlugins", {
    userId
  });
}

export async function savePlugins(env, userId, plugins) {
  return callState(env, "savePlugins", {
    userId,
    plugins
  });
}

export async function saveFile(env, file) {
  return callState(env, "saveFile", file);
}

export async function getFile(env, fileId, userId) {
  return callState(env, "getFile", {
    fileId,
    userId
  });
}

export async function deleteFile(env, fileId, userId) {
  return callState(env, "deleteFile", {
    fileId,
    userId
  });
}

export async function getAIStatus(env) {
  return callState(env, "getAIStatus");
}

export {
  STATE_NAME
};