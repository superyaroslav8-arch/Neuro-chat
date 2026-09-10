"use strict";

const $ = id => document.getElementById(id);

const state = {
  user: null,
  chatId: null,
  temporary: false,
  model: "neuro",
  registerMode: false,
  files: []
};

const api = async (url, options = {}) => {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  let data;

  try {
    data = await response.json();
  } catch {
    data = {
      ok: false,
      error: "Сервер вернул некорректный ответ."
    };
  }

  if (!response.ok) {
    throw new Error(
      data.error || `Ошибка сервера: ${response.status}`
    );
  }

  return data;
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindEvents();

  autoResize();

  try {
    const result = await api("/api/auth/me");

    if (result.authenticated) {
      state.user = result.user;
      hide($("authModal"));
      await loadChats();
    } else {
      show($("authModal"));
    }
  } catch (error) {
    showAuthError(
      "Сервер временно недоступен. Можно продолжить без аккаунта."
    );
  }
}

function bindEvents() {
  $("authForm").addEventListener("submit", handleAuth);

  $("authSwitch").addEventListener(
    "click",
    switchAuthMode
  );

  $("guestBtn").addEventListener(
    "click",
    enterGuest
  );

  $("newChatBtn").addEventListener(
    "click",
    newChat
  );

  $("sendBtn").addEventListener(
    "click",
    sendMessage
  );

  $("messageInput").addEventListener(
    "keydown",
    handleInputKeydown
  );

  $("messageInput").addEventListener(
    "input",
    autoResize
  );

  $("attachBtn").addEventListener(
    "click",
    () => $("fileInput").click()
  );

  $("fileInput").addEventListener(
    "change",
    handleFiles
  );

  $("voiceBtn").addEventListener(
    "click",
    startVoice
  );

  $("settingsBtn").addEventListener(
    "click",
    () => show($("settingsModal"))
  );

  $("toolsBtn").addEventListener(
    "click",
    () => show($("toolsModal"))
  );

  $("logoutBtn").addEventListener(
    "click",
    logout
  );

  $("temporaryBtn").addEventListener(
    "click",
    toggleTemporary
  );

  $("temporarySetting").addEventListener(
    "change",
    e => {
      state.temporary = e.target.checked;
    }
  );

  $("saveSettingsBtn").addEventListener(
    "click",
    saveSettings
  );

  $("clearBtn").addEventListener(
    "click",
    clearCurrentChat
  );

  $("menuBtn").addEventListener(
    "click",
    () => $("sidebar").classList.toggle("open")
  );

  $("modelBtn").addEventListener(
    "click",
    () => $("modelMenu").classList.toggle("hidden")
  );

  document.addEventListener(
    "click",
    handleDocumentClick
  );

  document.querySelectorAll(".quick-card").forEach(
    button => {
      button.addEventListener("click", () => {
        if (button.dataset.tool) {
          useTool(button.dataset.tool);
          return;
        }

        $("messageInput").value =
          button.dataset.prompt || "";

        autoResize();
        $("messageInput").focus();
      });
    }
  );

  document.querySelectorAll("[data-close]").forEach(
    button => {
      button.addEventListener("click", () => {
        hide($(button.dataset.close));
      });
    }
  );

  document.querySelectorAll("[data-tool]").forEach(
    button => {
      button.addEventListener("click", () => {
        useTool(button.dataset.tool);
      });
    }
  );

  document.querySelectorAll("[data-model]").forEach(
    button => {
      button.addEventListener("click", () => {
        state.model = button.dataset.model;
        $("modelMenu").classList.add("hidden");

        toast(
          state.model === "neuro"
            ? "Выбран Нейро AI"
            : "Выбран автономный режим"
        );
      });
    }
  );

  $("fileConfirmBtn").addEventListener(
    "click",
    confirmFiles
  );
}

async function handleAuth(event) {
  event.preventDefault();

  const username = $("usernameInput").value.trim();
  const password = $("passwordInput").value;

  $("authSubmit").disabled = true;
  showAuthError("");

  try {
    const endpoint = state.registerMode
      ? "/api/auth/register"
      : "/api/auth/login";

    const result = await api(endpoint, {
      method: "POST",
      body: JSON.stringify({
        username,
        password
      })
    });

    state.user = result.user;

    hide($("authModal"));

    await loadChats();

    toast(
      state.registerMode
        ? "Аккаунт создан"
        : "Вы вошли в Нейро-чат"
    );

  } catch (error) {
    showAuthError(error.message);
  } finally {
    $("authSubmit").disabled = false;
  }
}

function switchAuthMode() {
  state.registerMode = !state.registerMode;

  $("authTitle").textContent =
    state.registerMode
      ? "Создать аккаунт"
      : "Вход в Нейро-чат";

  $("authDescription").textContent =
    state.registerMode
      ? "Создай аккаунт для сохранения чатов."
      : "Войди в свой аккаунт.";

  $("authSubmit").textContent =
    state.registerMode
      ? "Создать аккаунт"
      : "Войти";

  $("authSwitch").textContent =
    state.registerMode
      ? "У меня уже есть аккаунт"
      : "Создать аккаунт";

  $("passwordInput").autocomplete =
    state.registerMode
      ? "new-password"
      : "current-password";

  showAuthError("");
}

function enterGuest() {
  state.user = {
    id: null,
    username: "guest"
  };

  hide($("authModal"));

  clearMessages();

  toast("Гостевой режим включён");
}

async function logout() {
  try {
    await api("/api/auth/logout", {
      method: "POST"
    });
  } catch {}

  state.user = null;
  state.chatId = null;

  show($("authModal"));

  toast("Вы вышли из аккаунта");
}

async function loadChats() {
  if (!state.user || !state.user.id) {
    return;
  }

  try {
    const result = await api("/api/chats");

    renderChatList(result.chats || []);

    if (!state.chatId && result.chats?.length) {
      await openChat(result.chats[0].id);
    } else if (!result.chats?.length) {
      clearMessages();
    }
  } catch (error) {
    toast(error.message);
  }
}

function renderChatList(chats) {
  const list = $("chatList");
  list.innerHTML = "";

  chats.forEach(chat => {
    const item = document.createElement("div");

    item.className =
      "chat-item" +
      (chat.id === state.chatId ? " active" : "");

    item.innerHTML = `
      <span>💬</span>
      <span class="chat-item-title"></span>
      <button
        class="chat-delete"
        type="button"
        title="Удалить"
      >×</button>
    `;

    item.querySelector(".chat-item-title").textContent =
      chat.title;

    item.addEventListener(
      "click",
      event => {
        if (event.target.closest(".chat-delete")) {
          return;
        }

        openChat(chat.id);
      }
    );

    item.querySelector(".chat-delete").addEventListener(
      "click",
      async event => {
        event.stopPropagation();

        try {
          await api(`/api/chats/${chat.id}`, {
            method: "DELETE"
          });

          if (state.chatId === chat.id) {
            state.chatId = null;
            clearMessages();
          }

          await loadChats();
        } catch (error) {
          toast(error.message);
        }
      }
    );

    list.appendChild(item);
  });
}

async function openChat(chatId) {
  try {
    const result = await api(
      `/api/chats/${chatId}`
    );

    state.chatId = chatId;

    renderMessages(result.messages || []);

    $("sidebar").classList.remove("open");

    await loadChats();
  } catch (error) {
    toast(error.message);
  }
}

async function newChat() {
  if (!state.user?.id) {
    state.chatId = null;
    clearMessages();
    return;
  }

  try {
    const result = await api("/api/chats", {
      method: "POST",
      body: JSON.stringify({
        title: "Новый чат",
        temporary: state.temporary
      })
    });

    state.chatId = result.chat.id;

    clearMessages();

    await loadChats();

    $("messageInput").focus();
  } catch (error) {
    toast(error.message);
  }
}

async function sendMessage() {
  const input = $("messageInput");
  const message = input.value.trim();

  if (!message) return;

  input.value = "";
  autoResize();

  hide($("welcome"));

  addMessage("user", message);

  const loading = addMessage(
    "assistant",
    "Нейро-чат думает…"
  );

  $("sendBtn").disabled = true;

  try {
    if (!state.user?.id) {
      const answer =
        "Гостевой режим активен. Войдите в аккаунт, " +
        "чтобы сохранять историю чатов.";

      loading.remove();

      addMessage("assistant", answer);

      return;
    }

    const result = await api("/api/chat", {
      method: "POST",
      body: JSON.stringify({
        chatId: state.chatId,
        message,
        temporary: state.temporary,
        model: state.model
      })
    });

    state.chatId = result.chatId;

    loading.remove();

    addMessage(
      "assistant",
      result.answer || "Пустой ответ."
    );

    await loadChats();

  } catch (error) {
    loading.remove();

    addMessage(
      "assistant",
      "Ошибка: " + error.message
    );
  } finally {
    $("sendBtn").disabled = false;
  }
}

function addMessage(role, content) {
  const row = document.createElement("div");

  row.className =
    "message-row " +
    (role === "user" ? "user" : "assistant");

  const message = document.createElement("div");

  message.className =
    "message " +
    (role === "user" ? "user" : "assistant");

  message.textContent = content;

  row.appendChild(message);

  $("messages").appendChild(row);

  scrollMessages();

  return row;
}

function renderMessages(messages) {
  clearMessages();

  if (!messages.length) {
    show($("welcome"));
    return;
  }

  hide($("welcome"));

  messages.forEach(message => {
    addMessage(
      message.role,
      message.content
    );
  });
}

function clearMessages() {
  $("messages")
    .querySelectorAll(".message-row")
    .forEach(element => element.remove());

  show($("welcome"));
}

async function clearCurrentChat() {
  if (!state.chatId) {
    clearMessages();
    return;
  }

  if (!confirm("Очистить текущий чат?")) {
    return;
  }

  try {
    await api(`/api/chats/${state.chatId}`, {
      method: "DELETE"
    });

    state.chatId = null;

    clearMessages();

    await loadChats();

  } catch (error) {
    toast(error.message);
  }
}

function toggleTemporary() {
  state.temporary = !state.temporary;

  $("temporarySetting").checked =
    state.temporary;

  $("temporaryBtn").style.color =
    state.temporary
      ? "#79a5ff"
      : "";

  toast(
    state.temporary
      ? "Временный чат включён"
      : "Временный чат выключен"
  );
}

function saveSettings() {
  state.temporary =
    $("temporarySetting").checked;

  hide($("settingsModal"));

  toast("Настройки сохранены");
}

async function useTool(tool) {
  hide($("toolsModal"));

  if (!state.user?.id) {
    toast("Войдите в аккаунт, чтобы использовать инструменты.");
    return;
  }

  try {
    const result = await api("/api/tools", {
      method: "POST",
      body: JSON.stringify({
        tool
      })
    });

    $("messageInput").value =
      result.message || "";

    autoResize();
    $("messageInput").focus();

    toast("Инструмент выбран");
  } catch (error) {
    toast(error.message);
  }
}

function handleFiles(event) {
  state.files = Array.from(
    event.target.files || []
  );

  if (!state.files.length) {
    return;
  }

  $("attachmentPreview").innerHTML = "";

  state.files.forEach(file => {
    const item = document.createElement("div");

    item.className = "attachment";

    item.textContent =
      `📎 ${file.name} (${formatBytes(file.size)})`;

    $("attachmentPreview").appendChild(item);
  });

  $("fileInfo").innerHTML =
    state.files
      .map(
        file =>
          `<p>📎 ${escapeHTML(file.name)}</p>`
      )
      .join("");

  show($("fileModal"));
}

function confirmFiles() {
  hide($("fileModal"));

  if (state.files.length) {
    $("messageInput").value =
      "Я добавил файл: " +
      state.files.map(file => file.name).join(", ") +
      ". Помоги мне с ним.";

    autoResize();
    $("messageInput").focus();
  }
}

function startVoice() {
  const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    toast(
      "Голосовой ввод не поддерживается этим браузером."
    );
    return;
  }

  const recognition =
    new SpeechRecognition();

  recognition.lang = "ru-RU";
  recognition.interimResults = true;

  recognition.onstart = () => {
    $("voiceBtn").style.color = "#79a5ff";
    toast("Слушаю…");
  };

  recognition.onresult = event => {
    let text = "";

    for (
      let i = event.resultIndex;
      i < event.results.length;
      i++
    ) {
      text += event.results[i][0].transcript;
    }

    $("messageInput").value = text;
    autoResize();
  };

  recognition.onerror = () => {
    toast("Не удалось распознать голос.");
  };

  recognition.onend = () => {
    $("voiceBtn").style.color = "";
  };

  recognition.start();
}

function handleInputKeydown(event) {
  if (
    event.key === "Enter" &&
    !event.shiftKey
  ) {
    event.preventDefault();
    sendMessage();
  }
}

function autoResize() {
  const input = $("messageInput");

  input.style.height = "auto";

  input.style.height =
    Math.min(input.scrollHeight, 180) + "px";
}

function handleDocumentClick(event) {
  if (
    !event.target.closest(".model-selector")
  ) {
    $("modelMenu").classList.add("hidden");
  }
}

function show(element) {
  element.classList.remove("hidden");
}

function hide(element) {
  element.classList.add("hidden");
}

function showAuthError(message) {
  $("authError").textContent = message || "";
}

function scrollMessages() {
  requestAnimationFrame(() => {
    $("messages").scrollTop =
      $("messages").scrollHeight;
  });
}

function toast(message) {
  const element = $("toast");

  element.textContent = message;
  element.classList.add("show");

  clearTimeout(toast.timer);

  toast.timer = setTimeout(() => {
    element.classList.remove("show");
  }, 2600);
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " Б";

  if (bytes < 1024 * 1024) {
    return (bytes / 1024).toFixed(1) + " КБ";
  }

  return (
    (bytes / 1024 / 1024).toFixed(1) +
    " МБ"
  );
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}