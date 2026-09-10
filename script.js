const API = {
  me: "./api/auth/me",
  login: "./api/auth/login",
  register: "./api/auth/register",
  logout: "./api/auth/logout",

  chats: "./api/chats",
  chat: "./api/chat",

  settings: "./api/settings",
  permissions: "./api/permissions",
  plugins: "./api/plugins",

  image: "./api/generate/image",
  video: "./api/generate/video",
  music: "./api/generate/music",
  model3d: "./api/generate/3d"
};


const MODELS = {
  neuro: "Нейро",
  chatgpt: "ChatGPT",
  gemini: "Gemini",
  grok: "Grok",
  "alice-1": "Алиса 1"
};


const $ = (id) =>
  document.getElementById(id);


const state = {
  user: null,
  authenticated: false,
  guest: true,

  authMode: "login",

  currentChatId: null,
  currentModel: "neuro",

  temporaryChat: false,

  chats: [],

  selectedTool: null,

  sending: false
};


function show(id) {

  const element = $(id);

  if (element) {
    element.hidden = false;
  }

}


function hide(id) {

  const element = $(id);

  if (element) {
    element.hidden = true;
  }

}


function openModal(id) {

  show(id);

  document.body.classList.add(
    "modal-open"
  );

}


function closeModal(id) {

  hide(id);

  const anotherModal =
    document.querySelector(
      ".modal-overlay:not([hidden])"
    );

  if (!anotherModal) {
    document.body.classList.remove(
      "modal-open"
    );
  }

}


function closeAllModals() {

  document
    .querySelectorAll(
      ".modal-overlay"
    )
    .forEach((element) => {
      element.hidden = true;
    });

  document.body.classList.remove(
    "modal-open"
  );

}


async function api(
  url,
  options = {}
) {

  const headers =
    new Headers(
      options.headers || {}
    );

  if (
    options.body &&
    !(options.body instanceof FormData)
  ) {

    headers.set(
      "content-type",
      "application/json"
    );

  }

  const response =
    await fetch(
      url,
      {
        credentials: "same-origin",
        ...options,
        headers
      }
    );


  let data = {};

  try {

    data =
      await response.json();

  } catch {

    data = {};

  }


  if (
    !response.ok ||
    data.ok === false
  ) {

    throw new Error(
      data.error ||
      `Ошибка запроса: ${response.status}`
    );

  }


  return data;

}


/* AUTH STATE */

function setAuth(user) {

  state.user =
    user || null;

  state.authenticated =
    Boolean(user);

  state.guest =
    !user;


  $("accountButton").textContent =
    user?.username || "Войти";

  $("profileButtonText").textContent =
    user?.username || "Профиль";

  $("profileName").textContent =
    user?.username || "Гость";

  $("profileAuthButton").textContent =
    user
      ? "Профиль подключён"
      : "Войти";

  $("logoutButton").hidden =
    !user;

}


/* SESSION */

async function loadSession() {

  try {

    const data =
      await api(API.me);


    if (
      data.authenticated &&
      data.user
    ) {

      setAuth(data.user);

      await Promise.all([
        loadChats(),
        loadSettings()
      ]);

    } else {

      setAuth(null);

    }

  } catch {

    setAuth(null);

  }

}


/* CHATS */

async function loadChats() {

  if (!state.authenticated) {

    state.chats = [];

    renderChats();

    return;

  }


  try {

    const data =
      await api(API.chats);

    state.chats =
      Array.isArray(data.chats)
        ? data.chats
        : [];

    renderChats();

  } catch {

    state.chats = [];

    renderChats();

  }

}


function renderChats() {

  const list =
    $("chatList");

  if (!list) {
    return;
  }


  list.innerHTML = "";


  state.chats.forEach(
    (chat) => {

      const button =
        document.createElement(
          "button"
        );

      button.type =
        "button";

      button.className =
        "chat-item";

      button.textContent =
        chat.title ||
        "Новый чат";

      button.title =
        chat.title ||
        "Новый чат";


      button.onclick =
        () => {
          openChat(chat.id);
        };


      list.appendChild(
        button
      );

    }
  );

}


async function createNewChat() {

  state.currentChatId =
    null;

  state.sending =
    false;


  $("messages").innerHTML =
    "";

  show("homeScreen");
  hide("chatScreen");


  $("messageInput").value =
    "";

  $("messageInput").focus();


  if (!state.authenticated) {
    return;
  }


  try {

    const data =
      await api(
        API.chats,
        {
          method: "POST",

          body: JSON.stringify({
            title: "Новый чат",
            model: state.currentModel
          })
        }
      );


    state.currentChatId =
      data.chat?.id ||
      null;


    await loadChats();

  } catch {

    // Ничего не блокируем:
    // новый чат всё равно доступен.
  }

}


async function openChat(
  chatId
) {

  if (!chatId) {
    return;
  }


  state.currentChatId =
    String(chatId);


  hide("homeScreen");
  show("chatScreen");


  $("messages").innerHTML =
    "";


  try {

    const data =
      await api(
        `./api/chats/${encodeURIComponent(
          chatId
        )}/messages`
      );


    const chatMessages =
      Array.isArray(
        data.messages
      )
        ? data.messages
        : [];


    chatMessages.forEach(
      (message) => {

        addMessage(
          message.role,
          message.content
        );

      }
    );


    scrollBottom();

  } catch (error) {

    addMessage(
      "assistant",
      `Не удалось открыть чат: ${error.message}`
    );

  }

}


/* MESSAGES */

function addMessage(
  role,
  text,
  options = {}
) {

  const wrapper =
    document.createElement(
      "div"
    );


  wrapper.className =
    `message ${
      role === "user"
        ? "user"
        : "assistant"
    }`;


  if (options.loading) {

    wrapper.classList.add(
      "loading"
    );

    wrapper.dataset.loading =
      "true";

  }


  const roleElement =
    document.createElement(
      "div"
    );

  roleElement.className =
    "message-role";

  roleElement.textContent =
    role === "user"
      ? "Вы"
      : "Нейро";


  const bubble =
    document.createElement(
      "div"
    );

  bubble.className =
    "message-bubble";

  bubble.textContent =
    text || "";


  wrapper.append(
    roleElement,
    bubble
  );


  $("messages").appendChild(
    wrapper
  );


  return wrapper;

}


function scrollBottom() {

  const messages =
    $("messages");

  messages.scrollTop =
    messages.scrollHeight;

}


function resizeTextarea(
  textarea
) {

  textarea.style.height =
    "auto";

  textarea.style.height =
    `${Math.min(
      textarea.scrollHeight,
      180
    )}px`;

}


/* MODELS */

function setModel(
  model
) {

  state.currentModel =
    MODELS[model]
      ? model
      : "neuro";


  $("modelButtonText").textContent =
    MODELS[
      state.currentModel
    ];

  $("chatModelButtonText").textContent =
    MODELS[
      state.currentModel
    ];


  hide("modelMenu");

}


function setupModelMenus() {

  $("modelButton").onclick =
    () => {

      const menu =
        $("modelMenu");

      menu.hidden =
        !menu.hidden;

    };


  $("chatModelButton").onclick =
    () => {

      const menu =
        $("modelMenu");

      menu.hidden =
        !menu.hidden;

    };


  document
    .querySelectorAll(
      "#modelMenu [data-model]"
    )
    .forEach(
      (button) => {

        button.onclick =
          () => {

            setModel(
              button.dataset.model
            );

          };

      }
    );


  document.addEventListener(
    "click",
    (event) => {

      if (
        !event.target.closest(
          "#modelMenu,#modelButton,#chatModelButton"
        )
      ) {

        hide("modelMenu");

      }

    }
  );

}


/* SEND MESSAGE */

async function sendMessage(
  inputId
) {

  if (state.sending) {
    return;
  }


  const input =
    $(inputId);

  const text =
    input.value.trim();


  if (!text) {
    return;
  }


  state.sending =
    true;


  const sendButton =
    inputId === "messageInput"
      ? $("sendButton")
      : $("chatSendButton");


  sendButton.disabled =
    true;


  hide("homeScreen");
  show("chatScreen");


  addMessage(
    "user",
    text
  );


  input.value =
    "";

  resizeTextarea(
    input
  );


  const loading =
    addMessage(
      "assistant",
      "Нейро думает…",
      {
        loading: true
      }
    );


  scrollBottom();


  try {

    let chatId =
      state.currentChatId;


    if (
      state.authenticated &&
      !chatId &&
      !state.temporaryChat
    ) {

      const created =
        await api(
          API.chats,
          {
            method: "POST",

            body: JSON.stringify({
              title:
                text.slice(0, 60),

              model:
                state.currentModel
            })
          }
        );


      chatId =
        created.chat?.id ||
        null;

      state.currentChatId =
        chatId;


      await loadChats();

    }


    const payload = {

      message: text,

      model:
        state.currentModel,

      chatId,

      temporaryChat:
        state.temporaryChat

    };


    const data =
      await api(
        API.chat,
        {
          method: "POST",

          body:
            JSON.stringify(
              payload
            )
        }
      );


    loading.remove();


    const answer =
      data.message?.content ||
      data.message ||
      "Пустой ответ.";


    addMessage(
      "assistant",
      answer
    );


    scrollBottom();


    if (
      state.authenticated &&
      !state.temporaryChat
    ) {

      await loadChats();

    }

  } catch (error) {

    loading.remove();


    addMessage(
      "assistant",
      `Ошибка: ${error.message}`
    );


    scrollBottom();

  } finally {

    state.sending =
      false;

    sendButton.disabled =
      false;

  }

}


/* COMPOSER */

function setupComposer(
  inputId,
  buttonId
) {

  const input =
    $(inputId);

  const button =
    $(buttonId);


  input.addEventListener(
    "input",
    () => {
      resizeTextarea(
        input
      );
    }
  );


  input.addEventListener(
    "keydown",
    (event) => {

      if (
        event.key === "Enter" &&
        !event.shiftKey
      ) {

        event.preventDefault();

        sendMessage(
          inputId
        );

      }

    }
  );


  button.onclick =
    () => {

      sendMessage(
        inputId
      );

    };

}


/* FILES */

function setupFiles(
  buttonId,
  inputId
) {

  const button =
    $(buttonId);

  const input =
    $(inputId);


  button.onclick =
    () => {

      input.click();

    };


  input.onchange =
    () => {

      const files =
        [
          ...input.files
        ];


      if (!files.length) {
        return;
      }


      const target =
        button
          .closest(
            ".composer"
          )
          .querySelector(
            "textarea"
          );


      const names =
        files
          .map(
            (file) =>
              file.name
          )
          .join(", ");


      target.value +=
        target.value
          ? `\n\n[Файлы: ${names}]`
          : `[Файлы: ${names}]`;


      resizeTextarea(
        target
      );


      target.focus();


      input.value =
        "";

    };

}


/* VOICE */

function setupVoice(
  buttonId,
  inputId
) {

  $(buttonId).onclick =
    () => {

      const Recognition =
        window.SpeechRecognition ||
        window.webkitSpeechRecognition;


      if (!Recognition) {

        alert(
          "Голосовой ввод не поддерживается этим браузером."
        );

        return;

      }


      const recognition =
        new Recognition();


      recognition.lang =
        "ru-RU";

      recognition.interimResults =
        false;

      recognition.continuous =
        false;


      recognition.onresult =
        (event) => {

          const text =
            event
              .results?.[0]?.[0]
              ?.transcript ||
            "";


          if (!text) {
            return;
          }


          const input =
            $(inputId);


          input.value +=
            input.value
              ? ` ${text}`
              : text;


          resizeTextarea(
            input
          );


          input.focus();

        };


      try {

        recognition.start();

      } catch {

        // Браузер не дал повторно
        // запустить распознавание.
      }

    };

}


/* AUTH */

function openAuth(
  mode = "login"
) {

  state.authMode =
    mode;


  $("authTitle").textContent =
    mode === "login"
      ? "Войти"
      : "Создать аккаунт";


  $("authSubmitButton").textContent =
    mode === "login"
      ? "Войти"
      : "Зарегистрироваться";


  $("authSwitchButton").textContent =
    mode === "login"
      ? "Создать аккаунт"
      : "У меня уже есть аккаунт";


  $("authPasswordConfirm").hidden =
    mode === "login";


  $("authError").textContent =
    "";


  openModal(
    "authModal"
  );


  $("authUsername").focus();

}


async function submitAuth() {

  const username =
    $("authUsername")
      .value
      .trim();


  const password =
    $("authPassword")
      .value;


  const confirm =
    $("authPasswordConfirm")
      .value;


  $("authError").textContent =
    "";


  if (
    !username ||
    !password
  ) {

    $("authError").textContent =
      "Введите имя пользователя и пароль.";

    return;

  }


  if (
    state.authMode ===
      "register" &&
    password !== confirm
  ) {

    $("authError").textContent =
      "Пароли не совпадают.";

    return;

  }


  const button =
    $("authSubmitButton");


  button.disabled =
    true;


  try {

    const data =
      await api(
        state.authMode ===
          "login"
          ? API.login
          : API.register,
        {
          method: "POST",

          body:
            JSON.stringify({
              username,
              password
            })
        }
      );


    setAuth(
      data.user
    );


    closeModal(
      "authModal"
    );


    await loadChats();

    await loadSettings();

  } catch (error) {

    $("authError").textContent =
      error.message;

  } finally {

    button.disabled =
      false;

  }

}


async function logout() {

  try {

    await api(
      API.logout,
      {
        method: "POST",

        body:
          JSON.stringify({})
      }
    );

  } catch {
    // Сбрасываем интерфейс даже
    // если сервер недоступен.
  }


  setAuth(
    null
  );


  state.chats =
    [];


  renderChats();


  closeAllModals();

}


/* SETTINGS */

function setChecked(
  id,
  value
) {

  const element =
    $(id);

  if (element) {

    element.checked =
      Boolean(value);

  }

}


function setValue(
  id,
  value
) {

  const element =
    $(id);

  if (element) {

    element.value =
      String(
        value ?? ""
      );

  }

}


async function loadSettings() {

  if (
    !state.authenticated
  ) {

    return;

  }


  try {

    const [
      settingsData,
      permissionsData,
      pluginsData
    ] =
      await Promise.all([
        api(API.settings),
        api(API.permissions),
        api(API.plugins)
      ]);


    const settings =
      settingsData.settings ||
      {};


    const keys =
      settings.apiKeys ||
      {};


    state.temporaryChat =
      Boolean(
        settings.temporaryChat
      );


    setChecked(
      "temporaryChatToggle",
      state.temporaryChat
    );


    setValue(
      "openaiKey",
      keys.openai
    );

    setValue(
      "googleKey",
      keys.google
    );

    setValue(
      "xaiKey",
      keys.xai
    );

    setValue(
      "aliceKey",
      keys.alice
    );


    const permissions =
      permissionsData.permissions ||
      {};


    setChecked(
      "permissionFiles",
      permissions.files
    );

    setChecked(
      "permissionMicrophone",
      permissions.microphone
    );

    setChecked(
      "permissionExternal",
      permissions.external
    );


    const plugins =
      pluginsData.plugins ||
      {};


    setChecked(
      "pluginGithub",
      plugins.github
    );

    setChecked(
      "pluginGoogle",
      plugins.google
    );

    setChecked(
      "pluginChatGPT",
      plugins.chatgpt
    );

    setChecked(
      "pluginGrok",
      plugins.grok
    );

  } catch {
    // Настройки не должны ломать UI.
  }

}


async function saveSettings() {

  if (
    !state.authenticated
  ) {

    openAuth();

    return;

  }


  const settings = {

    temporaryChat:
      $("temporaryChatToggle")
        .checked,

    apiKeys: {

      openai:
        $("openaiKey")
          .value
          .trim(),

      google:
        $("googleKey")
          .value
          .trim(),

      xai:
        $("xaiKey")
          .value
          .trim(),

      alice:
        $("aliceKey")
          .value
          .trim()

    }

  };


  const permissions = {

    files:
      $("permissionFiles")
        .checked,

    microphone:
      $("permissionMicrophone")
        .checked,

    external:
      $("permissionExternal")
        .checked

  };


  const plugins = {

    github:
      $("pluginGithub")
        .checked,

    google:
      $("pluginGoogle")
        .checked,

    chatgpt:
      $("pluginChatGPT")
        .checked,

    grok:
      $("pluginGrok")
        .checked

  };


  $("settingsError").textContent =
    "";


  try {

    await api(
      API.settings,
      {
        method: "POST",

        body:
          JSON.stringify({
            settings
          })
      }
    );


    await api(
      API.permissions,
      {
        method: "POST",

        body:
          JSON.stringify({
            permissions
          })
      }
    );


    await api(
      API.plugins,
      {
        method: "POST",

        body:
          JSON.stringify({
            plugins
          })
      }
    );


    state.temporaryChat =
      settings.temporaryChat;


    closeModal(
      "settingsModal"
    );

  } catch (error) {

    $("settingsError").textContent =
      error.message;

  }

}


/* TOOLS */

const TOOLS = {

  image: {

    title:
      "Создание изображения",

    description:
      "Опишите изображение, которое нужно создать.",

    endpoint:
      API.image

  },


  video: {

    title:
      "Создание видео",

    description:
      "Опишите видео, которое нужно создать.",

    endpoint:
      API.video

  },


  music: {

    title:
      "Создание музыки",

    description:
      "Опишите музыку, которую нужно создать.",

    endpoint:
      API.music

  },


  "3d": {

    title:
      "Создание 3D-модели",

    description:
      "Опишите 3D-модель, которую нужно подготовить.",

    endpoint:
      API.model3d

  },


  website: {

    title:
      "Создание сайта",

    description:
      "Опишите сайт. Нейро подготовит структуру и код.",

    endpoint:
      API.chat

  }

};


function openTool(
  tool
) {

  const info =
    TOOLS[tool];


  if (!info) {
    return;
  }


  state.selectedTool =
    tool;


  $("toolTitle").textContent =
    info.title;


  $("toolDescription").textContent =
    info.description;


  $("toolPrompt").value =
    "";


  $("toolError").textContent =
    "";


  openModal(
    "toolModal"
  );


  $("toolPrompt").focus();

}


async function runTool() {

  const info =
    TOOLS[
      state.selectedTool
    ];


  const prompt =
    $("toolPrompt")
      .value
      .trim();


  if (
    !info ||
    !prompt
  ) {

    return;

  }


  $("toolError").textContent =
    "";


  const button =
    $("toolRunButton");


  button.disabled =
    true;


  button.textContent =
    "Выполняется…";


  try {

    let data;


    if (
      state.selectedTool ===
      "website"
    ) {

      data =
        await api(
          info.endpoint,
          {
            method: "POST",

            body:
              JSON.stringify({
                message:
                  prompt,

                model:
                  "neuro",

                chatId:
                  null,

                temporaryChat:
                  true
              })
          }
        );

    } else {

      data =
        await api(
          info.endpoint,
          {
            method: "POST",

            body:
              JSON.stringify({
                prompt
              })
          }
        );

    }


    closeModal(
      "toolModal"
    );


    hide(
      "homeScreen"
    );

    show(
      "chatScreen"
    );


    if (
      data.dataURI
    ) {

      const message =
        addMessage(
          "assistant",
          "Изображение создано."
        );


      const image =
        document.createElement(
          "img"
        );


      image.src =
        data.dataURI;


      image.className =
        "generated-image";


      message
        .querySelector(
          ".message-bubble"
        )
        .appendChild(
          image
        );

    } else {

      addMessage(
        "assistant",
        data.message?.content ||
        data.message ||
        "Запрос выполнен."
      );

    }


    scrollBottom();

  } catch (error) {

    $("toolError").textContent =
      error.message;

  } finally {

    button.disabled =
      false;

    button.textContent =
      "Запустить";

  }

}


/* UI */

function setupUI() {

  $("openSidebarButton").onclick =
    () => {

      document.body.classList.add(
        "sidebar-open"
      );

    };


  $("closeSidebarButton").onclick =
    () => {

      document.body.classList.remove(
        "sidebar-open"
      );

    };


  $("newChatButton").onclick =
    () => {

      document.body.classList.remove(
        "sidebar-open"
      );

      createNewChat();

    };


  $("settingsButton").onclick =
    () => {

      if (
        !state.authenticated
      ) {

        openAuth();

        return;

      }

      openModal(
        "settingsModal"
      );

    };


  $("profileButton").onclick =
    () => {

      openModal(
        "profileModal"
      );

    };


  $("accountButton").onclick =
    () => {

      if (
        state.authenticated
      ) {

        openModal(
          "profileModal"
        );

      } else {

        openAuth();

      }

    };


  $("profileAuthButton").onclick =
    () => {

      closeModal(
        "profileModal"
      );

      if (
        !state.authenticated
      ) {

        openAuth();

      }

    };


  $("logoutButton").onclick =
    logout;


  $("authSubmitButton").onclick =
    submitAuth;


  $("authSwitchButton").onclick =
    () => {

      openAuth(
        state.authMode ===
          "login"
          ? "register"
          : "login"
      );

    };


  $("continueGuestButton").onclick =
    () => {

      closeModal(
        "authModal"
      );

    };


  $("saveSettingsButton").onclick =
    saveSettings;


  $("temporaryChatToggle").onchange =
    (event) => {

      state.temporaryChat =
        event.target.checked;

    };


  $("toolRunButton").onclick =
    runTool;


  document
    .querySelectorAll(
      "[data-close]"
    )
    .forEach(
      (button) => {

        button.onclick =
          () => {

            closeModal(
              button.dataset.close
            );

          };

      }
    );


  document
    .querySelectorAll(
      ".modal-overlay"
    )
    .forEach(
      (modal) => {

        modal.addEventListener(
          "click",
          (event) => {

            if (
              event.target ===
              modal
            ) {

              closeModal(
                modal.id
              );

            }

          }
        );

      }
    );


  document.addEventListener(
    "keydown",
    (event) => {

      if (
        event.key ===
        "Escape"
      ) {

        closeAllModals();

      }

    }
  );


  document
    .querySelectorAll(
      ".tool-button"
    )
    .forEach(
      (button) => {

        button.onclick =
          () => {

            openTool(
              button.dataset.tool
            );

          };

      }
    );

}


/* INIT */

async function init() {

  setupUI();

  setupModelMenus();


  setupComposer(
    "messageInput",
    "sendButton"
  );


  setupComposer(
    "chatMessageInput",
    "chatSendButton"
  );


  setupFiles(
    "attachButton",
    "fileInput"
  );


  setupFiles(
    "chatAttachButton",
    "chatFileInput"
  );


  setupVoice(
    "voiceButton",
    "messageInput"
  );


  setupVoice(
    "chatVoiceButton",
    "chatMessageInput"
  );


  setModel(
    "neuro"
  );


  setAuth(
    null
  );


  await loadSession();

}


if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    init
  );

} else {

  init();

}