/* =========================================================
NEURO-CHAT
Premium Frontend Controller
========================================================= */

(() => {
“use strict”;

/* =======================================================
CONSTANTS
======================================================= */

const STORAGE = {
USERS: “neuro_users”,
SESSION: “neuro_session”,
CHATS: “neuro_chats”,
PROJECTS: “neuro_projects”,
SCHEDULED: “neuro_scheduled”,
LIBRARY: “neuro_library”,
SETTINGS: “neuro_settings”
};

const DEFAULT_SETTINGS = {
model: “default”,
theme: “dark”,
temporaryChat: false,
siteBuilderMode: false
};

let currentChatId = null;
let attachedFiles = [];
let isGenerating = false;
let recognition = null;

/* =======================================================
DOM HELPERS
======================================================= */

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => […document.querySelectorAll(selector)];

function get(id) {
return document.getElementById(id);
}

function show(element) {
if (element) element.classList.remove(“hidden”);
}

function hide(element) {
if (element) element.classList.add(“hidden”);
}

function escapeHTML(value) {
return String(value ?? “”)
.replace(/&/g, “&”)
.replace(/</g, “<”)
.replace(/>/g, “>”)
.replace(/”/g, “"”)
.replace(/’/g, “'”);
}

function uid(prefix = “id”) {
return ${prefix}_${Date.now()}_${Math.random() .toString(36) .slice(2, 8)};
}

function readStorage(key, fallback) {
try {
const value = localStorage.getItem(key);
return value ? JSON.parse(value) : fallback;
} catch {
return fallback;
}
}

function writeStorage(key, value) {
localStorage.setItem(key, JSON.stringify(value));
}

/* =======================================================
TOAST
======================================================= */

function toast(message, type = “info”) {
const container = get(“toast-container”);
if (!container) return;

const item = document.createElement("div");
item.className = `toast toast-${type}`;
const icons = {
  success: "✓",
  error: "!",
  warning: "⚠",
  info: "i"
};
item.innerHTML = `
  <span class="toast-icon">${icons[type] || "i"}</span>
  <span class="toast-message">${escapeHTML(message)}</span>
`;
container.appendChild(item);
requestAnimationFrame(() => {
  item.classList.add("visible");
});
setTimeout(() => {
  item.classList.remove("visible");
  setTimeout(() => {
    item.remove();
  }, 300);
}, 3000);

}

/* =======================================================
AUTH
======================================================= */

function getUsers() {
return readStorage(STORAGE.USERS, []);
}

function saveUsers(users) {
writeStorage(STORAGE.USERS, users);
}

function getSession() {
return readStorage(STORAGE.SESSION, null);
}

function setSession(user) {
writeStorage(STORAGE.SESSION, user);
}

function clearSession() {
localStorage.removeItem(STORAGE.SESSION);
}

function switchAuthMode(mode) {
const loginForm = get(“login-form”);
const registerForm = get(“register-form”);
const message = get(“auth-message”);

if (mode === "register") {
  hide(loginForm);
  show(registerForm);
} else {
  hide(registerForm);
  show(loginForm);
}
if (message) {
  message.textContent = "";
  message.className = "auth-message";
}

}

function authMessage(text, type = “error”) {
const message = get(“auth-message”);
if (!message) return;

message.textContent = text;
message.className = `auth-message ${type}`;

}

function login(event) {
event.preventDefault();

const username = get("username")?.value.trim();
const password = get("password")?.value;
if (!username || !password) {
  authMessage("Введите имя пользователя и пароль.");
  return;
}
const users = getUsers();
const user = users.find(
  item =>
    item.username.toLowerCase() === username.toLowerCase() &&
    item.password === password
);
if (!user) {
  authMessage("Неверное имя пользователя или пароль.");
  return;
}
setSession({
  username: user.username,
  id: user.id
});
authMessage("Вход выполнен.", "success");
setTimeout(() => {
  enterApplication();
}, 250);

}

function register(event) {
event.preventDefault();

const username = get("register-username")?.value.trim();
const password = get("register-password")?.value;
const confirm = get("register-password-confirm")?.value;
if (!username || !password || !confirm) {
  authMessage("Заполните все поля.");
  return;
}
if (username.length < 3) {
  authMessage("Имя пользователя должно содержать минимум 3 символа.");
  return;
}
if (password.length < 4) {
  authMessage("Пароль должен содержать минимум 4 символа.");
  return;
}
if (password !== confirm) {
  authMessage("Пароли не совпадают.");
  return;
}
const users = getUsers();
if (
  users.some(
    item => item.username.toLowerCase() === username.toLowerCase()
  )
) {
  authMessage("Такой пользователь уже существует.");
  return;
}
const user = {
  id: uid("user"),
  username,
  password,
  createdAt: new Date().toISOString()
};
users.push(user);
saveUsers(users);
setSession({
  username: user.username,
  id: user.id
});
authMessage("Аккаунт создан.", "success");
setTimeout(() => {
  enterApplication();
}, 300);

}

function logout() {
clearSession();

currentChatId = null;
attachedFiles = [];
hide(get("main-app"));
show(get("login-screen"));
switchAuthMode("login");
if (get("login-form")) {
  get("login-form").reset();
}
toast("Вы вышли из аккаунта.", "success");

}

function enterApplication() {
hide(get(“login-screen”));
show(get(“main-app”));

const session = getSession();
if (session) {
  const username = session.username || "Пользователь";
  const sidebarUsername = get("sidebar-username");
  const avatar = get("user-avatar");
  if (sidebarUsername) {
    sidebarUsername.textContent = username;
  }
  if (avatar) {
    avatar.textContent = username.charAt(0).toUpperCase();
  }
}
applySettings();
loadChats();
if (!currentChatId) {
  createChat(false);
}
renderProjects();
renderScheduled();
renderLibrary();
navigate("chat-section");

}

/* =======================================================
CHATS
======================================================= */

function getChats() {
const session = getSession();

if (!session) return [];
const allChats = readStorage(STORAGE.CHATS, {});
return Array.isArray(allChats[session.id])
  ? allChats[session.id]
  : [];

}

function saveChats(chats) {
const session = getSession();

if (!session) return;
const allChats = readStorage(STORAGE.CHATS, {});
allChats[session.id] = chats;
writeStorage(STORAGE.CHATS, allChats);

}

function createChat(save = true) {
const chat = {
id: uid(“chat”),
title: “Новый чат”,
createdAt: new Date().toISOString(),
updatedAt: new Date().toISOString(),
messages: []
};

const chats = getChats();
chats.unshift(chat);
if (save) {
  saveChats(chats);
}
currentChatId = chat.id;
renderChatHistory();
renderCurrentChat();
return chat;

}

function newChat() {
closeSidebarMobile();

createChat(true);
toast("Новый чат создан.", "success");

}

function selectChat(id) {
const chats = getChats();

const chat = chats.find(item => item.id === id);
if (!chat) return;
currentChatId = id;
renderChatHistory();
renderCurrentChat();
navigate("chat-section");
closeSidebarMobile();

}

function deleteChat(id) {
const chats = getChats();

const filtered = chats.filter(item => item.id !== id);
saveChats(filtered);
if (currentChatId === id) {
  currentChatId = filtered[0]?.id || null;
  if (!currentChatId) {
    createChat(true);
  }
}
renderChatHistory();
renderCurrentChat();
toast("Чат удалён.", "success");

}

function clearCurrentChat() {
if (!currentChatId) return;

const chats = getChats();
const chat = chats.find(item => item.id === currentChatId);
if (!chat) return;
chat.messages = [];
chat.title = "Новый чат";
chat.updatedAt = new Date().toISOString();
saveChats(chats);
renderChatHistory();
renderCurrentChat();
toast("Чат очищен.", "success");

}

function renameChatIfNeeded(chat, firstMessage) {
if (chat.title !== “Новый чат”) return;

const text = firstMessage.trim();
if (!text) return;
chat.title =
  text.length > 32
    ? `${text.slice(0, 32)}…`
    : text;

}

function loadChats() {
renderChatHistory();

const chats = getChats();
if (chats.length === 0) {
  createChat(true);
  return;
}
if (!currentChatId || !chats.some(c => c.id === currentChatId)) {
  currentChatId = chats[0].id;
}
renderCurrentChat();

}

function renderChatHistory() {
const container = get(“chat-history”);
const count = get(“chat-count”);

if (!container) return;
const chats = getChats();
if (count) {
  count.textContent = chats.length;
}
container.innerHTML = "";
if (chats.length === 0) {
  container.innerHTML = `
    <div class="history-empty">
      <span>💬</span>
      <p>Здесь появятся ваши чаты</p>
    </div>
  `;
  return;
}
chats.forEach(chat => {
  const item = document.createElement("div");
  item.className =
    "chat-history-item" +
    (chat.id === currentChatId ? " active" : "");
  item.dataset.chatId = chat.id;
  item.innerHTML = `
    <button class="chat-select">
      <span class="chat-history-icon">💬</span>
      <span class="chat-history-name">
        ${escapeHTML(chat.title)}
      </span>
    </button>
    <button
      class="chat-delete"
      title="Удалить чат"
      aria-label="Удалить чат"
    >
      ×
    </button>
  `;
  item.querySelector(".chat-select").addEventListener(
    "click",
    () => selectChat(chat.id)
  );
  item.querySelector(".chat-delete").addEventListener(
    "click",
    event => {
      event.stopPropagation();
      deleteChat(chat.id);
    }
  );
  container.appendChild(item);
});

}

function renderCurrentChat() {
const messagesContainer = get(“messages”);
const welcome = get(“welcome-screen”);
const title = get(“current-chat-title”);

if (!messagesContainer) return;
const chats = getChats();
const chat = chats.find(item => item.id === currentChatId);
if (!chat) {
  if (title) title.textContent = "Новый чат";
  messagesContainer.innerHTML = "";
  show(welcome);
  return;
}
if (title) {
  title.textContent = chat.title || "Новый чат";
}
messagesContainer.innerHTML = "";
if (!chat.messages.length) {
  show(welcome);
  return;
}
hide(welcome);
chat.messages.forEach(message => {
  renderMessage(message);
});
scrollMessagesToBottom();

}

function renderMessage(message) {
const container = get(“messages”);

if (!container) return;
const wrapper = document.createElement("div");
wrapper.className =
  `message-row ${message.role === "user" ? "user-row" : "ai-row"}`;
const avatar =
  message.role === "user"
    ? "U"
    : "N";
wrapper.innerHTML = `
  <div class="message-avatar ${
    message.role === "user"
      ? "user-message-avatar"
      : "ai-avatar"
  }">
    ${avatar}
  </div>
  <div class="message-content">
    <div class="message-author">
      ${message.role === "user" ? "Вы" : "Neuro-chat"}
    </div>
    <div class="message-text">
      ${formatMessage(message.content)}
    </div>
    ${
      message.files?.length
        ? `
          <div class="message-files">
            ${message.files
              .map(
                file => `
                  <span class="message-file">
                    📎 ${escapeHTML(file.name)}
                  </span>
                `
              )
              .join("")}
          </div>
        `
        : ""
    }
    ${
      message.role === "assistant"
        ? `
          <div class="message-actions">
            <button
              class="message-action copy-message"
              data-copy="${escapeHTML(message.content)}"
            >
              Копировать
            </button>
          </div>
        `
        : ""
    }
  </div>
`;
const copyButton = wrapper.querySelector(".copy-message");
if (copyButton) {
  copyButton.addEventListener("click", () => {
    copyText(message.content);
  });
}
container.appendChild(wrapper);

}

function formatMessage(text) {
let safe = escapeHTML(text);

safe = safe.replace(
  /```([\s\S]*?)```/g,
  (_, code) => `
    <pre class="code-block"><code>${code.trim()}</code></pre>
  `
);
safe = safe.replace(
  /\*\*(.*?)\*\*/g,
  "<strong>$1</strong>"
);
safe = safe.replace(
  /\n/g,
  "<br>"
);
return safe;

}

function scrollMessagesToBottom() {
const container = get(“messages-container”);

if (!container) return;
requestAnimationFrame(() => {
  container.scrollTop = container.scrollHeight;
});

}

/* =======================================================
MESSAGES / AI
======================================================= */

async function sendMessage() {
if (isGenerating) return;

const input = get("user-input");
if (!input) return;
const text = input.value.trim();
if (!text && attachedFiles.length === 0) {
  return;
}
if (!currentChatId) {
  createChat(true);
}
const chats = getChats();
const chat = chats.find(item => item.id === currentChatId);
if (!chat) return;
const messageText =
  text ||
  "Проанализируй прикреплённые файлы.";
const userMessage = {
  id: uid("message"),
  role: "user",
  content: messageText,
  files: attachedFiles.map(file => ({
    name: file.name,
    type: file.type,
    size: file.size
  })),
  createdAt: new Date().toISOString()
};
chat.messages.push(userMessage);
renameChatIfNeeded(chat, messageText);
chat.updatedAt = new Date().toISOString();
saveChats(chats);
input.value = "";
updateComposerState();
clearAttachments();
hide(get("welcome-screen"));
renderCurrentChat();
renderChatHistory();
showTyping(true);
isGenerating = true;
updateConnectionStatus("Генерирую…");
try {
  const response = await requestAI(chat.messages);
  const assistantMessage = {
    id: uid("message"),
    role: "assistant",
    content: response,
    createdAt: new Date().toISOString()
  };
  chat.messages.push(assistantMessage);
  chat.updatedAt = new Date().toISOString();
  saveChats(chats);
  renderCurrentChat();
  renderChatHistory();
} catch (error) {
  console.error(error);
  const errorMessage = {
    id: uid("message"),
    role: "assistant",
    content:
      "Не удалось получить ответ от AI. Проверьте подключение API и настройки сервера.",
    createdAt: new Date().toISOString()
  };
  chat.messages.push(errorMessage);
  saveChats(chats);
  renderCurrentChat();
  toast("Ошибка подключения к AI.", "error");
} finally {
  isGenerating = false;
  showTyping(false);
  updateConnectionStatus("● Готов");
  updateComposerState();
}

}

async function requestAI(messages) {
/*
Основной путь:
Cloudflare Pages Function / Worker → /api/chat

  API-ключ НЕ хранится в frontend.
*/
const settings = getSettings();
const payload = {
  model: settings.model,
  messages: messages.map(message => ({
    role: message.role,
    content: message.content
  }))
};
const response = await fetch("/api/chat", {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify(payload)
});
if (!response.ok) {
  let details = "";
  try {
    const data = await response.json();
    details = data.error || "";
  } catch {
    // ignore
  }
  throw new Error(
    details || `HTTP ${response.status}`
  );
}
const data = await response.json();
if (typeof data.answer === "string") {
  return data.answer;
}
if (typeof data.output_text === "string") {
  return data.output_text;
}
if (typeof data.content === "string") {
  return data.content;
}
if (data.choices?.[0]?.message?.content) {
  return data.choices[0].message.content;
}
throw new Error("Сервер вернул неизвестный формат ответа.");

}

function quickPrompt(prompt) {
const input = get(“user-input”);

if (!input) return;
input.value = prompt;
input.focus();
updateComposerState();
autoResizeTextarea();

}

function showTyping(active) {
const indicator = get(“typing-indicator”);

if (!indicator) return;
if (active) {
  show(indicator);
  scrollMessagesToBottom();
} else {
  hide(indicator);
}

}

function updateConnectionStatus(text) {
const status = get(“connection-status”);

if (status) {
  status.textContent = text;
}

}

/* =======================================================
COMPOSER
======================================================= */

function updateComposerState() {
const input = get(“user-input”);
const send = get(“send-button”);
const counter = get(“char-counter”);

if (!input) return;
const hasText = input.value.trim().length > 0;
const hasFiles = attachedFiles.length > 0;
if (send) {
  send.disabled =
    (!hasText && !hasFiles) ||
    isGenerating;
}
if (counter) {
  counter.textContent =
    `${input.value.length} / ${input.maxLength || 20000}`;
}

}

function autoResizeTextarea() {
const input = get(“user-input”);

if (!input) return;
input.style.height = "auto";
input.style.height =
  `${Math.min(input.scrollHeight, 220)}px`;

}

function toggleAttachMenu() {
const menu = get(“attach-menu”);

if (!menu) return;
menu.classList.toggle("hidden");

}

function closeAttachMenu() {
hide(get(“attach-menu”));
}

function openFilePicker(type) {
closeAttachMenu();

const inputs = {
  file: "file-input",
  photo: "photo-input",
  camera: "camera-input",
  model: "model-file-input"
};
const input = get(inputs[type]);
if (input) {
  input.value = "";
  input.click();
}

}

function processFiles(files) {
if (!files?.length) return;

[...files].forEach(file => {
  attachedFiles.push(file);
});
renderAttachments();
updateComposerState();

}

function renderAttachments() {
const container = get(“attached-files”);

if (!container) return;
container.innerHTML = "";
attachedFiles.forEach((file, index) => {
  const item = document.createElement("div");
  item.className = "attached-file";
  item.innerHTML = `
    <span class="attached-file-icon">📎</span>
    <span class="attached-file-name">
      ${escapeHTML(file.name)}
    </span>
    <button
      type="button"
      class="attached-file-remove"
      data-index="${index}"
      aria-label="Удалить файл"
    >
      ×
    </button>
  `;
  item
    .querySelector(".attached-file-remove")
    .addEventListener("click", () => {
      attachedFiles.splice(index, 1);
      renderAttachments();
      updateComposerState();
    });
  container.appendChild(item);
});

}

function clearAttachments() {
attachedFiles = [];
renderAttachments();
}

/* =======================================================
VOICE INPUT
======================================================= */

function startVoiceInput() {
const SpeechRecognition =
window.SpeechRecognition ||
window.webkitSpeechRecognition;

if (!SpeechRecognition) {
  toast(
    "Голосовой ввод не поддерживается этим браузером.",
    "warning"
  );
  return;
}
if (recognition) {
  recognition.stop();
  recognition = null;
  return;
}
recognition = new SpeechRecognition();
recognition.lang = "ru-RU";
recognition.continuous = false;
recognition.interimResults = true;
const input = get("user-input");
const button = get("voice-button");
let finalText = "";
recognition.onstart = () => {
  button?.classList.add("recording");
  toast("Слушаю…", "info");
};
recognition.onresult = event => {
  let interim = "";
  for (
    let i = event.resultIndex;
    i < event.results.length;
    i++
  ) {
    const transcript =
      event.results[i][0].transcript;
    if (event.results[i].isFinal) {
      finalText += transcript;
    } else {
      interim += transcript;
    }
  }
  if (input) {
    input.value =
      `${finalText}${interim}`.trim();
    updateComposerState();
    autoResizeTextarea();
  }
};
recognition.onerror = event => {
  console.error(event.error);
  toast(
    "Не удалось распознать голос.",
    "error"
  );
};
recognition.onend = () => {
  button?.classList.remove("recording");
  recognition = null;
};
recognition.start();

}

/* =======================================================
NAVIGATION
======================================================= */

function navigate(sectionId) {
const sections = $$(”.app-section”);
const navItems = $$(”.nav-item”);

sections.forEach(section => {
  section.classList.toggle(
    "active",
    section.id === sectionId
  );
});
navItems.forEach(item => {
  item.classList.toggle(
    "active",
    item.dataset.section === sectionId
  );
});
closeSidebarMobile();

}

/* =======================================================
SIDEBAR
======================================================= */

function openSidebarMobile() {
const sidebar = get(“sidebar”);
const overlay = get(“sidebar-overlay”);

sidebar?.classList.add("mobile-open");
overlay?.classList.add("visible");

}

function closeSidebarMobile() {
const sidebar = get(“sidebar”);
const overlay = get(“sidebar-overlay”);

sidebar?.classList.remove("mobile-open");
overlay?.classList.remove("visible");

}

function toggleSidebarMobile() {
const sidebar = get(“sidebar”);

if (sidebar?.classList.contains("mobile-open")) {
  closeSidebarMobile();
} else {
  openSidebarMobile();
}

}

/* =======================================================
MODALS
======================================================= */

const MODALS = [
“settings-modal”,
“support-modal”,
“project-modal”,
“scheduled-modal”,
“code-modal”,
“site-preview-modal”
];

function openModal(id) {
const modal = get(id);

if (!modal) return;
MODALS.forEach(modalId => {
  if (modalId !== id) {
    hide(get(modalId));
  }
});
show(modal);
document.body.classList.add("modal-open");

}

function closeModal(id) {
const modal = get(id);

if (!modal) return;
hide(modal);
if (!MODALS.some(id => !get(id)?.classList.contains("hidden"))) {
  document.body.classList.remove("modal-open");
}

}

function closeAllModals() {
MODALS.forEach(id => {
hide(get(id));
});

document.body.classList.remove("modal-open");

}

function openSettings() {
loadSettingsIntoForm();
openModal(“settings-modal”);
}

function openSupport() {
openModal(“support-modal”);
}

/* =======================================================
SETTINGS
======================================================= */

function getSettings() {
return {
…DEFAULT_SETTINGS,
…readStorage(STORAGE.SETTINGS, {})
};
}

function saveSettings(settings) {
writeStorage(STORAGE.SETTINGS, settings);
}

function loadSettingsIntoForm() {
const settings = getSettings();

const model = get("model");
const theme = get("theme");
const temporary = get("temporary-chat");
const builder = get("site-builder-mode");
if (model) model.value = settings.model;
if (theme) theme.value = settings.theme;
if (temporary) temporary.checked = settings.temporaryChat;
if (builder) builder.checked = settings.siteBuilderMode;
const savedApiKey = localStorage.getItem("neuro_api_key");
const apiKey = get("api-key");
if (apiKey && savedApiKey) {
  apiKey.value = savedApiKey;
}

}

function saveAllSettings() {
const settings = {
model: get(“model”)?.value || “default”,
theme: get(“theme”)?.value || “dark”,
temporaryChat: Boolean(get(“temporary-chat”)?.checked),
siteBuilderMode: Boolean(get(“site-builder-mode”)?.checked)
};

saveSettings(settings);
const apiKey = get("api-key")?.value.trim();
if (apiKey) {
  /*
    Совместимость со старой схемой проекта.
    Секрет не выводится в коде и не логируется.
  */
  localStorage.setItem(
    "neuro_api_key",
    apiKey
  );
}
applySettings();
closeModal("settings-modal");
toast("Настройки сохранены.", "success");

}

function applySettings() {
const settings = getSettings();

document.documentElement.dataset.theme =
  settings.theme;
document.body.dataset.theme =
  settings.theme;
if (settings.theme === "light") {
  document.documentElement.classList.add("light-theme");
} else if (settings.theme === "dark") {
  document.documentElement.classList.remove("light-theme");
} else {
  const prefersLight =
    window.matchMedia &&
    window.matchMedia(
      "(prefers-color-scheme: light)"
    ).matches;
  document.documentElement.classList.toggle(
    "light-theme",
    prefersLight
  );
}

}

/* =======================================================
PROJECTS
======================================================= */

function getProjects() {
const session = getSession();

if (!session) return [];
const all = readStorage(STORAGE.PROJECTS, {});
return Array.isArray(all[session.id])
  ? all[session.id]
  : [];

}

function saveProjects(projects) {
const session = getSession();

if (!session) return;
const all = readStorage(STORAGE.PROJECTS, {});
all[session.id] = projects;
writeStorage(STORAGE.PROJECTS, all);

}

function openProjectModal() {
const form = get(“project-form”);

if (form) form.reset();
openModal("project-modal");

}

function createProject(event) {
event.preventDefault();

const name = get("project-name")?.value.trim();
const description =
  get("project-description")?.value.trim();
if (!name) {
  toast("Введите название проекта.", "warning");
  return;
}
const projects = getProjects();
projects.unshift({
  id: uid("project"),
  name,
  description,
  createdAt: new Date().toISOString()
});
saveProjects(projects);
closeModal("project-modal");
renderProjects();
toast("Проект создан.", "success");

}

function deleteProject(id) {
const projects =
getProjects().filter(project => project.id !== id);

saveProjects(projects);
renderProjects();
toast("Проект удалён.", "success");

}

function renderProjects() {
const grid = get(“projects-grid”);
const empty = get(“projects-empty”);

if (!grid) return;
const projects = getProjects();
grid.innerHTML = "";
if (projects.length === 0) {
  show(empty);
  return;
}
hide(empty);
projects.forEach(project => {
  const card = document.createElement("article");
  card.className = "project-card";
  card.innerHTML = `
    <div class="project-card-top">
      <div class="project-icon">📁</div>
      <button
        class="delete-project"
        title="Удалить проект"
      >
        ×
      </button>
    </div>
    <h3>${escapeHTML(project.name)}</h3>
    <p>
      ${escapeHTML(
        project.description ||
        "Без описания"
      )}
    </p>
    <small>
      Создан ${formatDate(project.createdAt)}
    </small>
  `;
  card
    .querySelector(".delete-project")
    .addEventListener("click", () => {
      deleteProject(project.id);
    });
  grid.appendChild(card);
});

}

/* =======================================================
SCHEDULED
======================================================= */

function getScheduled() {
const session = getSession();

if (!session) return [];
const all =
  readStorage(STORAGE.SCHEDULED, {});
return Array.isArray(all[session.id])
  ? all[session.id]
  : [];

}

function saveScheduled(items) {
const session = getSession();

if (!session) return;
const all =
  readStorage(STORAGE.SCHEDULED, {});
all[session.id] = items;
writeStorage(STORAGE.SCHEDULED, all);

}

function openScheduledModal() {
const form = get(“scheduled-form”);

if (form) form.reset();
openModal("scheduled-modal");

}

function createScheduledTask(event) {
event.preventDefault();

const title =
  get("scheduled-title")?.value.trim();
const date =
  get("scheduled-date")?.value;
const time =
  get("scheduled-time")?.value;
if (!title || !date || !time) {
  toast("Заполните все поля.", "warning");
  return;
}
const items = getScheduled();
items.unshift({
  id: uid("task"),
  title,
  date,
  time,
  createdAt: new Date().toISOString()
});
saveScheduled(items);
closeModal("scheduled-modal");
renderScheduled();
toast("Задача запланирована.", "success");

}

function deleteScheduledTask(id) {
const items =
getScheduled().filter(item => item.id !== id);

saveScheduled(items);
renderScheduled();
toast("Задача удалена.", "success");

}

function renderScheduled() {
const container = get(“scheduled-list”);
const empty = get(“scheduled-empty”);

if (!container) return;
const items = getScheduled();
container.innerHTML = "";
if (items.length === 0) {
  show(empty);
  return;
}
hide(empty);
items.forEach(item => {
  const element = document.createElement("div");
  element.className = "scheduled-item";
  element.innerHTML = `
    <div class="scheduled-icon">⏰</div>
    <div class="scheduled-info">
      <strong>${escapeHTML(item.title)}</strong>
      <span>
        ${escapeHTML(item.date)}
        ·
        ${escapeHTML(item.time)}
      </span>
    </div>
    <button class="scheduled-delete">
      ×
    </button>
  `;
  element
    .querySelector(".scheduled-delete")
    .addEventListener("click", () => {
      deleteScheduledTask(item.id);
    });
  container.appendChild(element);
});

}

/* =======================================================
LIBRARY
======================================================= */

function getLibrary() {
const session = getSession();

if (!session) return [];
const all =
  readStorage(STORAGE.LIBRARY, {});
return Array.isArray(all[session.id])
  ? all[session.id]
  : [];

}

function saveLibrary(items) {
const session = getSession();

if (!session) return;
const all =
  readStorage(STORAGE.LIBRARY, {});
all[session.id] = items;
writeStorage(STORAGE.LIBRARY, all);

}

function addLibraryFiles(files) {
if (!files?.length) return;

const library = getLibrary();
[...files].forEach(file => {
  library.unshift({
    id: uid("library"),
    name: file.name,
    type: file.type,
    size: file.size,
    createdAt: new Date().toISOString()
  });
});
saveLibrary(library);
renderLibrary();
toast(
  `${files.length} файл(ов) добавлено в библиотеку.`,
  "success"
);

}

function deleteLibraryItem(id) {
const library =
getLibrary().filter(item => item.id !== id);

saveLibrary(library);
renderLibrary();

}

function renderLibrary() {
const grid = get(“library-grid”);
const empty = get(“library-empty”);

if (!grid) return;
const items = getLibrary();
grid.innerHTML = "";
if (items.length === 0) {
  show(empty);
  return;
}
hide(empty);
items.forEach(item => {
  const card = document.createElement("article");
  card.className = "library-card";
  card.innerHTML = `
    <div class="library-icon">📄</div>
    <div class="library-info">
      <strong>
        ${escapeHTML(item.name)}
      </strong>
      <small>
        ${formatFileSize(item.size)}
      </small>
    </div>
    <button
      class="library-delete"
      title="Удалить"
    >
      ×
    </button>
  `;
  card
    .querySelector(".library-delete")
    .addEventListener("click", () => {
      deleteLibraryItem(item.id);
    });
  grid.appendChild(card);
});

}

/* =======================================================
CODE STUDIO
======================================================= */

function openCodeMode() {
openModal(“code-modal”);
}

function runCode() {
const code = get(“code-editor”)?.value || “”;

if (!code.trim()) {
  toast("Редактор пуст.", "warning");
  return;
}
const frame = get("site-preview-frame");
if (!frame) {
  toast("Предпросмотр недоступен.", "error");
  return;
}
frame.srcdoc = code;
openModal("site-preview-modal");
toast("Код запущен.", "success");

}

function openSitePreview() {
const code = get(“code-editor”)?.value || “”;

const frame = get("site-preview-frame");
if (!frame) return;
frame.srcdoc = code;
openModal("site-preview-modal");

}

function loadCodeFile(file) {
if (!file) return;

const reader = new FileReader();
reader.onload = event => {
  const editor = get("code-editor");
  if (editor) {
    editor.value =
      String(event.target.result || "");
    toast("Файл открыт.", "success");
  }
};
reader.onerror = () => {
  toast("Не удалось открыть файл.", "error");
};
reader.readAsText(file);

}

function askCodeAI() {
const editor = get(“code-editor”);

if (!editor) return;
const code = editor.value.trim();
const input = get("user-input");
if (!input) return;
closeModal("code-modal");
navigate("chat-section");
input.value =
  code
    ? `Проанализируй этот код и предложи улучшения:\n\n\`\`\`\n${code}\n\`\`\``
    : "Помоги мне написать код.";
updateComposerState();
autoResizeTextarea();
input.focus();

}

/* =======================================================
PLUGINS
======================================================= */

function handlePlugin(name) {
switch (name) {
case “web”:
toast(
“Веб-поиск будет подключён через backend.”,
“info”
);
break;

  case "code":
    openCodeMode();
    break;
  case "3d":
    openFilePicker("model");
    break;
  case "creative":
    quickPrompt(
      "Помоги мне с творческой задачей."
    );
    navigate("chat-section");
    break;
  default:
    toast("Плагин недоступен.", "warning");
}

}

/* =======================================================
SEARCH
======================================================= */

function searchChats(event) {
const query =
event.target.value.trim().toLowerCase();

const items =
  $$(".chat-history-item");
items.forEach(item => {
  const name =
    item
      .querySelector(".chat-history-name")
      ?.textContent
      .toLowerCase() || "";
  item.style.display =
    !query || name.includes(query)
      ? ""
      : "none";
});

}

/* =======================================================
CLIPBOARD
======================================================= */

async function copyText(text) {
try {
await navigator.clipboard.writeText(text);

  toast("Скопировано.", "success");
} catch {
  const textarea =
    document.createElement("textarea");
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
  toast("Скопировано.", "success");
}

}

/* =======================================================
DATE / FILE HELPERS
======================================================= */

function formatDate(value) {
try {
return new Intl.DateTimeFormat(
“ru-RU”,
{
day: “2-digit”,
month: “2-digit”,
year: “numeric”
}
).format(new Date(value));
} catch {
return “”;
}
}

function formatFileSize(bytes) {
if (!bytes) return “0 Б”;

const units = [
  "Б",
  "КБ",
  "МБ",
  "ГБ"
];
let size = bytes;
let index = 0;
while (
  size >= 1024 &&
  index < units.length - 1
) {
  size /= 1024;
  index++;
}
return `${size.toFixed(index ? 1 : 0)} ${units[index]}`;

}

/* =======================================================
KEYBOARD
======================================================= */

function handleComposerKeydown(event) {
if (event.key === “Enter” && !event.shiftKey) {
event.preventDefault();

  sendMessage();
}

}

function handleGlobalKeydown(event) {
if (event.key === “Escape”) {
closeAttachMenu();
closeAllModals();
closeSidebarMobile();
}

if (
  (event.ctrlKey || event.metaKey) &&
  event.key.toLowerCase() === "k"
) {
  event.preventDefault();
  const search = get("chat-search");
  search?.focus();
}

}

/* =======================================================
EVENT BINDING
======================================================= */

function bindEvents() {

/* ---------- Auth ---------- */
get("login-form")?.addEventListener(
  "submit",
  login
);
get("register-form")?.addEventListener(
  "submit",
  register
);
get("show-register-button")?.addEventListener(
  "click",
  () => switchAuthMode("register")
);
get("show-login-button")?.addEventListener(
  "click",
  () => switchAuthMode("login")
);
get("logout-button")?.addEventListener(
  "click",
  logout
);
/* ---------- Chat ---------- */
get("new-chat-button")?.addEventListener(
  "click",
  newChat
);
get("clear-chat-button")?.addEventListener(
  "click",
  clearCurrentChat
);
get("send-button")?.addEventListener(
  "click",
  sendMessage
);
get("user-input")?.addEventListener(
  "input",
  () => {
    updateComposerState();
    autoResizeTextarea();
  }
);
get("user-input")?.addEventListener(
  "keydown",
  handleComposerKeydown
);
get("voice-button")?.addEventListener(
  "click",
  startVoiceInput
);
/* ---------- Attachments ---------- */
get("attach-button")?.addEventListener(
  "click",
  event => {
    event.stopPropagation();
    toggleAttachMenu();
  }
);
$$("#attach-menu [data-attach]").forEach(
  button => {
    button.addEventListener(
      "click",
      () => openFilePicker(button.dataset.attach)
    );
  }
);
get("file-input")?.addEventListener(
  "change",
  event => processFiles(event.target.files)
);
get("photo-input")?.addEventListener(
  "change",
  event => processFiles(event.target.files)
);
get("camera-input")?.addEventListener(
  "change",
  event => processFiles(event.target.files)
);
get("model-file-input")?.addEventListener(
  "change",
  event => processFiles(event.target.files)
);
/* ---------- Navigation ---------- */
$$(".nav-item").forEach(button => {
  button.addEventListener(
    "click",
    () => navigate(button.dataset.section)
  );
});
/* ---------- Sidebar ---------- */
get("mobile-open-sidebar")?.addEventListener(
  "click",
  openSidebarMobile
);
get("mobile-close-sidebar")?.addEventListener(
  "click",
  closeSidebarMobile
);
get("sidebar-overlay")?.addEventListener(
  "click",
  closeSidebarMobile
);
/* ---------- Search ---------- */
get("chat-search")?.addEventListener(
  "input",
  searchChats
);
/* ---------- Settings ---------- */
get("open-settings-button")?.addEventListener(
  "click",
  openSettings
);
get("top-settings-button")?.addEventListener(
  "click",
  openSettings
);
get("save-settings-button")?.addEventListener(
  "click",
  saveAllSettings
);
get("cancel-settings-button")?.addEventListener(
  "click",
  () => closeModal("settings-modal")
);
/* ---------- Support ---------- */
get("open-support-button")?.addEventListener(
  "click",
  openSupport
);
get("close-support-button")?.addEventListener(
  "click",
  () => closeModal("support-modal")
);
/* ---------- Projects ---------- */
get("create-project-button")?.addEventListener(
  "click",
  openProjectModal
);
get("project-form")?.addEventListener(
  "submit",
  createProject
);
/* ---------- Scheduled ---------- */
get("create-scheduled-button")?.addEventListener(
  "click",
  openScheduledModal
);
get("scheduled-form")?.addEventListener(
  "submit",
  createScheduledTask
);
/* ---------- Library ---------- */
get("library-upload-button")?.addEventListener(
  "click",
  () => openFilePicker("file")
);
/* ---------- Code ---------- */
get("open-code-button")?.addEventListener(
  "click",
  openCodeMode
);
get("code-file-button")?.addEventListener(
  "click",
  () => get("code-file-input")?.click()
);
get("code-file-input")?.addEventListener(
  "change",
  event => loadCodeFile(event.target.files?.[0])
);
get("run-code-button")?.addEventListener(
  "click",
  runCode
);
get("preview-site-button")?.addEventListener(
  "click",
  openSitePreview
);
get("ask-code-ai-button")?.addEventListener(
  "click",
  askCodeAI
);
/* ---------- Plugins ---------- */
$$(".plugin-button").forEach(button => {
  button.addEventListener(
    "click",
    () => handlePlugin(button.dataset.plugin)
  );
});
/* ---------- Quick prompts ---------- */
$$(".quick-prompt").forEach(button => {
  button.addEventListener(
    "click",
    () => quickPrompt(button.dataset.prompt)
  );
});
/* ---------- Modal closing ---------- */
$$("[data-close-modal]").forEach(button => {
  button.addEventListener(
    "click",
    () => {
      const target =
        button.dataset.closeModal;
      const map = {
        settings: "settings-modal",
        support: "support-modal",
        project: "project-modal",
        scheduled: "scheduled-modal",
        code: "code-modal",
        preview: "site-preview-modal"
      };
      closeModal(map[target]);
    }
  );
});
/* ---------- Global ---------- */
document.addEventListener(
  "click",
  event => {
    const attachMenu = get("attach-menu");
    const attachButton = get("attach-button");
    if (
      attachMenu &&
      !attachMenu.classList.contains("hidden") &&
      !attachMenu.contains(event.target) &&
      !attachButton?.contains(event.target)
    ) {
      closeAttachMenu();
    }
  }
);
document.addEventListener(
  "keydown",
  handleGlobalKeydown
);
/* ---------- System theme ---------- */
window
  .matchMedia?.("(prefers-color-scheme: light)")
  ?.addEventListener(
    "change",
    () => {
      if (getSettings().theme === "system") {
        applySettings();
      }
    }
  );

}

/* =======================================================
STARTUP
======================================================= */

function start() {
bindEvents();
applySettings();

const session = getSession();
if (session) {
  enterApplication();
} else {
  show(get("login-screen"));
  hide(get("main-app"));
}
updateComposerState();

}

/* =======================================================
GLOBAL API
======================================================= */

window.NeuroChat = {
login,
register,
logout,
newChat,
selectChat,
deleteChat,
clearCurrentChat,
sendMessage,
quickPrompt,
navigate,
openSettings,
openSupport,
openCodeMode,
openSitePreview,
runCode,
toast
};

/* =======================================================
INIT
======================================================= */

if (document.readyState === “loading”) {
document.addEventListener(
“DOMContentLoaded”,
start,
{ once: true }
);
} else {
start();
}

})();