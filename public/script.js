“use strict”;

/* =========================================================
НЕЙРО-ЧАТ — FRONTEND
Полная версия script.js
========================================================= */

const $ = (id) => document.getElementById(id);

const state = {
user: null,
chatId: null,
temporary: false,
model: “neuro”,
registerMode: false,
files: [],
initialized: false,
authChecked: false,
sending: false,
guest: false
};

/* =========================================================
API
========================================================= */

async function api(url, options = {}) {
const method = String(options.method || “GET”).toUpperCase();

const headers = {
…(options.headers || {})
};

if (options.body !== undefined && !headers[“Content-Type”]) {
headers[“Content-Type”] = “application/json”;
}

let response;

try {
response = await fetch(url, {
…options,
method,
credentials: “include”,
headers
});
} catch (error) {
throw new Error(“Не удалось подключиться к серверу.”);
}

const text = await response.text();

let data = {};

if (text) {
try {
data = JSON.parse(text);
} catch {
data = {
raw: text
};
}
}

if (!response.ok) {
if (response.status === 401) {
throw new Error(“Требуется авторизация.”);
}

if (response.status === 404) {
  throw new Error("API-адрес не найден.");
}
if (response.status === 405) {
  throw new Error("Сервер не разрешает этот метод запроса.");
}
throw new Error(
  data?.error ||
  data?.message ||
  `Ошибка сервера: ${response.status}`
);

}

return data || {};
}

/* =========================================================
START
========================================================= */

document.addEventListener(“DOMContentLoaded”, init);

async function init() {
if (state.initialized) {
return;
}

state.initialized = true;

bindEvents();
autoResize();
updateModelName();
updateTemporaryButton();

try {
const result = await api(”/api/auth/me”);

state.authChecked = true;
if (result?.authenticated && result?.user) {
  state.user = result.user;
  state.guest = false;
  hide($("authModal"));
  await loadChats();
} else {
  state.user = null;
  state.guest = false;
  show($("authModal"));
}

} catch (error) {
state.authChecked = true;

/*
 * Не открываем окно авторизации бесконечно.
 * Пользователь может продолжить как гость.
 */
show($("authModal"));
showAuthError(
  "Сервер временно недоступен. Можно продолжить как гость."
);

}
}

/* =========================================================
EVENTS
========================================================= */

function bindEvents() {
const authForm = $(“authForm”);

if (authForm) {
authForm.addEventListener(“submit”, handleAuth);
}

$(“authSwitch”)?.addEventListener(
“click”,
switchAuthMode
);

$(“guestBtn”)?.addEventListener(
“click”,
enterGuest
);

$(“newChatBtn”)?.addEventListener(
“click”,
newChat
);

$(“sendBtn”)?.addEventListener(
“click”,
sendMessage
);

$(“messageInput”)?.addEventListener(
“keydown”,
handleInputKeydown
);

$(“messageInput”)?.addEventListener(
“input”,
autoResize
);

$(“attachBtn”)?.addEventListener(
“click”,
() => $(“fileInput”)?.click()
);

$(“fileInput”)?.addEventListener(
“change”,
handleFiles
);

$(“voiceBtn”)?.addEventListener(
“click”,
startVoice
);

$(“settingsBtn”)?.addEventListener(
“click”,
openSettings
);

$(“toolsBtn”)?.addEventListener(
“click”,
() => show($(“toolsModal”))
);

$(“logoutBtn”)?.addEventListener(
“click”,
logout
);

$(“temporaryBtn”)?.addEventListener(
“click”,
toggleTemporary
);

$(“temporarySetting”)?.addEventListener(
“change”,
(event) => {
state.temporary = Boolean(event.target.checked);
updateTemporaryButton();
}
);

$(“saveSettingsBtn”)?.addEventListener(
“click”,
saveSettings
);

$(“clearBtn”)?.addEventListener(
“click”,
clearCurrentChat
);

$(“menuBtn”)?.addEventListener(
“click”,
() => {
$(“sidebar”)?.classList.toggle(“open”);
}
);

$(“modelBtn”)?.addEventListener(
“click”,
handleModelButton
);

$(“fileConfirmBtn”)?.addEventListener(
“click”,
confirmFiles
);

document.addEventListener(
“click”,
handleDocumentClick
);

document.querySelectorAll(”.quick-card”).forEach(
(button) => {
button.addEventListener(
“click”,
() => {
if (button.dataset.tool) {
useTool(button.dataset.tool);
return;
}

      const input = $("messageInput");
      if (!input) {
        return;
      }
      input.value =
        button.dataset.prompt || "";
      autoResize();
      input.focus();
    }
  );
}

);

document.querySelectorAll(”[data-close]”).forEach(
(button) => {
button.addEventListener(
“click”,
() => {
const target =
$(button.dataset.close);

      if (target) {
        hide(target);
      }
    }
  );
}

);

document.querySelectorAll(”[data-tool]”).forEach(
(button) => {
button.addEventListener(
“click”,
() => useTool(button.dataset.tool)
);
}
);

document.querySelectorAll(”[data-model]”).forEach(
(button) => {
button.addEventListener(
“click”,
() => selectModel(button.dataset.model)
);
}
);
}

/* =========================================================
AUTH
========================================================= */

async function handleAuth(event) {
event.preventDefault();

const submit = $(“authSubmit”);

if (submit?.disabled) {
return;
}

const username =
$(“usernameInput”)?.value.trim() || “”;

const password =
$(“passwordInput”)?.value || “”;

if (!username || !password) {
showAuthError(“Заполни логин и пароль.”);
return;
}

if (submit) {
submit.disabled = true;
}

showAuthError(””);

try {
const endpoint =
state.registerMode
? “/api/auth/register”
: “/api/auth/login”;

const result = await api(
  endpoint,
  {
    method: "POST",
    body: JSON.stringify({
      username,
      password
    })
  }
);
if (!result?.user) {
  throw new Error(
    "Сервер не вернул данные пользователя."
  );
}
state.user = result.user;
state.guest = false;
state.chatId = null;
hide($("authModal"));
clearMessages();
await loadChats();
toast(
  state.registerMode
    ? "Аккаунт создан"
    : "Вы вошли в Нейро-чат"
);

} catch (error) {
showAuthError(
error.message ||
“Не удалось выполнить авторизацию.”
);
} finally {
if (submit) {
submit.disabled = false;
}
}
}

function switchAuthMode() {
state.registerMode =
!state.registerMode;

if ($(“authTitle”)) {
$(“authTitle”).textContent =
state.registerMode
? “Создать аккаунт”
: “Вход в Нейро-чат”;
}

if ($(“authDescription”)) {
$(“authDescription”).textContent =
state.registerMode
? “Создай аккаунт для сохранения чатов.”
: “Войди в свой аккаунт.”;
}

if ($(“authSubmit”)) {
$(“authSubmit”).textContent =
state.registerMode
? “Создать аккаунт”
: “Войти”;
}

if ($(“authSwitch”)) {
$(“authSwitch”).textContent =
state.registerMode
? “У меня уже есть аккаунт”
: “Создать аккаунт”;
}

if ($(“passwordInput”)) {
$(“passwordInput”).autocomplete =
state.registerMode
? “new-password”
: “current-password”;
}

showAuthError(””);
}

function enterGuest() {
state.user = {
id: null,
username: “guest”
};

state.guest = true;
state.chatId = null;

hide($(“authModal”));

clearMessages();

$(“messageInput”)?.focus();

toast(“Гостевой режим включён”);
}

async function logout() {
try {
await api(
“/api/auth/logout”,
{
method: “POST”
}
);
} catch {
/* Локальный выход выполняем в любом случае. */
}

state.user = null;
state.guest = false;
state.chatId = null;
state.files = [];

clearMessages();

if ($(“chatList”)) {
$(“chatList”).innerHTML = “”;
}

show($(“authModal”));
showAuthError(””);

toast(“Вы вышли из аккаунта”);
}

function showAuthError(message) {
const element = $(“authError”);

if (element) {
element.textContent =
message || “”;
}
}

/* =========================================================
CHATS
========================================================= */

async function loadChats() {
if (!state.user?.id || state.guest) {
return;
}

try {
const result =
await api(”/api/chats”);

const chats =
  Array.isArray(result?.chats)
    ? result.chats
    : [];
renderChatList(chats);
if (!state.chatId && chats.length) {
  await openChat(chats[0].id);
  return;
}
if (!chats.length) {
  state.chatId = null;
  clearMessages();
}

} catch (error) {
toast(error.message);
}
}

function renderChatList(chats) {
const list = $(“chatList”);

if (!list) {
return;
}

list.innerHTML = “”;

chats.forEach((chat) => {
const item =
document.createElement(“div”);

item.className =
  "chat-item" +
  (
    String(chat.id) ===
    String(state.chatId)
      ? " active"
      : ""
  );
const icon =
  document.createElement("span");
icon.textContent = "💬";
const title =
  document.createElement("span");
title.className =
  "chat-item-title";
title.textContent =
  chat.title ||
  "Новый чат";
const deleteButton =
  document.createElement("button");
deleteButton.className =
  "chat-delete";
deleteButton.type = "button";
deleteButton.title = "Удалить";
deleteButton.setAttribute(
  "aria-label",
  "Удалить чат"
);
deleteButton.textContent = "×";
item.appendChild(icon);
item.appendChild(title);
item.appendChild(deleteButton);
item.addEventListener(
  "click",
  (event) => {
    if (
      event.target.closest(".chat-delete")
    ) {
      return;
    }
    openChat(chat.id);
  }
);
deleteButton.addEventListener(
  "click",
  async (event) => {
    event.stopPropagation();
    if (!confirm("Удалить этот чат?")) {
      return;
    }
    try {
      await api(
        `/api/chats/${encodeURIComponent(chat.id)}`,
        {
          method: "DELETE"
        }
      );
      if (
        String(state.chatId) ===
        String(chat.id)
      ) {
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
if (!chatId) {
return;
}

try {
const result =
await api(
/api/chats/${encodeURIComponent(chatId)}
);

state.chatId = chatId;
renderMessages(
  Array.isArray(result?.messages)
    ? result.messages
    : []
);
$("sidebar")?.classList.remove("open");
if (Array.isArray(result?.chats)) {
  renderChatList(result.chats);
}

} catch (error) {
toast(error.message);
}
}

async function newChat() {
if (!state.user?.id || state.guest) {
state.chatId = null;

clearMessages();
$("messageInput")?.focus();
return;

}

try {
const result =
await api(
“/api/chats”,
{
method: “POST”,
body: JSON.stringify({
title: “Новый чат”,
temporary: state.temporary
})
}
);

if (!result?.chat?.id) {
  throw new Error(
    "Сервер не вернул идентификатор чата."
  );
}
state.chatId =
  result.chat.id;
clearMessages();
await loadChats();
$("messageInput")?.focus();

} catch (error) {
toast(error.message);
}
}

/* =========================================================
MESSAGES
========================================================= */

async function sendMessage() {
if (state.sending) {
return;
}

const input = $(“messageInput”);

if (!input) {
return;
}

const message =
input.value.trim();

if (!message) {
return;
}

state.sending = true;

input.value = “”;

autoResize();

hide($(“welcome”));

addMessage(
“user”,
message
);

const loading =
addMessage(
“assistant”,
“Нейро-чат думает…”
);

const sendButton = $(“sendBtn”);

if (sendButton) {
sendButton.disabled = true;
}

try {

/*
 * Гостевой режим не пытается отправлять
 * запрос на защищённый /api/chat.
 */
if (!state.user?.id || state.guest) {
  loading.remove();
  addMessage(
    "assistant",
    "Ты сейчас в гостевом режиме. " +
    "Войди в аккаунт, чтобы использовать AI и сохранять историю чатов."
  );
  return;
}
/*
 * Если чат ещё не создан,
 * создаём его автоматически.
 */
if (!state.chatId) {
  const chatResult =
    await api(
      "/api/chats",
      {
        method: "POST",
        body: JSON.stringify({
          title: message.slice(0, 60) || "Новый чат",
          temporary: state.temporary
        })
      }
    );
  if (chatResult?.chat?.id) {
    state.chatId =
      chatResult.chat.id;
  }
}
const result =
  await api(
    "/api/chat",
    {
      method: "POST",
      body: JSON.stringify({
        chatId: state.chatId,
        message,
        temporary: state.temporary,
        model: state.model
      })
    }
  );
if (result?.chatId) {
  state.chatId =
    result.chatId;
}
/*
 * Разные версии backend могут возвращать
 * answer или message.
 */
const answer =
  result?.answer ??
  result?.message ??
  result?.content ??
  result?.response ??
  result?.text ??
  "";
loading.remove();
if (answer) {
  addMessage(
    "assistant",
    answer
  );
} else {
  addMessage(
    "assistant",
    "Сервер не вернул текст ответа."
  );
}
await loadChats();

} catch (error) {
loading.remove();

addMessage(
  "assistant",
  "Ошибка: " +
  (
    error.message ||
    "Не удалось получить ответ."
  )
);

} finally {
state.sending = false;

if (sendButton) {
  sendButton.disabled = false;
}
input.focus();

}
}

function addMessage(role, content) {
const messages = $(“messages”);

if (!messages) {
return document.createElement(“div”);
}

const row =
document.createElement(“div”);

row.className =
“message-row “ +
(
role === “user”
? “user”
: “assistant”
);

const message =
document.createElement(“div”);

message.className =
“message “ +
(
role === “user”
? “user”
: “assistant”
);

/*

* textContent используется специально,
* чтобы ответ AI не мог вставить HTML/JS
* непосредственно в страницу.
    */
    message.textContent =
    String(content ?? “”);

row.appendChild(message);

messages.appendChild(row);

scrollMessages();

return row;
}

function renderMessages(messages) {
clearMessages();

if (!Array.isArray(messages) || !messages.length) {
show($(“welcome”));
return;
}

hide($(“welcome”));

messages.forEach((message) => {
addMessage(
message?.role === “user”
? “user”
: “assistant”,
message?.content ||
message?.message ||
“”
);
});
}

function clearMessages() {
const messages = $(“messages”);

if (messages) {
messages
.querySelectorAll(”.message-row”)
.forEach(
(element) => element.remove()
);
}

show($(“welcome”));
}

function scrollMessages() {
requestAnimationFrame(() => {
const messages = $(“messages”);

if (messages) {
  messages.scrollTop =
    messages.scrollHeight;
}

});
}

/* =========================================================
CLEAR CHAT
========================================================= */

async function clearCurrentChat() {
if (!state.chatId) {
clearMessages();
return;
}

if (!confirm(“Очистить текущий чат?”)) {
return;
}

try {
await api(
/api/chats/${encodeURIComponent(state.chatId)},
{
method: “DELETE”
}
);

state.chatId = null;
clearMessages();
await loadChats();

} catch (error) {
toast(error.message);
}
}

/* =========================================================
SETTINGS
========================================================= */

function openSettings() {
if ($(“temporarySetting”)) {
$(“temporarySetting”).checked =
state.temporary;
}

show($(“settingsModal”));
}

function toggleTemporary() {
state.temporary =
!state.temporary;

if ($(“temporarySetting”)) {
$(“temporarySetting”).checked =
state.temporary;
}

updateTemporaryButton();

toast(
state.temporary
? “Временный чат включён”
: “Временный чат выключен”
);
}

function updateTemporaryButton() {
const button =
$(“temporaryBtn”);

if (!button) {
return;
}

if (state.temporary) {
button.style.color = “#fff”;
button.style.borderColor =
“rgba(255,255,255,.25)”;
} else {
button.style.color = “”;
button.style.borderColor = “”;
}
}

async function saveSettings() {
state.temporary =
Boolean(
$(“temporarySetting”)?.checked
);

updateTemporaryButton();

/*

* Настройки сохраняем на backend,
* если endpoint доступен.
    /
    if (state.user?.id && !state.guest) {
    try {
    await api(
    “/api/settings”,
    {
    method: “POST”,
    body: JSON.stringify({
    temporary: state.temporary,
    model: state.model
    })
    }
    );
    } catch {
    /
    * Локальная настройка всё равно остаётся.
        */
        }
        }

hide($(“settingsModal”));

toast(“Настройки сохранены”);
}

function updateModelName() {
const element = $(“modelName”);

if (!element) {
return;
}

element.textContent =
state.model === “neuro”
? “Нейро AI”
: “Автономный режим”;
}

function selectModel(model) {
if (
model !== “neuro” &&
model !== “autonomous”
) {
return;
}

state.model = model;

$(“modelMenu”)?.classList.add(“hidden”);

$(“modelBtn”)?.setAttribute(
“aria-expanded”,
“false”
);

updateModelName();

toast(
model === “neuro”
? “Выбран Нейро AI”
: “Выбран автономный режим”
);
}

/* =========================================================
MODEL MENU
========================================================= */

function handleModelButton(event) {
event.stopPropagation();

const menu = $(“modelMenu”);

if (!menu) {
return;
}

const hidden =
menu.classList.toggle(“hidden”);

$(“modelBtn”)?.setAttribute(
“aria-expanded”,
String(!hidden)
);
}

function handleDocumentClick(event) {
const selector =
document.querySelector(”.model-selector”);

if (
selector &&
!selector.contains(event.target)
) {
$(“modelMenu”)?.classList.add(“hidden”);

$("modelBtn")?.setAttribute(
  "aria-expanded",
  "false"
);

}
}

/* =========================================================
TOOLS
========================================================= */

async function useTool(tool) {
hide($(“toolsModal”));

if (!state.user?.id || state.guest) {
toast(
“Войди в аккаунт, чтобы использовать инструменты.”
);

return;

}

try {
const result =
await api(
“/api/tools”,
{
method: “POST”,
body: JSON.stringify({
tool
})
}
);

const input =
  $("messageInput");
if (input) {
  input.value =
    result?.message ||
    result?.prompt ||
    "";
  autoResize();
  input.focus();
}
toast("Инструмент выбран");

} catch (error) {
toast(error.message);
}
}

/* =========================================================
FILES
========================================================= */

function handleFiles(event) {
state.files =
Array.from(
event.target.files || []
);

if (!state.files.length) {
return;
}

const preview =
$(“attachmentPreview”);

if (preview) {
preview.innerHTML = “”;

state.files.forEach((file) => {
  const item =
    document.createElement("div");
  item.className =
    "attachment";
  item.textContent =
    `📎 ${file.name} (${formatBytes(file.size)})`;
  preview.appendChild(item);
});

}

const info =
$(“fileInfo”);

if (info) {
info.innerHTML = “”;

state.files.forEach((file) => {
  const paragraph =
    document.createElement("p");
  paragraph.textContent =
    `📎 ${file.name}`;
  info.appendChild(paragraph);
});

}

show($(“fileModal”));
}

function confirmFiles() {
hide($(“fileModal”));

if (!state.files.length) {
return;
}

const input =
$(“messageInput”);

if (!input) {
return;
}

input.value =
“Я добавил файл: “ +
state.files
.map((file) => file.name)
.join(”, “) +
“. Помоги мне с ним.”;

autoResize();
input.focus();
}

/* =========================================================
VOICE
========================================================= */

function startVoice() {
const SpeechRecognition =
window.SpeechRecognition ||
window.webkitSpeechRecognition;

if (!SpeechRecognition) {
toast(
“Голосовой ввод не поддерживается этим браузером.”
);

return;

}

const recognition =
new SpeechRecognition();

recognition.lang =
“ru-RU”;

recognition.interimResults =
true;

recognition.continuous =
false;

recognition.onstart = () => {
if ($(“voiceBtn”)) {
$(“voiceBtn”).style.color =
“#fff”;
}

toast("Слушаю…");

};

recognition.onresult =
(event) => {
let text = “”;

  for (
    let i = event.resultIndex;
    i < event.results.length;
    i++
  ) {
    text +=
      event.results[i][0].transcript;
  }
  if ($("messageInput")) {
    $("messageInput").value =
      text;
    autoResize();
  }
};

recognition.onerror =
(event) => {
if (
event.error === “not-allowed”
) {
toast(
“Разреши браузеру доступ к микрофону.”
);
return;
}

  toast(
    "Не удалось распознать голос."
  );
};

recognition.onend = () => {
if ($(“voiceBtn”)) {
$(“voiceBtn”).style.color =
“”;
}
};

try {
recognition.start();
} catch {
toast(
“Голосовой ввод уже запущен.”
);
}
}

/* =========================================================
INPUT
========================================================= */

function handleInputKeydown(event) {
if (
event.key === “Enter” &&
!event.shiftKey
) {
event.preventDefault();

sendMessage();

}
}

function autoResize() {
const input =
$(“messageInput”);

if (!input) {
return;
}

input.style.height =
“auto”;

input.style.height =
Math.min(
input.scrollHeight,
180
) + “px”;
}

/* =========================================================
UI
========================================================= */

function show(element) {
if (!element) {
return;
}

element.classList.remove(“hidden”);
}

function hide(element) {
if (!element) {
return;
}

element.classList.add(“hidden”);
}

function toast(message) {
const element =
$(“toast”);

if (!element) {
return;
}

element.textContent =
String(message || “”);

element.classList.add(“show”);

clearTimeout(toast.timer);

toast.timer =
setTimeout(
() => {
element.classList.remove(“show”);
},
2600
);
}

function formatBytes(bytes) {
const size =
Number(bytes) || 0;

if (size < 1024) {
return ${size} Б;
}

if (size < 1024 * 1024) {
return (
${(size / 1024).toFixed(1)} КБ
);
}

if (size < 1024 * 1024 * 1024) {
return (
${(size / 1024 / 1024).toFixed(1)} МБ
);
}

return (
${(size / 1024 / 1024 / 1024).toFixed(1)} ГБ
);
}