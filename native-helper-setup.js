(function () {
  const extensionApi = typeof browser !== "undefined" ? browser : chrome;
  const statusEl = document.querySelector("#nativeHelperStatus");
  const verifyBtn = document.querySelector("#verifyNativeHelper");
  const optionsBtn = document.querySelector("#openMainOptions");
  const manualHintEl = document.querySelector("#nativeHelperManualHint");
  const isWindows =
    typeof navigator !== "undefined"
    && navigator.platform
    && String(navigator.platform).toLowerCase().includes("win");

  function setStatus(message, isError) {
    if (!statusEl) return;
    statusEl.textContent = message || "";
    statusEl.classList.toggle("error", !!isError);
  }

  function setManualHint(message, isError) {
    if (!manualHintEl) return;
    manualHintEl.textContent = message || "";
    manualHintEl.classList.toggle("error", !!isError);
  }

  function sendRuntimeMessage(message) {
    return new Promise((resolve) => {
      try {
        const maybePromise = extensionApi.runtime.sendMessage(message, (response) => {
          const runtimeErr = extensionApi.runtime && extensionApi.runtime.lastError;
          if (runtimeErr) {
            resolve(null);
            return;
          }
          resolve(response || null);
        });
        if (maybePromise && typeof maybePromise.then === "function") {
          maybePromise.then((value) => resolve(value || null)).catch(() => resolve(null));
        }
      } catch (err) {
        resolve(null);
      }
    });
  }

  async function verifyHelper() {
    if (!isWindows) {
      setStatus("This setup page is only needed on Windows.", false);
      setManualHint("Native F6 helper is only available on Windows.", true);
      return;
    }

    setStatus("Checking native helper...", false);
    const result = await sendRuntimeMessage({
      type: "check-native-focus-helper-status",
      timeoutMs: 1200,
    });

    if (result && result.ok) {
      setStatus(
        "Native helper connected. Local Pocket can now send a real F6 on Windows.",
        false,
      );
      setManualHint(
        "Helper already detected. Keep 'Use native F6 helper (Windows)' enabled in options.",
        false,
      );
      return;
    }

    const error = result && result.error ? ` (${result.error})` : "";
    setStatus(
      `Native helper not connected yet${error}. Install it separately in Windows, then click Verify helper again.`,
      true,
    );
    setManualHint(
      "This AMO build only checks and uses a helper that was installed outside the addon.",
      false,
    );
  }

  function openOptionsPage() {
    try {
      window.location.href = "options.html";
    } catch (err) {
      window.open("options.html", "_self");
    }
  }

  if (verifyBtn) {
    verifyBtn.addEventListener("click", () => {
      verifyHelper().catch(() => {
        setStatus("Failed to verify helper.", true);
      });
    });
  }

  if (optionsBtn) {
    optionsBtn.addEventListener("click", openOptionsPage);
  }

  verifyHelper().catch(() => {
    setStatus("Could not check helper status yet.", true);
  });
})();
