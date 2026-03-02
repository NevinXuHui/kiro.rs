const TEST_MODEL_KEY = "kiro-admin-test-model";
const AUTO_TEST_ON_STARTUP_KEY = "kiro-admin-auto-test-startup";

export function getTestModel(): string {
  return localStorage.getItem(TEST_MODEL_KEY) || "claude-sonnet-4-20250514";
}

export function setTestModel(model: string): void {
  localStorage.setItem(TEST_MODEL_KEY, model);
}

export function getAutoTestOnStartup(): boolean {
  const value = localStorage.getItem(AUTO_TEST_ON_STARTUP_KEY);
  return value === null ? true : value === "true"; // 默认启用
}

export function setAutoTestOnStartup(enabled: boolean): void {
  localStorage.setItem(AUTO_TEST_ON_STARTUP_KEY, String(enabled));
}
