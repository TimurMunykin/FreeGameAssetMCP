const STORAGE_KEY = "sprite-sandbox-settings";

export interface Settings {
  openaiApiKey: string;
  model: string;
}

const DEFAULTS: Settings = {
  openaiApiKey: "",
  model: "gpt-5.4-nano",
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function initSettingsUI(): void {
  const btn = document.querySelector<HTMLButtonElement>("#settingsBtn")!;
  const modal = document.querySelector<HTMLDivElement>("#settingsModal")!;
  const closeBtn = document.querySelector<HTMLButtonElement>("#settingsClose")!;
  const saveBtn = document.querySelector<HTMLButtonElement>("#settingsSave")!;
  const apiKeyInput = document.querySelector<HTMLInputElement>("#settingApiKey")!;
  const modelSelect = document.querySelector<HTMLSelectElement>("#settingModel")!;

  function open() {
    const s = loadSettings();
    apiKeyInput.value = s.openaiApiKey;
    modelSelect.value = s.model;
    modal.classList.add("open");
  }

  function close() {
    modal.classList.remove("open");
  }

  btn.addEventListener("click", open);
  closeBtn.addEventListener("click", close);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });

  saveBtn.addEventListener("click", () => {
    saveSettings({
      openaiApiKey: apiKeyInput.value.trim(),
      model: modelSelect.value,
    });
    close();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("open")) close();
  });
}
