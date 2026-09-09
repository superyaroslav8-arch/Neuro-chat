"use strict";

const $ = id => document.getElementById(id);

const state = {
  user: null,
  chats: [],
  currentChat: null,
  mode: "chat",
  busy: false,
  authMode: "login",
  attachments: []
};


/* =========================
   API
========================= */

async function api(path, options = {}) {
  const config = {
    credentials: "same-origin",
    ...options
  };

  if (
    config.body &&
    typeof config.body !== "string"
  ) {
    config.headers = {
      ...(config.headers || {}),
      "Content-Type": "application/json"
    };

    config.body = JSON.stringify(
      config.body
    );
  }

  const response = await fetch(
    path,
    config
  );

  const text = await response.text();

  let data = {};

  try {
    data = text
      ? JSON.parse(text)
      : {};
  } catch {
    throw new Error(
      `Сервер вернул некорректный ответ (${response.status}).`
    );
  }

  if (!response.ok) {
    throw new Error(
      data.error ||
      `Ошибка сервера (${response.status}).`
    );
  }

  return data;
}


/* =========================
   UI
========================= */

function toast(message) {
  const element = $("toast");

  element.textContent = message;

  element.classList.add("show");

  clearTimeout(toast.timer);

  toast.timer = setTimeout(() => {
    element.classList.remove("show");
  }, 2800);
}

function escapeHTML(value) {
  return String(value).replace(
    /[&<>"']/g,
    character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[character]
  );
}

function showAuth() {
  $("authScreen").classList.remove("hidden");
  $("app").classList.add("hidden");
}

function showApp() {
  $("authScreen").classList.add("hidden");
  $("app").classList.remove("hidden");
}

function setBusy(value) {
  state.busy = value;

  $("sendBtn").disabled = value;
  $("authSubmit").disabled = value;
}


/* =========================
   AUTH
========================= */

function setAuthMode(mode) {
  state.authMode = mode;

  const login = mode === "login";

  $("loginTab").classList.toggle(
    "active",
    login
  );

  $("registerTab").classList.toggle(
    "active",
    !login
  );

  $("confirmField").classList.toggle(
    "hidden",
    login
  );

  $("authSubmit").textContent =
    login
      ? "Войти"
      : "Создать аккаунт";

  $("authError").textContent = "";

  $("password2").value = "";
}

async function submitAuth(event) {
  event.preventDefault();

  if (state.busy) {
    return;
  }

  const username =
    $("username").value.trim();

  const password =
    $("password").value;

  const password2 =
    $("password2").value;

  $("authError").textContent = "";

  if (!username || !password) {
    $("authError").textContent =
      "Заполните все поля.";

    return;
  }

  if (
    state.authMode === "register" &&
    password !== password2
  ) {
    $("authError").textContent =
      "Пароли не совпадают.";

    return;
  }

  setBusy(true);

  try {
    const endpoint =
      state.authMode === "login"
        ? "/api/auth/login"
        : "/api/auth/register";

    const data = await api(
      endpoint,
      {
        method: "POST",
        body: {
          username,
          password
        }
      }
    );

    state.user = data.user;

    showApp();

    await loadChats();

  } catch (error) {
    $("authError").textContent =
      error.message;

  } finally {
    setBusy(false);
  }
}

async function checkAuth() {
  try {
    const data = await api(
      "/api/auth/me"
    );

    if (data.user) {
      state.user = data.user;

      showApp();

      await loadChats();

    } else {
      showAuth();
    }

  } catch {
    showAuth();
  }
}

async function logout() {
  try {
    await api(
      "/api/auth/logout",
      {
        method: "POST"
      }
    );
  } catch {
    // Даже если сервер недоступен,
    // локально возвращаем окно входа.
  }

  state.user = null;
  state.chats = [];
  state.currentChat = null;

  showAuth();
}


/* =========================
   CHATS
========================= */

async function loadChats() {
  const data = await api(
    "/api/chats"
  );

  state.chats =
    Array.isArray(data.chats)
      ? data.chats
      : [];

  updateAccount();

  renderChats();

  if (!state.chats.length) {
    await createChat();
    return;
  }

  const currentExists =
    state.currentChat &&
    state.chats.some(
      chat =>
        chat.id ===
        state.currentChat.id
    );

  await openChat(
    currentExists
      ? state.currentChat.id
      : state.chats[0].id
  );
}

async function createChat() {
  const data = await api(
    "/api/chats",
    {
      method: "POST",
      body: {
        title: "Новый чат"
      }
    }
  );

  state.chats.unshift(
    data.chat
  );

  renderChats();

  await openChat(
    data.chat.id
  );
}

async function openChat(chatId) {
  const data = await api(
    `/api/chats/${encodeURIComponent(chatId)}`
  );

  state.currentChat = data.chat;

  $("chatTitle").textContent =
    state.currentChat.title ||
    "Новый чат";

  renderChats();
  renderMessages();
}

async function deleteCurrentChat() {
  if (!state.currentChat) {
    return;
  }

  const confirmed =
    window.confirm(
      "Удалить этот чат?"
    );

  if (!confirmed) {
    return;
  }

  await api(
    `/api/chats/${encodeURIComponent(
      state.currentChat.id
    )}`,
    {
      method: "DELETE"
    }
  );

  state.chats =
    state.chats.filter(
      chat =>
        chat.id !==
        state.currentChat.id
    );

  state.currentChat = null;

  if (!state.chats.length) {
    await createChat();
    return;
  }

  renderChats();

  await openChat(
    state.chats[0].id
  );
}

function renderChats() {
  const list =
    $("chatList");

  list.innerHTML = "";

  for (const chat of state.chats) {
    const item =
      document.createElement("div");

    item.className =
      "chat-item" +
      (
        state.currentChat?.id === chat.id
          ? " active"
          : ""
      );

    item.innerHTML = `
      <span>💬</span>

      <span class="chat-name">
        ${escapeHTML(
          chat.title || "Новый чат"
        )}
      </span>

      <button
        class="chat-delete"
        type="button"
        title="Удалить"
      >
        ×
      </button>
    `;

    item.addEventListener(
      "click",
      async event => {
        if (
          event.target.closest(
            ".chat-delete"
          )
        ) {
          event.stopPropagation();

          await deleteChatById(
            chat.id
          );

          return;
        }

        await openChat(
          chat.id
        );

        closeSidebar();
      }
    );

    list.appendChild(item);
  }
}

async function deleteChatById(chatId) {
  const confirmed =
    window.confirm(
      "Удалить этот чат?"
    );

  if (!confirmed) {
    return;
  }

  await api(
    `/api/chats/${encodeURIComponent(
      chatId
    )}`,
    {
      method: "DELETE"
    }
  );

  state.chats =
    state.chats.filter(
      chat =>
        chat.id !== chatId
    );

  if (
    state.currentChat?.id ===
    chatId
  ) {
    state.currentChat = null;
  }

  if (!state.chats.length) {
    await createChat();
  } else {
    renderChats();

    await openChat(
      state.chats[0].id
    );
  }
}


/* =========================
   MESSAGES
========================= */

function renderMessages() {
  const box =
    $("messages");

  box.innerHTML = "";

  const messages =
    state.currentChat?.messages ||
    [];

  if (!messages.length) {
    const welcome =
      document.createElement("div");

    welcome.id = "welcome";
    welcome.className = "welcome";

    welcome.innerHTML = `
      <div class="welcome-icon">✦</div>

      <h2>Чем помочь?</h2>

      <p>
        Задайте вопрос или выберите
        один из вариантов ниже.
      </p>

      <div class="suggestions">

        <button
          class="suggestion"
          data-prompt="Объясни простыми словами, как работает 3D-печать"
          type="button"
        >
          🧩 Объяснить тему
        </button>

        <button
          class="suggestion"
          data-prompt="Придумай 5 идей для современного сайта"
          type="button"
        >
          💡 Придумать идеи
        </button>

        <button
          class="suggestion"
          data-prompt="Помоги написать красивый текст для сайта"
          type="button"
        >
          ✍️ Написать текст
        </button>

      </div>
    `;

    box.appendChild(welcome);

    attachSuggestionHandlers();

    return;
  }

  for (const message of messages) {
    renderMessage(
      message
    );
  }

  requestAnimationFrame(() => {
    box.scrollTop =
      box.scrollHeight;
  });
}

function renderMessage(message) {
  const box =
    $("messages");

  const row =
    document.createElement("div");

  row.className =
    `message ${message.role}`;

  const bubble =
    document.createElement("div");

  bubble.className =
    "message-bubble";

  bubble.textContent =
    message.content || "";

  row.appendChild(
    bubble
  );

  box.appendChild(
    row
  );
}

function attachSuggestionHandlers() {
  document
    .querySelectorAll(
      ".suggestion"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          $("prompt").value =
            button.dataset.prompt;

          resizeTextarea();

          sendMessage();
        }
      );
    });
}


/* =========================
   SEND MESSAGE
========================= */

async function sendMessage() {
  if (state.busy) {
    return;
  }

  if (!state.currentChat) {
    toast("Сначала создайте чат.");
    return;
  }

  const prompt =
    $("prompt").value.trim();

  if (!prompt) {
    return;
  }

  if (state.mode === "image") {
    await generateImage(
      prompt
    );

    return;
  }

  if (state.mode === "video") {
    await generateVideo(
      prompt
    );

    return;
  }

  $("prompt").value = "";

  resizeTextarea();

  state.busy = true;

  $("sendBtn").disabled = true;

  const temporaryUserMessage = {
    id: `temp-${Date.now()}`,
    role: "user",
    content: prompt
  };

  state.currentChat.messages =
    state.currentChat.messages || [];

  state.currentChat.messages.push(
    temporaryUserMessage
  );

  renderMessages();

  const loading = {
    id: `loading-${Date.now()}`,
    role: "assistant",
    content: "Нейро думает…"
  };

  state.currentChat.messages.push(
    loading
  );

  renderMessages();

  try {
    const data = await api(
      "/api/chat",
      {
        method: "POST",
        body: {
          chatId:
            state.currentChat.id,
          prompt
        }
      }
    );

    state.currentChat.messages =
      state.currentChat.messages.filter(
        message =>
          message.id !==
          temporaryUserMessage.id &&
          message.id !==
          loading.id
      );

    state.currentChat.messages.push(
      {
        id: `user-${Date.now()}`,
        role: "user",
        content: prompt
      }
    );

    state.currentChat.messages.push(
      data.message
    );

    state.currentChat.title =
      data.chat.title;

    $("chatTitle").textContent =
      data.chat.title;

    const chat =
      state.chats.find(
        item =>
          item.id ===
          state.currentChat.id
      );

    if (chat) {
      chat.title =
        data.chat.title;
      chat.updatedAt =
        data.chat.updatedAt;
    }

    renderChats();
    renderMessages();

  } catch (error) {
    state.currentChat.messages =
      state.currentChat.messages.filter(
        message =>
          message.id !==
          loading.id
      );

    renderMessages();

    toast(
      error.message
    );

  } finally {
    state.busy = false;
    $("sendBtn").disabled = false;

    $("prompt").focus();
  }
}


/* =========================
   IMAGE
========================= */

async function generateImage(prompt) {
  if (state.busy) {
    return;
  }

  state.busy = true;

  $("sendBtn").disabled = true;

  addLocalMessage(
    "user",
    `Создай изображение: ${prompt}`
  );

  addLocalMessage(
    "assistant",
    "Создаю изображение…"
  );

  try {
    const data = await api(
      "/api/generate/image",
      {
        method: "POST",
        body: {
          prompt
        }
      }
    );

    removeLastLocalMessage();

    const box =
      $("messages");

    const row =
      document.createElement("div");

    row.className =
      "message assistant";

    const bubble =
      document.createElement("div");

    bubble.className =
      "message-bubble";

    const image =
      document.createElement("img");

    image.className =
      "message-image";

    image.src =
      data.image;

    image.alt =
      prompt;

    bubble.appendChild(
      image
    );

    row.appendChild(
      bubble
    );

    box.appendChild(
      row
    );

    box.scrollTop =
      box.scrollHeight;

  } catch (error) {
    removeLastLocalMessage();

    toast(
      error.message
    );

  } finally {
    state.busy = false;
    $("sendBtn").disabled = false;
  }
}

async function generateVideo(prompt) {
  toast(
    "Генерация видео пока не подключена."
  );
}


/* =========================
   LOCAL UI HELPERS
========================= */

function addLocalMessage(
  role,
  content
) {
  if (!state.currentChat) {
    return;
  }

  state.currentChat.messages =
    state.currentChat.messages || [];

  state.currentChat.messages.push({
    id: `local-${Date.now()}-${Math.random()}`,
    role,
    content
  });

  renderMessages();
}

function removeLastLocalMessage() {
  if (
    !state.currentChat ||
    !state.currentChat.messages
  ) {
    return;
  }

  state.currentChat.messages.pop();

  renderMessages();
}


/* =========================
   MODES
========================= */

function setMode(mode) {
  state.mode = mode;

  $("chatMode").classList.toggle(
    "active",
    mode === "chat"
  );

  $("imageMode").classList.toggle(
    "active",
    mode === "image"
  );

  $("videoMode").classList.toggle(
    "active",
    mode === "video"
  );

  const prompt =
    $("prompt");

  if (mode === "chat") {
    prompt.placeholder =
      "Сообщение для Нейро…";
  }

  if (mode === "image") {
    prompt.placeholder =
      "Опишите изображение…";
  }

  if (mode === "video") {
    prompt.placeholder =
      "Опишите видео…";
  }
}


/* =========================
   FILES
========================= */

function openAttachModal() {
  $("attachModal")
    .classList
    .remove("hidden");
}

function closeAttachModal() {
  $("attachModal")
    .classList
    .add("hidden");
}

function chooseFileType(type) {
  const input =
    $("fileInput");

  if (type === "photo") {
    input.accept =
      "image/*";
  }

  if (type === "video") {
    input.accept =
      "video/*";
  }

  if (type === "any") {
    input.accept =
      "image/*,video/*";
  }

  closeAttachModal();

  input.click();
}

function handleFiles(event) {
  const files =
    Array.from(
      event.target.files || []
    );

  state.attachments =
    files;

  renderAttachments();

  event.target.value = "";
}

function renderAttachments() {
  const box =
    $("attachments");

  box.innerHTML = "";

  if (!state.attachments.length) {
    box.classList.add("hidden");
    return;
  }

  box.classList.remove("hidden");

  for (const file of state.attachments) {
    const item =
      document.createElement("div");

    item.className =
      "attachment";

    item.textContent =
      file.name;

    box.appendChild(
      item
    );
  }
}


/* =========================
   SETTINGS
========================= */

function updateAccount() {
  if (!state.user) {
    return;
  }

  const username =
    state.user.username;

  $("accountName").textContent =
    username;

  $("settingsUser").textContent =
    username;

  $("avatar").textContent =
    username
      .charAt(0)
      .toUpperCase();
}

function openSettings() {
  $("settingsModal")
    .classList
    .remove("hidden");
}

function closeSettings() {
  $("settingsModal")
    .classList
    .add("hidden");
}


/* =========================
   MOBILE SIDEBAR
========================= */

function toggleSidebar() {
  $("sidebar")
    .classList
    .toggle("open");
}

function closeSidebar() {
  $("sidebar")
    .classList
    .remove("open");
}


/* =========================
   TEXTAREA
========================= */

function resizeTextarea() {
  const textarea =
    $("prompt");

  textarea.style.height =
    "auto";

  textarea.style.height =
    Math.min(
      textarea.scrollHeight,
      150
    ) + "px";
}


/* =========================
   EVENTS
========================= */

function bindEvents() {

  $("loginTab")
    .addEventListener(
      "click",
      () =>
        setAuthMode("login")
    );

  $("registerTab")
    .addEventListener(
      "click",
      () =>
        setAuthMode("register")
    );

  $("authForm")
    .addEventListener(
      "submit",
      submitAuth
    );

  $("logoutBtn")
    .addEventListener(
      "click",
      logout
    );

  $("newChat")
    .addEventListener(
      "click",
      async () => {
        try {
          await createChat();
          closeSidebar();
        } catch (error) {
          toast(
            error.message
          );
        }
      }
    );

  $("deleteChatBtn")
    .addEventListener(
      "click",
      async () => {
        try {
          await deleteCurrentChat();
        } catch (error) {
          toast(
            error.message
          );
        }
      }
    );

  $("sendBtn")
    .addEventListener(
      "click",
      sendMessage
    );

  $("prompt")
    .addEventListener(
      "input",
      resizeTextarea
    );

  $("prompt")
    .addEventListener(
      "keydown",
      event => {
        if (
          event.key === "Enter" &&
          !event.shiftKey
        ) {
          event.preventDefault();

          sendMessage();
        }
      }
    );

  $("chatMode")
    .addEventListener(
      "click",
      () => setMode("chat")
    );

  $("imageMode")
    .addEventListener(
      "click",
      () => setMode("image")
    );

  $("videoMode")
    .addEventListener(
      "click",
      () => setMode("video")
    );

  $("attachBtn")
    .addEventListener(
      "click",
      openAttachModal
    );

  $("closeAttach")
    .addEventListener(
      "click",
      closeAttachModal
    );

  $("pickPhoto")
    .addEventListener(
      "click",
      () =>
        chooseFileType("photo")
    );

  $("pickVideo")
    .addEventListener(
      "click",
      () =>
        chooseFileType("video")
    );

  $("pickAny")
    .addEventListener(
      "click",
      () =>
        chooseFileType("any")
    );

  $("fileInput")
    .addEventListener(
      "change",
      handleFiles
    );

  $("settingsBtn")
    .addEventListener(
      "click",
      openSettings
    );

  $("closeSettings")
    .addEventListener(
      "click",
      closeSettings
    );

  $("menuBtn")
    .addEventListener(
      "click",
      toggleSidebar
    );

  document.addEventListener(
    "click",
    event => {
      const suggestion =
        event.target.closest(
          ".suggestion"
        );

      if (
        suggestion &&
        suggestion.dataset.prompt
      ) {
        $("prompt").value =
          suggestion.dataset.prompt;

        resizeTextarea();

        sendMessage();
      }
    }
  );

  document.addEventListener(
    "keydown",
    event => {
      if (
        event.key === "Escape"
      ) {
        closeAttachModal();
        closeSettings();
      }
    }
  );
}


/* =========================
   START
========================= */

document.addEventListener(
  "DOMContentLoaded",
  async () => {
    bindEvents();

    setAuthMode("login");

    setMode("chat");

    await checkAuth();
  }
);