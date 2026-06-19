import { useCallback, useEffect, useState } from "react";
import {
  DARK_MODE_CHANGED_TOPIC,
  DARK_MODE_UPDATED_TOPIC,
  parseDarkModePayload,
} from "./shared";
import { LATEST_DARK_MODE_EVENT_QUERY } from "../events/queries";

interface DarkModeEventRow {
  payload: string;
}

export const useDarkMode = (): {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
} => {
  const [isDarkMode, setIsDarkMode] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDarkMode);
  }, [isDarkMode]);

  useEffect(() => {
    let isMounted = true;

    window.electron.ipcRenderer
      .invoke("db-query", LATEST_DARK_MODE_EVENT_QUERY, [
        DARK_MODE_CHANGED_TOPIC,
      ])
      .then((rows: DarkModeEventRow[]) => {
        if (!isMounted || rows.length === 0) {
          return;
        }

        const darkMode = parseDarkModePayload(rows[0].payload);
        if (darkMode !== null) {
          setIsDarkMode(darkMode);
        }
      })
      .catch((error) => {
        console.error("Failed to load dark mode state:", error);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const handleDarkModeUpdate = (
      _event: unknown,
      newDarkMode: boolean,
    ): void => {
      setIsDarkMode(newDarkMode);
    };

    window.electron.ipcRenderer.on(
      DARK_MODE_UPDATED_TOPIC,
      handleDarkModeUpdate,
    );

    return () => {
      window.electron.ipcRenderer.removeListener(
        DARK_MODE_UPDATED_TOPIC,
        handleDarkModeUpdate,
      );
    };
  }, []);

  const toggleDarkMode = useCallback(() => {
    setIsDarkMode((currentDarkMode) => {
      const nextDarkMode = !currentDarkMode;
      window.electron.ipcRenderer.send(DARK_MODE_CHANGED_TOPIC, nextDarkMode);
      return nextDarkMode;
    });
  }, []);

  return { isDarkMode, toggleDarkMode };
};
