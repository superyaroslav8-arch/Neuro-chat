(() => {
  "use strict";

  let lastError = null;

  function report(message, source = "client") {
    const text =
      String(message || "Неизвестная ошибка.");

    if (text === lastError) {
      return;
    }

    lastError = text;

    console.error(
      `[Нейро-чат:${source}]`,
      text
    );
  }

  window.addEventListener(
    "error",
    (event) => {
      report(
        event.error?.message ||
          event.message ||
          "Ошибка JavaScript.",
        "error"
      );
    }
  );

  window.addEventListener(
    "unhandledrejection",
    (event) => {
      const reason =
        event.reason;

      report(
        reason?.message ||
          String(reason) ||
          "Необработанная ошибка.",
        "promise"
      );
    }
  );

  window.addEventListener(
    "offline",
    () => {
      report(
        "Нет подключения к интернету.",
        "network"
      );
    }
  );

  window.addEventListener(
    "online",
    () => {
      lastError = null;
      console.info(
        "[Нейро-чат:network] Подключение восстановлено."
      );
    }
  );

  window.__neuroChatErrorGuard = {
    report
  };
})();