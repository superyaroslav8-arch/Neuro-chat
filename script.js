/* =========================================================
   NEURO CHAT
   script.js
   ========================================================= */

"use strict";

/* =========================================================
   CONFIG
   ========================================================= */

const API = {
  session: "/api/auth/session",
  login: "/api/auth/login",
  register: "/api/auth/register",
  logout: "/api/auth/logout",
  chat: "/api/chat"
};

const STORAGE_KEYS = {
  chats: "neuro_chats",
  temporary: "neuro_temporary_chats",
  animations: "neuro_animations"
};

/* =========================================================
   STATE
   ========================================================= */

const state = {
  user: null,
  messages: [],
  chats: [],
  currentChatId: null,
  isGenerating: false,
  selectedTool: null,
  temporaryChats: false,
  animationsEnabled: true
};

/* =========================================================
   DOM
   ========================================================= */

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const authScreen = $("#authScreen");
const authForm = $("#authForm");
const usernameInput = $("#username");
const passwordInput = $("#password");
const loginButton = $("#loginButton");
const registerButton = $("#registerButton");
const authError = $("#authError");

const app = $("#app");

const sidebar = $("#sidebar");
const sidebarOverlay = $("#sidebarOverlay");
const openSidebarButton = $("#openSidebarButton");
const closeSidebarButton = $("#closeSidebarButton");

const newChatButton = $("#newChatButton");
const chatHistory = $("#chatHistory");

const settingsButton = $("#settingsButton");
const logoutButton = $("#logoutButton");

const profileButton = $("#profileButton");
const profileInitial = $("#profileInitial");

const profileModal = $("#profileModal");
const profileBigAvatar = $("#profileBigAvatar");
const profileName = $("#profileName");
const profileUsername = $("#profileUsername");
const profileLogoutButton = $("#profileLogoutButton");

const settingsModal = $("#settingsModal");
const temporaryChats = $("#temporaryChats");
const animationsEnabled = $("#animationsEnabled");

const welcomeScreen = $("#welcomeScreen");
const messagesContainer = $("#messages");

const messageInput = $("#messageInput");
const sendButton = $("#sendButton");

const attachButton = $("#attachButton");
const fileInput = $("#fileInput");
const voiceButton = $("#voiceButton");

const typingIndicator = $("#typingIndicator");

const toolModal = $("#toolModal");
const toolModalTitle = $("#toolModalTitle");
const toolModalDescription = $("#toolModalDescription");
const toolPrompt = $("#toolPrompt");
const toolRunButton = $("#toolRunButton");
const toolStatus = $("#toolStatus");

const toastContainer = $("#toastContainer");

/* =========================================================
   INITIALIZATION
   ========================================================= */

document.addEventListener("DOMContentLoaded", init);

async function init() {
  loadLocalSettings();
  applyAnimationSetting();

  setupAuth();
  setupNavigation();
  setupChat();
  setupTools();
  setupModals();
  setupFiles();
  setupVoice();

  await restoreSession();
}

/* =========================================================
   AUTHENTICATION
   ========================================================= */

function setupAuth() {
  authForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!username || !password) {
      showAuthError("Введите логин и пароль.");
      return;
    }

    await login(username, password);
  });

  registerButton?.addEventListener("click", async () => {
    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!username || !password) {
      showAuthError("Для регистрации сначала введите логин и пароль.");
      return;
    }

    await register(username, password);
  });

  logoutButton?.addEventListener("click", logout);
  profileLogoutButton?.addEventListener("click", logout);
}

async function restoreSession() {
  try {
    const response = await apiRequest(API.session, {
      method: "GET"
    });

    if (!response.ok) {
      showAuthScreen();
      return;
    }

    const data = await readJson(response);

    if (data?.authenticated && data.user) {
      state.user = data.user;
      showApp();
      return;
    }

    showAuthScreen();
  } catch (error) {
    /*
      Если сервер временно недоступен,
      не зацикливаем окно авторизации.
    */
    console.error("Session restore error:", error);

    showAuthScreen();
  }
}

async function login(username, password) {
  setAuthLoading(true);
  hideAuthError();

  try {
    const response = await apiRequest(API.login, {
      method: "POST",
      body: {
        username,
        password
      }
    });

    const data = await readJson(response);

    if (!response.ok) {
      throw new Error(
        getServerError(data, "Не удалось выполнить вход.")
      );
    }

    if (!data?.user) {
      throw new Error("Сервер не вернул данные пользователя.");
    }

    state.user = data.user;

    showApp();

    usernameInput.value = "";
    passwordInput.value = "";

    showToast("Вы успешно вошли в Neuro Chat.");
  } catch (error) {
    console.error("Login error:", error);
    showAuthError(cleanErrorMessage(error));
  } finally {
    setAuthLoading(false);
  }
}

async function register(username, password) {
  setAuthLoading(true);
  hideAuthError();

  try {
    const response = await apiRequest(API.register, {
      method: "POST",
      body: {
        username,
        password
      }
    });

    const data = await readJson(response);

    if (!response.ok) {
      throw new Error(
        getServerError(data, "Не удалось создать аккаунт.")
      );
    }

    if (!data?.user) {
      throw new Error("Сервер не вернул данные пользователя.");
    }

    state.user = data.user;

    showApp();

    usernameInput.value = "";
    passwordInput.value = "";

    showToast("Аккаунт создан.");
  } catch (error) {
    console.error("Registration error:", error);
    showAuthError(cleanErrorMessage(error));
  } finally {
    setAuthLoading(false);
  }
}

async function logout() {
  try {
    await apiRequest(API.logout, {
      method: "POST"
    });
  } catch (error) {
    console.error("Logout error:", error);
  }

  state.user = null;
  state.messages = [];
  state.currentChatId = null;

  closeAllModals();
  closeSidebar();

  showAuthScreen();
}

/* =========================================================
   AUTH UI
   ========================================================= */

function showApp() {
  if (!state.user) {
    showAuthScreen();
    return;
  }

  authScreen.hidden = true;
  app.hidden = false;

  updateProfile();

  loadChats();

  if (state.chats.length > 0) {
    openChat(state.chats[0].id);
  } else {
    createNewChat(false);
  }
}

function showAuthScreen() {
  app.hidden = true;
  authScreen.hidden = false;

  hideAuthError();

  setTimeout(() => {
    usernameInput?.focus();
  }, 50);
}

function setAuthLoading(loading) {
  loginButton.disabled = loading;
  registerButton.disabled = loading;

  loginButton.textContent = loading
    ? "Проверка..."
    : "Войти";

  registerButton.textContent = loading
    ? "Подождите..."
    : "Создать аккаунт";
}

function showAuthError(message) {
  if (!authError) return;

  authError.textContent = message;
  authError.hidden = false;
}

function hideAuthError() {
  if (!authError) return;

  authError.textContent = "";
  authError.hidden = true;
}

/* =========================================================
   API
   ========================================================= */

async function apiRequest(url, options = {}) {
  const config = {
    method: options.method || "GET",
    credentials: "same-origin",
    headers: {
      Accept: "application/json"
    }
  };

  if (options.body !== undefined) {
    config.headers["Content-Type"] = "application/json";
    config.body = JSON.stringify(options.body);
  }

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, options.timeout || 30000);

  config.signal = controller.signal;

  try {
    return await fetch(url, config);
  } finally {
    clearTimeout(timeout);
  }
}

async function readJson(response) {
  const contentType =
    response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    const text = await response.text();

    return {
      ok: response.ok,
      message: text
    };
  }

  try {
    return await response.json();
  } catch {
    return {
      ok: false,
      message: "Сервер вернул повреждённый JSON-ответ."
    };
  }
}

function getServerError(data, fallback) {
  if (!data) return fallback;

  return (
    data.error ||
    data.message ||
    data.details ||
    fallback
  );
}

function cleanErrorMessage(error) {
  if (!error) {
    return "Произошла неизвестная ошибка.";
  }

  if (error.name === "AbortError") {
    return "Сервер слишком долго не отвечает. Попробуйте ещё раз.";
  }

  const message = String(error.message || error);

  /*
    Не показываем пользователю внутренние технические
    адреса, stack trace и прочую серверную информацию.
  */

  if (
    /failed to fetch/i.test(message) ||
    /networkerror/i.test(message) ||
    /network error/i.test(message)
  ) {
    return "Не удалось связаться с сервером. Проверьте подключение и попробуйте ещё раз.";
  }

  if (
    /ECONNREFUSED/i.test(message) ||
    /ECONNRESET/i.test(message) ||
    /ENOTFOUND/i.test(message)
  ) {
    return "Сервер временно недоступен. Попробуйте ещё раз.";
  }

  return message
    .replace(/https?:\/\/[^\s]+/gi, "")
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, "")
    .trim() || "Произошла ошибка.";
}

/* =========================================================
   NAVIGATION
   ========================================================= */

function setupNavigation() {
  openSidebarButton?.addEventListener("click", openSidebar);
  closeSidebarButton?.addEventListener("click", closeSidebar);

  sidebarOverlay?.addEventListener("click", closeSidebar);

  newChatButton?.addEventListener("click", () => {
    createNewChat(true);
    closeSidebar();
  });

  settingsButton?.addEventListener("click", () => {
    openModal(settingsModal);
    closeSidebar();
  });

  profileButton?.addEventListener("click", () => {
    updateProfile();
    openModal(profileModal);
  });
}

function openSidebar() {
  sidebar?.classList.add("open");

  if (sidebarOverlay) {
    sidebarOverlay.hidden = false;
  }
}

function closeSidebar() {
  sidebar?.classList.remove("open");

  if (sidebarOverlay) {
    sidebarOverlay.hidden = true;
  }
}

/* =========================================================
   CHAT
   ========================================================= */

function setupChat() {
  sendButton?.addEventListener("click", sendMessage);

  messageInput?.addEventListener("input", () => {
    autoResizeTextarea();
    updateSendButton();
  });

  messageInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();

      if (!state.isGenerating) {
        sendMessage();
      }
    }
  });

  $$(".suggestion").forEach((button) => {
    button.addEventListener("click", () => {
      const prompt = button.dataset.prompt || "";

      messageInput.value = prompt;

      autoResizeTextarea();
      updateSendButton();

      sendMessage();
    });
  });
}

async function sendMessage() {
  if (state.isGenerating) return;

  const text = messageInput.value.trim();

  if (!text) return;

  addMessage("user", text);

  messageInput.value = "";
  autoResizeTextarea();
  updateSendButton();

  if (welcomeScreen) {
    welcomeScreen.hidden = true;
  }

  state.isGenerating = true;
  setGenerating(true);

  try {
    const response = await apiRequest(API.chat, {
      method: "POST",
      timeout: 120000,
      body: {
        message: text,
        messages: state.messages.map((message) => ({
          role: message.role,
          content: message.content
        })),
        chatId: state.currentChatId
      }
    });

    const data = await readJson(response);

    if (!response.ok) {
      throw new Error(
        getServerError(
          data,
          "Не удалось получить ответ от Neuro."
        )
      );
    }

    const answer = extractAssistantAnswer(data);

    if (!answer) {
      throw new Error(
        "Сервер не вернул текст ответа."
      );
    }

    addMessage("assistant", answer);

    saveCurrentChat();
  } catch (error) {
    console.error("Chat error:", error);

    addMessage(
      "assistant",
      cleanErrorMessage(error)
    );
  } finally {
    state.isGenerating = false;
    setGenerating(false);
  }
}

function extractAssistantAnswer(data) {
  if (!data) return "";

  /*
    Поддерживаем несколько распространённых форматов
    ответа сервера.
  */

  if (typeof data.answer === "string") {
    return data.answer;
  }

  if (typeof data.response === "string") {
    return data.response;
  }

  if (typeof data.message === "string") {
    return data.message;
  }

  if (typeof data.content === "string") {
    return data.content;
  }

  if (typeof data.text === "string") {
    return data.text;
  }

  if (data.choices?.[0]?.message?.content) {
    return String(data.choices[0].message.content);
  }

  if (data.choices?.[0]?.text) {
    return String(data.choices[0].text);
  }

  return "";
}

function addMessage(role, content) {
  const message = {
    id: crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`,
    role,
    content,
    createdAt: Date.now()
  };

  state.messages.push(message);

  renderMessage(message);
}

function renderMessage(message) {
  const wrapper = document.createElement("div");

  wrapper.className =
    `message ${message.role === "user" ? "user" : "assistant"}`;

  const avatar = document.createElement("div");

  avatar.className = "message-avatar";
  avatar.textContent =
    message.role === "user"
      ? getUserInitial()
      : "N";

  const content = document.createElement("div");

  content.className = "message-content";

  content.innerHTML = formatMessage(message.content);

  wrapper.appendChild(avatar);
  wrapper.appendChild(content);

  messagesContainer.appendChild(wrapper);

  scrollChatToBottom();
}

function formatMessage(text) {
  if (!text) return "";

  let safe = escapeHtml(String(text));

  /*
    Простое форматирование Markdown-подобного текста.
    HTML пользователя не выполняется.
  */

  safe = safe.replace(
    /```([\s\S]*?)```/g,
    "<pre><code>$1</code></pre>"
  );

  safe = safe.replace(
    /`([^`]+)`/g,
    "<code>$1</code>"
  );

  safe = safe.replace(
    /\*\*([^*]+)\*\*/g,
    "<strong>$1</strong>"
  );

  safe = safe.replace(
    /\*([^*]+)\*/g,
    "<em>$1</em>"
  );

  safe = safe.replace(
    /^### (.+)$/gm,
    "<strong>$1</strong>"
  );

  safe = safe.replace(
    /^## (.+)$/gm,
    "<strong>$1</strong>"
  );

  safe = safe.replace(
    /^# (.+)$/gm,
    "<strong>$1</strong>"
  );

  safe = safe.replace(
    /\n/g,
    "<br>"
  );

  return safe;
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value;

  return div.innerHTML;
}

function setGenerating(generating) {
  if (typingIndicator) {
    typingIndicator.hidden = !generating;
  }

  if (sendButton) {
    sendButton.disabled = generating ||
      !messageInput.value.trim();
  }

  if (messageInput) {
    messageInput.disabled = generating;
  }

  if (generating) {
    scrollChatToBottom();
  }
}

function updateSendButton() {
  if (!sendButton) return;

  sendButton.disabled =
    state.isGenerating ||
    !messageInput.value.trim();
}

function scrollChatToBottom() {
  requestAnimationFrame(() => {
    const area = $("#chatArea");

    if (!area) return;

    area.scrollTo({
      top: area.scrollHeight,
      behavior: state.animationsEnabled
        ? "smooth"
        : "auto"
    });
  });
}

function autoResizeTextarea() {
  if (!messageInput) return;

  messageInput.style.height = "auto";

  const height = Math.min(
    messageInput.scrollHeight,
    190
  );

  messageInput.style.height = `${height}px`;
}

/* =========================================================
   CHAT HISTORY
   ========================================================= */

function loadChats() {
  if (state.temporaryChats) {
    state.chats = [];
    renderChatHistory();
    return;
  }

  try {
    const raw = localStorage.getItem(
      STORAGE_KEYS.chats
    );

    state.chats = raw
      ? JSON.parse(raw)
      : [];
  } catch {
    state.chats = [];
  }

  renderChatHistory();
}

function saveChats() {
  if (state.temporaryChats) return;

  try {
    localStorage.setItem(
      STORAGE_KEYS.chats,
      JSON.stringify(state.chats)
    );
  } catch (error) {
    console.error("Chat storage error:", error);
  }
}

function createNewChat(showMessage = true) {
  const chat = {
    id:
      crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`,
    title: "Новый чат",
    messages: [],
    updatedAt: Date.now()
  };

  state.chats.unshift(chat);
  state.currentChatId = chat.id;
  state.messages = [];

  renderMessages();

  if (welcomeScreen) {
    welcomeScreen.hidden = false;
  }

  renderChatHistory();

  saveChats();

  if (showMessage) {
    showToast("Новый чат создан.");
  }
}

function openChat(id) {
  const chat = state.chats.find(
    (item) => item.id === id
  );

  if (!chat) return;

  state.currentChatId = id;
  state.messages = Array.isArray(chat.messages)
    ? [...chat.messages]
    : [];

  renderMessages();

  if (welcomeScreen) {
    welcomeScreen.hidden =
      state.messages.length > 0;
  }

  renderChatHistory();
}

function saveCurrentChat() {
  if (!state.currentChatId || state.temporaryChats) {
    return;
  }

  const chat = state.chats.find(
    (item) => item.id === state.currentChatId
  );

  if (!chat) return;

  chat.messages = [...state.messages];
  chat.updatedAt = Date.now();

  const firstUserMessage =
    state.messages.find(
      (message) => message.role === "user"
    );

  if (
    chat.title === "Новый чат" &&
    firstUserMessage
  ) {
    chat.title =
      firstUserMessage.content
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 42) ||
      "Новый чат";
  }

  state.chats.sort(
    (a, b) => b.updatedAt - a.updatedAt
  );

  saveChats();
  renderChatHistory();
}

function renderChatHistory() {
  if (!chatHistory) return;

  chatHistory.innerHTML = "";

  const visibleChats =
    state.chats.slice(0, 30);

  visibleChats.forEach((chat) => {
    const button = document.createElement("button");

    button.type = "button";
    button.className =
      "chat-history-item";

    button.textContent =
      chat.title || "Новый чат";

    button.title =
      chat.title || "Новый чат";

    button.addEventListener("click", () => {
      openChat(chat.id);
      closeSidebar();
    });

    chatHistory.appendChild(button);
  });
}

function renderMessages() {
  messagesContainer.innerHTML = "";

  state.messages.forEach(renderMessage);

  scrollChatToBottom();
}

/* =========================================================
   TOOLS
   ========================================================= */

function setupTools() {
  $$(".tool-button").forEach((button) => {
    button.addEventListener("click", () => {
      const tool = button.dataset.tool;

      openTool(tool);
      closeSidebar();
    });
  });

  toolRunButton?.addEventListener(
    "click",
    runTool
  );
}

const TOOLS = {
  image: {
    title: "Создать изображение",
    description:
      "Опишите изображение, которое хотите создать."
  },

  video: {
    title: "Создать видео",
    description:
      "Опишите сцену или видео, которое нужно создать."
  },

  music: {
    title: "Создать музыку",
    description:
      "Опишите стиль, настроение и тип музыки."
  },

  model3d: {
    title: "Создать 3D-модель",
    description:
      "Опишите предмет, который хотите получить как 3D-модель."
  },

  website: {
    title: "Создать сайт",
    description:
      "Опишите сайт, который нужно разработать."
  }
};

function openTool(tool) {
  const config = TOOLS[tool];

  if (!config) return;

  state.selectedTool = tool;

  toolModalTitle.textContent =
    config.title;

  toolModalDescription.textContent =
    config.description;

  toolPrompt.value = "";
  toolStatus.hidden = true;
  toolStatus.textContent = "";

  openModal(toolModal);
}

async function runTool() {
  const prompt = toolPrompt.value.trim();

  if (!prompt || !state.selectedTool) {
    showToolStatus(
      "Сначала опишите, что нужно создать."
    );

    return;
  }

  /*
    На этом этапе инструменты передают задачу
    в обычный AI-чат.

    Реальное создание изображения/видео/3D
    будет подключаться отдельными серверными
    API-маршрутами, когда они существуют
    на сервере.
  */

  closeModal(toolModal);

  const toolName =
    TOOLS[state.selectedTool]?.title ||
    "Инструмент";

  addMessage(
    "user",
    `${toolName}\n\n${prompt}`
  );

  state.isGenerating = true;
  setGenerating(true);

  try {
    const response = await apiRequest(API.chat, {
      method: "POST",
      timeout: 120000,
      body: {
        message: prompt,
        tool: state.selectedTool,
        messages: state.messages.map(
          (message) => ({
            role: message.role,
            content: message.content
          })
        ),
        chatId: state.currentChatId
      }
    });

    const data = await readJson(response);

    if (!response.ok) {
      throw new Error(
        getServerError(
          data,
          "Не удалось выполнить запрос."
        )
      );
    }

    const answer =
      extractAssistantAnswer(data);

    if (!answer) {
      throw new Error(
        "Сервер не вернул результат."
      );
    }

    addMessage("assistant", answer);

    saveCurrentChat();
  } catch (error) {
    console.error("Tool error:", error);

    addMessage(
      "assistant",
      cleanErrorMessage(error)
    );
  } finally {
    state.isGenerating = false;
    setGenerating(false);
  }
}

function showToolStatus(message) {
  if (!toolStatus) return;

  toolStatus.textContent = message;
  toolStatus.hidden = false;
}

/* =========================================================
   FILES
   ========================================================= */

function setupFiles() {
  attachButton?.addEventListener(
    "click",
    () => fileInput?.click()
  );

  fileInput?.addEventListener(
    "change",
    () => {
      const files = [...fileInput.files];

      if (!files.length) return;

      const names = files
        .map((file) => file.name)
        .join(", ");

      messageInput.value +=
        messageInput.value
          ? `\n\nПрикреплены файлы: ${names}`
          : `Прикреплены файлы: ${names}`;

      autoResizeTextarea();
      updateSendButton();

      showToast(
        `${files.length} файл(ов) выбрано.`
      );

      /*
        В текущем frontend файлы отображаются
        в сообщении. Для реальной загрузки
        бинарных файлов сервер должен предоставить
        отдельный multipart/upload endpoint.
      */

      fileInput.value = "";
    }
  );
}

/* =========================================================
   VOICE
   ========================================================= */

function setupVoice() {
  if (!voiceButton) return;

  const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    voiceButton.addEventListener(
      "click",
      () => {
        showToast(
          "Голосовой ввод не поддерживается этим браузером."
        );
      }
    );

    return;
  }

  const recognition =
    new SpeechRecognition();

  recognition.lang = "ru-RU";
  recognition.interimResults = true;
  recognition.continuous = false;

  let listening = false;

  voiceButton.addEventListener(
    "click",
    () => {
      if (listening) {
        recognition.stop();
        return;
      }

      try {
        recognition.start();
        listening = true;

        voiceButton.style.color =
          "#ff7d89";
      } catch (error) {
        console.error(
          "Speech recognition error:",
          error
        );
      }
    }
  );

  recognition.onresult = (event) => {
    let transcript = "";

    for (
      let i = event.resultIndex;
      i < event.results.length;
      i++
    ) {
      transcript +=
        event.results[i][0].transcript;
    }

    messageInput.value = transcript;

    autoResizeTextarea();
    updateSendButton();
  };

  recognition.onend = () => {
    listening = false;

    voiceButton.style.color = "";
  };

  recognition.onerror = (event) => {
    console.error(
      "Speech recognition:",
      event.error
    );

    listening = false;
    voiceButton.style.color = "";

    showToast(
      "Не удалось распознать голос."
    );
  };
}

/* =========================================================
   MODALS
   ========================================================= */

function setupModals() {
  $$("[data-close-modal]").forEach(
    (element) => {
      element.addEventListener(
        "click",
        () => {
          const modal =
            element.closest(".modal");

          closeModal(modal);
        }
      );
    }
  );

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape") return;

      closeAllModals();
      closeSidebar();
    }
  );
}

function openModal(modal) {
  if (!modal) return;

  modal.hidden = false;
}

function closeModal(modal) {
  if (!modal) return;

  modal.hidden = true;
}

function closeAllModals() {
  $$(".modal").forEach(
    (modal) => {
      modal.hidden = true;
    }
  );
}

/* =========================================================
   PROFILE
   ========================================================= */

function updateProfile() {
  if (!state.user) return;

  const username =
    state.user.username ||
    state.user.name ||
    "Пользователь";

  const initial =
    username
      .trim()
      .charAt(0)
      .toUpperCase() || "N";

  if (profileInitial) {
    profileInitial.textContent =
      initial;
  }

  if (profileBigAvatar) {
    profileBigAvatar.textContent =
      initial;
  }

  if (profileName) {
    profileName.textContent =
      state.user.name ||
      username;
  }

  if (profileUsername) {
    profileUsername.textContent =
      username.startsWith("@")
        ? username
        : `@${username}`;
  }
}

function getUserInitial() {
  const username =
    state.user?.username ||
    state.user?.name ||
    "U";

  return (
    username
      .trim()
      .charAt(0)
      .toUpperCase() || "U"
  );
}

/* =========================================================
   SETTINGS
   ========================================================= */

function loadLocalSettings() {
  try {
    state.temporaryChats =
      localStorage.getItem(
        STORAGE_KEYS.temporary
      ) === "true";

    const savedAnimations =
      localStorage.getItem(
        STORAGE_KEYS.animations
      );

    if (savedAnimations !== null) {
      state.animationsEnabled =
        savedAnimations !== "false";
    }
  } catch {
    state.temporaryChats = false;
    state.animationsEnabled = true;
  }

  if (temporaryChats) {
    temporaryChats.checked =
      state.temporaryChats;
  }

  if (animationsEnabled) {
    animationsEnabled.checked =
      state.animationsEnabled;
  }

  temporaryChats?.addEventListener(
    "change",
    () => {
      state.temporaryChats =
        temporaryChats.checked;

      localStorage.setItem(
        STORAGE_KEYS.temporary,
        String(state.temporaryChats)
      );

      loadChats();
    }
  );

  animationsEnabled?.addEventListener(
    "change",
    () => {
      state.animationsEnabled =
        animationsEnabled.checked;

      localStorage.setItem(
        STORAGE_KEYS.animations,
        String(state.animationsEnabled)
      );

      applyAnimationSetting();
    }
  );
}

function applyAnimationSetting() {
  document.documentElement.dataset.animations =
    state.animationsEnabled
      ? "on"
      : "off";
}

/* =========================================================
   TOASTS
   ========================================================= */

function showToast(message) {
  if (!toastContainer) return;

  const toast =
    document.createElement("div");

  toast.className = "toast";
  toast.textContent = message;

  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform =
      "translateY(8px)";

    setTimeout(() => {
      toast.remove();
    }, 200);
  }, 3500);
}

/* =========================================================
   KEYBOARD / PAGE
   ========================================================= */

window.addEventListener(
  "resize",
  () => {
    autoResizeTextarea();
  }
);

window.addEventListener(
  "online",
  () => {
    showToast("Соединение восстановлено.");
  }
);

window.addEventListener(
  "offline",
  () => {
    showToast("Нет подключения к интернету.");
  }
);