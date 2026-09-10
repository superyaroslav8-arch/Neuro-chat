/*
 * Нейро-чат — Error Guard
 * Защитный слой интерфейса.
 *
 * Задачи:
 * - перехватывать JavaScript-ошибки;
 * - перехватывать необработанные Promise-ошибки;
 * - отслеживать ошибки сетевых запросов;
 * - предотвращать зависание модальных окон;
 * - восстанавливать базовое состояние интерфейса после сбоя;
 * - не изменять структуру HTML и дизайн сайта.
 *
 * ВАЖНО:
 * Этот файл не переписывает исходный код и не пытается
 * "чинить" JavaScript на лету.
 */

(() => {
  "use strict";

  const GUARD_VERSION = "1.0.0";

  const state = {
    initialized: false,
    lastErrorTime: 0,
    errorCount: 0,
    networkErrors: 0,
    recovering: false,
    recoveryTimer: null,
    toastTimer: null
  };

  const CONFIG = {
    maxErrorsInWindow: 8,
    errorWindowMs: 10000,
    recoveryDelayMs: 150,
    toastDurationMs: 3500,
    networkTimeoutMs: 20000
  };

  const originalFetch =
    typeof window.fetch === "function"
      ? window.fetch.bind(window)
      : null;

  const originalConsoleError =
    typeof console !== "undefined" &&
    typeof console.error === "function"
      ? console.error.bind(console)
      : null;

  function now() {
    return Date.now();
  }

  function isElementVisible(element) {
    if (!element || !(element instanceof HTMLElement)) {
      return false;
    }

    if (element.hidden) {
      return false;
    }

    const style = window.getComputedStyle(element);

    return (
      style.display !== "none" &&
      style.visibility !== "hidden"
    );
  }

  function safeGet(id) {
    try {
      return document.getElementById(id);
    } catch {
      return null;
    }
  }

  function safeSetHidden(element, hidden) {
    if (!element) {
      return;
    }

    try {
      element.hidden = Boolean(hidden);
    } catch {
      // Намеренно игнорируем вторичную ошибку восстановления.
    }
  }

  function closeStuckModal(modalId) {
    const modal = safeGet(modalId);

    if (!modal) {
      return;
    }

    /*
     * Закрываем только явно зависшее окно.
     * Не вмешиваемся в активное окно сразу после открытия.
     */
    if (isElementVisible(modal)) {
      const openedAt = Number(modal.dataset.guardOpenedAt || 0);

      if (
        openedAt > 0 &&
        now() - openedAt > 120000
      ) {
        safeSetHidden(modal, true);
        delete modal.dataset.guardOpenedAt;
      }
    }
  }

  function markModalOpening(modal) {
    if (!modal) {
      return;
    }

    try {
      modal.dataset.guardOpenedAt = String(now());
    } catch {
      // Ничего не делаем.
    }
  }

  function normalizeBodyState() {
    try {
      if (!document.body) {
        return;
      }

      /*
       * Не устанавливаем стили и не меняем layout.
       * Только убираем аварийные классы, если основной код
       * случайно оставил их после закрытия меню/модалки.
       */
      const possibleLockClasses = [
        "modal-open",
        "menu-open",
        "sidebar-open",
        "is-modal-open"
      ];

      for (const className of possibleLockClasses) {
        const modals = document.querySelectorAll(
          `.modal:not([hidden])`
        );

        const hasVisibleModal = Array.from(modals).some(
          isElementVisible
        );

        if (!hasVisibleModal) {
          document.body.classList.remove(className);
        }
      }
    } catch {
      // Защитный код не должен создавать новую ошибку.
    }
  }

  function restoreBasicInterface() {
    if (state.recovering) {
      return;
    }

    state.recovering = true;

    try {
      const authModal = safeGet("authModal");
      const settingsModal = safeGet("settingsModal");
      const profileModal = safeGet("profileModal");

      closeStuckModal("authModal");
      closeStuckModal("settingsModal");
      closeStuckModal("profileModal");

      /*
       * Если authModal существует, но он находится в странном
       * промежуточном состоянии, не удаляем его и не пересоздаём.
       */
      if (authModal && !authModal.hidden) {
        const form = safeGet("authForm");

        if (form) {
          const error = safeGet("authError");

          /*
           * Не стираем введённые пользователем данные.
           * Только гарантируем, что ошибка формы не является
           * причиной блокировки интерфейса.
           */
          if (error && error.textContent === "") {
            error.hidden = true;
          }
        }
      }

      if (settingsModal && settingsModal.hidden) {
        settingsModal.removeAttribute("aria-hidden");
      }

      if (profileModal && profileModal.hidden) {
        profileModal.removeAttribute("aria-hidden");
      }

      normalizeBodyState();
    } catch {
      // Ничего. Error Guard никогда не должен падать сам.
    } finally {
      window.setTimeout(() => {
        state.recovering = false;
      }, CONFIG.recoveryDelayMs);
    }
  }

  function showGuardToast(message) {
    try {
      const toast = safeGet("toast");

      if (!toast) {
        return;
      }

      /*
       * Не показываем технические ошибки пользователю.
       * Только понятное уведомление.
       */
      toast.textContent = message;
      toast.hidden = false;

      if (state.toastTimer) {
        window.clearTimeout(state.toastTimer);
      }

      state.toastTimer = window.setTimeout(() => {
        try {
          toast.hidden = true;
        } catch {
          // Игнорируем.
        }
      }, CONFIG.toastDurationMs);
    } catch {
      // Ничего.
    }
  }

  function registerError(type, error) {
    const current = now();

    if (
      current - state.lastErrorTime >
      CONFIG.errorWindowMs
    ) {
      state.errorCount = 0;
    }

    state.lastErrorTime = current;
    state.errorCount += 1;

    if (originalConsoleError) {
      try {
        originalConsoleError(
          `[Нейро-чат Error Guard] ${type}:`,
          error
        );
      } catch {
        // Игнорируем ошибку console.error.
      }
    }

    /*
     * Если ошибок слишком много подряд, не выполняем
     * бесконечные попытки восстановления.
     */
    if (
      state.errorCount <= CONFIG.maxErrorsInWindow
    ) {
      if (state.recoveryTimer) {
        window.clearTimeout(state.recoveryTimer);
      }

      state.recoveryTimer = window.setTimeout(
        restoreBasicInterface,
        CONFIG.recoveryDelayMs
      );
    }
  }

  function installGlobalErrorHandler() {
    window.addEventListener(
      "error",
      (event) => {
        try {
          registerError(
            "JavaScript",
            event.error || event.message || "Unknown error"
          );
        } catch {
          // Никогда не выбрасываем ошибку наружу.
        }
      },
      true
    );

    window.addEventListener(
      "unhandledrejection",
      (event) => {
        try {
          registerError(
            "Promise",
            event.reason || "Unhandled promise rejection"
          );

          /*
           * Не даём необработанному Promise автоматически
           * разрушить остальной интерфейс.
           */
          if (
            event &&
            typeof event.preventDefault === "function"
          ) {
            event.preventDefault();
          }
        } catch {
          // Игнорируем.
        }
      }
    );
  }

  function installModalObserver() {
    if (
      typeof MutationObserver !== "function"
    ) {
      return;
    }

    try {
      const observer = new MutationObserver(
        (mutations) => {
          for (const mutation of mutations) {
            if (
              mutation.type !== "attributes" ||
              mutation.attributeName !== "hidden"
            ) {
              continue;
            }

            const target = mutation.target;

            if (
              target instanceof HTMLElement &&
              target.classList.contains("modal") &&
              !target.hidden
            ) {
              markModalOpening(target);
            }
          }
        }
      );

      observer.observe(document.documentElement, {
        subtree: true,
        attributes: true,
        attributeFilter: ["hidden"]
      });
    } catch (error) {
      registerError(
        "MutationObserver",
        error
      );
    }
  }

  function installNetworkGuard() {
    if (!originalFetch) {
      return;
    }

    window.fetch = async (...args) => {
      const controller =
        typeof AbortController === "function"
          ? new AbortController()
          : null;

      let timeoutId = null;

      try {
        const input = args[0];
        const init =
          args[1] && typeof args[1] === "object"
            ? { ...args[1] }
            : {};

        /*
         * Не перезаписываем пользовательский signal.
         */
        if (
          controller &&
          !init.signal
        ) {
          init.signal = controller.signal;
        }

        timeoutId = window.setTimeout(() => {
          if (controller) {
            try {
              controller.abort();
            } catch {
              // Игнорируем.
            }
          }
        }, CONFIG.networkTimeoutMs);

        const response = await originalFetch(
          input,
          init
        );

        if (!response.ok) {
          state.networkErrors += 1;

          /*
           * HTTP-ошибка не превращается автоматически
           * в исключение, чтобы не ломать существующий
           * script.js.
           */
          if (
            response.status === 401 ||
            response.status === 403
          ) {
            showGuardToast(
              "Сессия требует повторной авторизации."
            );
          } else if (
            response.status >= 500
          ) {
            showGuardToast(
              "Сервер временно недоступен."
            );
          }
        }

        return response;
      } catch (error) {
        state.networkErrors += 1;

        const isAbort =
          error &&
          typeof error === "object" &&
          error.name === "AbortError";

        if (isAbort) {
          showGuardToast(
            "Запрос выполняется слишком долго."
          );
        }

        registerError(
          "Сетевой запрос",
          error
        );

        /*
         * ВАЖНО:
         * Возвращаем ошибку дальше в script.js.
         * Error Guard не подменяет API-ответы.
         */
        throw error;
      } finally {
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
        }
      }
    };
  }

  function installFormProtection() {
    document.addEventListener(
      "submit",
      (event) => {
        try {
          const form = event.target;

          if (
            !(form instanceof HTMLFormElement)
          ) {
            return;
          }

          /*
           * Не отменяем submit.
           * Только предотвращаем очевидный двойной клик
           * в течение очень короткого промежутка.
           */
          if (
            form.dataset.guardSubmitting === "true"
          ) {
            const elapsed =
              now() -
              Number(
                form.dataset.guardSubmitTime || 0
              );

            if (
              elapsed >= 0 &&
              elapsed < 700
            ) {
              event.preventDefault();
              return;
            }
          }

          form.dataset.guardSubmitting = "true";
          form.dataset.guardSubmitTime =
            String(now());

          window.setTimeout(() => {
            try {
              delete form.dataset.guardSubmitting;
              delete form.dataset.guardSubmitTime;
            } catch {
              // Игнорируем.
            }
          }, 700);
        } catch (error) {
          registerError(
            "Form protection",
            error
          );
        }
      },
      true
    );
  }

  function installVisibilityRecovery() {
    document.addEventListener(
      "visibilitychange",
      () => {
        if (
          document.visibilityState !== "visible"
        ) {
          return;
        }

        window.setTimeout(
          restoreBasicInterface,
          CONFIG.recoveryDelayMs
        );
      }
    );
  }

  function startHealthCheck() {
    /*
     * Лёгкая периодическая проверка.
     * Не трогает структуру DOM.
     */
    window.setInterval(() => {
      try {
        const app = safeGet("app");

        if (!app) {
          return;
        }

        closeStuckModal("authModal");
        closeStuckModal("settingsModal");
        closeStuckModal("profileModal");

        normalizeBodyState();
      } catch (error) {
        registerError(
          "Health check",
          error
        );
      }
    }, 30000);
  }

  function exposeDiagnostics() {
    /*
     * Диагностика доступна только разработчику.
     * Никаких ключей, паролей или содержимого сообщений
     * сюда не записываем.
     */
    try {
      window.NeuroChatErrorGuard = {
        version: GUARD_VERSION,

        getStatus() {
          return {
            initialized: state.initialized,
            errorCount: state.errorCount,
            networkErrors: state.networkErrors,
            recovering: state.recovering
          };
        },

        recover() {
          restoreBasicInterface();
        }
      };
    } catch {
      // Игнорируем.
    }
  }

  function init() {
    if (state.initialized) {
      return;
    }

    state.initialized = true;

    try {
      installGlobalErrorHandler();
      installModalObserver();
      installNetworkGuard();
      installFormProtection();
      installVisibilityRecovery();
      exposeDiagnostics();
      startHealthCheck();

      if (
        document.readyState === "loading"
      ) {
        document.addEventListener(
          "DOMContentLoaded",
          () => {
            window.setTimeout(
              restoreBasicInterface,
              CONFIG.recoveryDelayMs
            );
          },
          { once: true }
        );
      } else {
        window.setTimeout(
          restoreBasicInterface,
          CONFIG.recoveryDelayMs
        );
      }
    } catch (error) {
      /*
       * Даже если часть Error Guard не смогла
       * инициализироваться, сам сайт продолжает работать.
       */
      if (originalConsoleError) {
        originalConsoleError(
          "[Нейро-чат Error Guard] Initialization error:",
          error
        );
      }
    }
  }

  init();
})();