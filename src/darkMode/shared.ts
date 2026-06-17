export const DARK_MODE_CHANGED_TOPIC = "dark-mode-changed";
export const DARK_MODE_UPDATED_TOPIC = "dark-mode-updated";

export const parseDarkModePayload = (
  payload: string | undefined,
): boolean | null => {
  if (!payload) {
    return null;
  }

  try {
    const value = JSON.parse(payload);
    if (Array.isArray(value) && typeof value[0] === "boolean") {
      return value[0];
    }
  } catch (error) {
    console.error("Failed to parse dark mode event payload:", error);
  }

  return null;
};
