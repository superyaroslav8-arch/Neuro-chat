const $ = selector =>
  document.querySelector(selector);

const state = {
  registering: false,
  chatId: null,
  sending: false
};


/* =====================
   API
===================== */

async function api(url, options = {}) {

  const response = await fetch(
    url,
    {
      credentials: "same-origin",

      headers: {
        "Content-Type":
          "application/json",

        ...(options.headers || {})
      },

      ...options
    }
  );

  const text =
    await response.text();

  let data;

  try {
    data =
      text
        ? JSON.parse(text)
        : {};
  } catch {
    throw new Error(
      "Сервер вернул некорректный ответ."
    );
  }

  if (
    !response.ok ||
    data.ok === false
  ) {
    throw new Error(
      data.error ||
      `Ошибка ${response.status}`
    );
  }

  return data;
}


/* =====================
   AUTH
===================== */

function showAuthError(text) {
  $("#authError").textContent =
    text || "";
}

function showAuth() {
  $("#auth")
    .classList
    .remove("hidden");

  $("#app")
    .classList
    .add("hidden");
}

async function enter(user) {

  $("#auth")
    .classList
    .add("hidden");

  $("#app")
    .classList
    .remove("hidden");

  $("#userName").textContent =
    user.username;

  resetConversation();

  await loadChats();
}


/* =====================
   MESSAGES
===================== */

function addMessage(
  role,
  content
) {

  $("#welcome")
    ?.classList
    .add("hidden");

  const wrapper =
    document.createElement("div");

  wrapper.className =
    `message ${role}`;

  wrapper.innerHTML = `
    <div>
      <div class="msg-label">
        ${
          role === "user"
            ? "Вы"
            : "Нейро"
        }
      </div>

      <div class="bubble"></div>
    </div>
  `;

  wrapper
    .querySelector(".bubble")
    .textContent = content;

  $("#conversation")
    .appendChild(wrapper);

  $("#conversation")
    .scrollTop =
      $("#conversation").scrollHeight;
}


/* =====================
   RESET CHAT
===================== */

function resetConversation() {

  $("#conversation").innerHTML = `
    <div
      class="welcome"
      id="welcome"
    >

      <div class="hero-logo">
        N
      </div>

      <h2>
        Чем могу помочь?
      </h2>

      <p>
        Задай вопрос, напиши идею
        или пришли задачу.
      </p>

      <div class="suggestions">

        <button
          data-q="Помоги мне придумать идею для сайта"
        >
          💡 Идея для сайта
        </button>

        <button
          data-q="Помоги исправить мой JavaScript"
        >
          🧩 Исправить код
        </button>

        <button
          data-q="Расскажи, что ты умеешь"
        >
          ✨ Что ты умеешь?
        </button>

      </div>

    </div>
  `;

  bindSuggestions();
}


/* =====================
   CHATS
===================== */

async function loadChats() {

  const data =
    await api("/api/chats");

  const list =
    $("#chatList");

  list.innerHTML = "";

  data.chats.forEach(chat => {

    const button =
      document.createElement("button");

    button.className =
      "chat-item" +
      (
        chat.id === state.chatId
          ? " active"
          : ""
      );

    button.textContent =
      chat.title ||
      "Новый чат";

    button.onclick =
      () => openChat(chat.id);

    list.appendChild(button);
  });
}


async function openChat(id) {

  const data =
    await api(
      "/api/chats/" +
      encodeURIComponent(id)
    );

  state.chatId =
    id;

  resetConversation();

  data.chat.messages
    .forEach(message => {

      addMessage(
        message.role,
        message.content
      );

    });

  await loadChats();
}


async function newChat() {

  state.chatId =
    null;

  resetConversation();

  await loadChats();
}


/* =====================
   SEND
===================== */

async function sendMessage(text) {

  const message =
    (
      text ??
      $("#message").value
    ).trim();

  if (
    !message ||
    state.sending
  ) {
    return;
  }

  state.sending =
    true;

  $("#send").disabled =
    true;

  $("#message").value =
    "";

  $("#message").style.height =
    "auto";

  addMessage(
    "user",
    message
  );

  const loading =
    document.createElement("div");

  loading.className =
    "message assistant";

  loading.innerHTML = `
    <div>
      <div class="msg-label">
        Нейро
      </div>

      <div class="bubble">
        Думаю…
      </div>
    </div>
  `;

  $("#conversation")
    .appendChild(loading);

  $("#conversation")
    .scrollTop =
      $("#conversation").scrollHeight;

  try {

    const data =
      await api(
        "/api/chat",
        {
          method: "POST",

          body:
            JSON.stringify({
              chatId:
                state.chatId,

              message
            })
        }
      );

    loading.remove();

    state.chatId =
      data.chatId;

    addMessage(
      "assistant",
      data.message.content
    );

    await loadChats();

  } catch (error) {

    loading.remove();

    addMessage(
      "assistant",
      "Не получилось обработать запрос: " +
      error.message
    );

  } finally {

    state.sending =
      false;

    $("#send").disabled =
      false;

    $("#message").focus();
  }
}


/* =====================
   SUGGESTIONS
===================== */

function bindSuggestions() {

  document
    .querySelectorAll(
      "[data-q]"
    )
    .forEach(button => {

      button.onclick =
        () =>
          sendMessage(
            button.dataset.q
          );

    });
}


/* =====================
   AUTH FORM
===================== */

$("#toggleAuth").onclick =
  () => {

    state.registering =
      !state.registering;

    $("#authSubmit")
      .textContent =
        state.registering
          ? "Создать аккаунт"
          : "Войти";

    $("#toggleAuth")
      .textContent =
        state.registering
          ? "У меня уже есть аккаунт"
          : "Создать аккаунт";

    showAuthError("");
  };


$("#authForm").onsubmit =
  async event => {

    event.preventDefault();

    showAuthError("");

    const username =
      $("#username")
        .value
        .trim();

    const password =
      $("#password")
        .value;

    try {

      const endpoint =
        state.registering
          ? "/api/auth/register"
          : "/api/auth/login";

      const data =
        await api(
          endpoint,
          {
            method: "POST",

            body:
              JSON.stringify({
                username,
                password
              })
          }
        );

      await enter(
        data.user
      );

    } catch (error) {

      showAuthError(
        error.message
      );
    }
  };


/* =====================
   LOGOUT
===================== */

$("#logout").onclick =
  async () => {

    try {
      await api(
        "/api/auth/logout",
        {
          method: "POST"
        }
      );
    } finally {
      location.reload();
    }
  };


/* =====================
   BUTTONS
===================== */

$("#newChat").onclick =
  newChat;

$("#newChat2").onclick =
  newChat;

$("#clearChat").onclick =
  newChat;

$("#send").onclick =
  () => sendMessage();


/* =====================
   ENTER
===================== */

$("#message")
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


/* =====================
   TEXTAREA
===================== */

$("#message")
  .addEventListener(
    "input",
    event => {

      event.target.style.height =
        "auto";

      event.target.style.height =
        Math.min(
          event.target.scrollHeight,
          180
        ) + "px";
    }
  );


/* =====================
   MOBILE SIDEBAR
===================== */

$("#openSide").onclick =
  () =>
    $("#sidebar")
      .classList
      .add("open");


$("#closeSide").onclick =
  () =>
    $("#sidebar")
      .classList
      .remove("open");


/* =====================
   FILE
===================== */

$("#fileInput")
  .onchange =
    event => {

      const files =
        [...event.target.files];

      const names =
        files
          .map(file => file.name)
          .join(", ");

      if (names) {

        addMessage(
          "user",
          "📎 Файл: " +
          names
        );
      }

      event.target.value =
        "";
    };


/* =====================
   TOOLS
===================== */

document
  .querySelectorAll(
    "[data-tool]"
  )
  .forEach(button => {

    button.onclick =
      () => {

        const tool =
          button.dataset.tool;

        if (
          tool === "file"
        ) {

          $("#fileInput")
            .click();

          return;
        }

        if (
          tool === "code"
        ) {

          $("#message").value =
            "Помоги мне с кодом: ";

          $("#message").focus();

          return;
        }

        if (
          tool === "image"
        ) {

          sendMessage(
            "Хочу создать изображение. Опиши, что нужно сделать."
          );

          return;
        }

        if (
          tool === "video"
        ) {

          sendMessage(
            "Хочу создать видео. Опиши сцену."
          );
        }

      };

  });


/* =====================
   START
===================== */

async function boot() {

  try {

    const data =
      await api(
        "/api/auth/me"
      );

    if (
      data.authenticated
    ) {

      await enter(
        data.user
      );

    } else {

      showAuth();
    }

  } catch {

    showAuth();
  }
}


bindSuggestions();
boot();