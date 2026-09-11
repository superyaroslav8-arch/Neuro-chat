"use strict";

/*
 * GitHub Pages frontend
 *
 * AI backend:
 * https://neuro-chat.superyaroslav8.workers.dev
 */

const API_BASE =
  "https://neuro-chat.superyaroslav8.workers.dev";

const state = {
  chatId: null,
  temporary: false,
  sending: false,
  chats: []
};


const $ = (id) =>
  document.getElementById(id);


/* =========================
   API
========================= */

async function api(path, options = {}) {

  const response = await fetch(
    API_BASE + path,
    {
      ...options,

      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    }
  );

  const text =
    await response.text();

  let data = {};

  try {
    data =
      text
        ? JSON.parse(text)
        : {};
  } catch {
    data = {
      message: text
    };
  }

  if (!response.ok) {

    throw new Error(
      data.error ||
      data.message ||
      `Ошибка сервера: ${response.status}`
    );
  }

  return data;
}


/* =========================
   INIT
========================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {

    bindEvents();

    $("messageInput")?.focus();

  }
);


/* =========================
   EVENTS
========================= */

function bindEvents() {

  $("sendButton")?.addEventListener(
    "click",
    sendMessage
  );


  $("newChat")?.addEventListener(
    "click",
    newChat
  );


  $("temporaryButton")?.addEventListener(
    "click",
    toggleTemporary
  );


  $("temporarySetting")?.addEventListener(
    "change",
    event => {

      state.temporary =
        event.target.checked;

    }
  );


  $("saveSettings")?.addEventListener(
    "click",
    () => {

      state.temporary =
        Boolean(
          $("temporarySetting")?.checked
        );

      closeModal("settingsModal");

      updateTemporaryButton();

      toast("Настройки сохранены");

    }
  );


  $("settingsButton")?.addEventListener(
    "click",
    () => {

      if ($("temporarySetting")) {

        $("temporarySetting").checked =
          state.temporary;

      }

      openModal("settingsModal");

    }
  );


  $("toolsButton")?.addEventListener(
    "click",
    () =>
      openModal("toolsModal")
  );


  $("mobileMenu")?.addEventListener(
    "click",
    () => {

      $("sidebar")
        ?.classList
        .toggle("open");

    }
  );


  $("attachButton")?.addEventListener(
    "click",
    () =>
      $("fileInput")?.click()
  );


  $("fileInput")?.addEventListener(
    "change",
    handleFiles
  );


  $("voiceButton")?.addEventListener(
    "click",
    startVoice
  );


  $("messageInput")?.addEventListener(
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


  $("messageInput")?.addEventListener(
    "input",
    autoResize
  );


  document
    .querySelectorAll("[data-prompt]")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          const input =
            $("messageInput");

          input.value =
            button.dataset.prompt || "";

          input.focus();

          autoResize();

        }
      );

    });


  document
    .querySelectorAll("[data-close]")
    .forEach(button => {

      button.addEventListener(
        "click",
        () =>
          closeModal(
            button.dataset.close
          )
      );

    });


  document
    .querySelectorAll("[data-tool]")
    .forEach(button => {

      button.addEventListener(
        "click",
        () =>
          useTool(
            button.dataset.tool
          )
      );

    });

}


/* =========================
   NEW CHAT
========================= */

function newChat() {

  state.chatId = null;

  clearMessages();

  $("messageInput")?.focus();

  $("sidebar")
    ?.classList
    .remove("open");

}


/* =========================
   SEND
========================= */

async function sendMessage() {

  if (state.sending) {
    return;
  }


  const input =
    $("messageInput");

  const text =
    input?.value.trim();

  if (!text) {
    return;
  }


  state.sending = true;


  input.value = "";

  autoResize();


  hideWelcome();


  addMessage(
    "user",
    text
  );


  const loading =
    addMessage(
      "assistant",
      "Нейро думает…"
    );


  $("sendButton").disabled =
    true;


  try {

    const result =
      await api(
        "/api/chat",
        {
          method: "POST",

          body: JSON.stringify({

            chatId:
              state.chatId,

            message:
              text,

            temporary:
              state.temporary

          })
        }
      );


    if (result.chatId) {

      state.chatId =
        result.chatId;

    }


    const answer =
      result.answer ||
      result.message ||
      result.content ||
      result.text ||
      "Нейро не вернул ответ.";


    loading.remove();


    addMessage(
      "assistant",
      answer
    );


  } catch (error) {

    loading.remove();


    addMessage(
      "assistant",
      "Ошибка подключения к Нейро:\n\n" +
      error.message
    );

  } finally {

    state.sending = false;

    $("sendButton").disabled =
      false;

    input.focus();

  }

}


/* =========================
   MESSAGE
========================= */

function addMessage(
  role,
  text
) {

  const container =
    $("messages");

  const row =
    document.createElement(
      "div"
    );

  row.className =
    "message-row " +
    role;


  const message =
    document.createElement(
      "div"
    );

  message.className =
    "message " +
    role;


  message.textContent =
    String(text);


  row.appendChild(message);

  container.appendChild(row);

  container.scrollTop =
    container.scrollHeight;


  return row;
}


/* =========================
   CLEAR
========================= */

function clearMessages() {

  const container =
    $("messages");

  container
    .querySelectorAll(
      ".message-row"
    )
    .forEach(
      element =>
        element.remove()
    );


  showWelcome();

}


function showWelcome() {

  $("welcome")
    ?.classList
    .remove("hidden");

}


function hideWelcome() {

  $("welcome")
    ?.classList
    .add("hidden");

}


/* =========================
   TEMPORARY
========================= */

function toggleTemporary() {

  state.temporary =
    !state.temporary;

  updateTemporaryButton();

  toast(
    state.temporary
      ? "Временный чат включён"
      : "Временный чат выключен"
  );

}


function updateTemporaryButton() {

  const button =
    $("temporaryButton");

  if (!button) {
    return;
  }

  button.classList.toggle(
    "active",
    state.temporary
  );

}


/* =========================
   TOOLS
========================= */

function useTool(tool) {

  closeModal(
    "toolsModal"
  );


  const input =
    $("messageInput");


  const prompts = {

    image:
      "Помоги создать подробный промпт для генерации изображения.",

    video:
      "Помоги написать сценарий и промпт для создания видео.",

    code:
      "Помоги написать или исправить код.",

    website:
      "Помоги создать современный сайт. Сначала предложи структуру, затем код.",

    "3d":
      "Помоги подготовить подробное описание 3D-модели для последующей печати."

  };


  input.value =
    prompts[tool] ||
    "";


  autoResize();

  input.focus();

}


/* =========================
   FILES
========================= */

function handleFiles(event) {

  const files =
    Array.from(
      event.target.files || []
    );


  if (!files.length) {
    return;
  }


  const names =
    files
      .map(file => file.name)
      .join(", ");


  const input =
    $("messageInput");


  input.value =
    `Я прикрепил файл: ${names}. Помоги мне с ним.`;


  autoResize();

  input.focus();


  toast(
    "Файл выбран. Полноценная передача содержимого файла будет подключена отдельно."
  );

}


/* =========================
   VOICE
========================= */

function startVoice() {

  const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;


  if (!SpeechRecognition) {

    toast(
      "Голосовой ввод не поддерживается."
    );

    return;

  }


  const recognition =
    new SpeechRecognition();


  recognition.lang =
    "ru-RU";

  recognition.interimResults =
    false;

  recognition.continuous =
    false;


  recognition.onstart =
    () =>
      toast("Слушаю…");


  recognition.onresult =
    event => {

      const text =
        event.results[0][0]
          .transcript;


      $("messageInput").value =
        text;


      autoResize();

    };


  recognition.onerror =
    () =>
      toast(
        "Не удалось распознать голос."
      );


  try {

    recognition.start();

  } catch {

    toast(
      "Голосовой ввод уже запущен."
    );

  }

}


/* =========================
   TEXTAREA
========================= */

function autoResize() {

  const input =
    $("messageInput");

  if (!input) {
    return;
  }


  input.style.height =
    "auto";


  input.style.height =
    Math.min(
      input.scrollHeight,
      180
    ) + "px";

}


/* =========================
   MODALS
========================= */

function openModal(id) {

  $(id)
    ?.classList
    .remove("hidden");

}


function closeModal(id) {

  $(id)
    ?.classList
    .add("hidden");

}


/* =========================
   TOAST
========================= */

let toastTimer;


function toast(text) {

  const element =
    $("toast");

  if (!element) {
    return;
  }


  element.textContent =
    text;


  element.classList.add(
    "show"
  );


  clearTimeout(
    toastTimer
  );


  toastTimer =
    setTimeout(
      () =>
        element.classList.remove(
          "show"
        ),
      2500
    );

}