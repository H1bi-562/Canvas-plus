import { useDisplayConfig } from "../context/ThemeContext";

function ThemeToggleButton() {
  const { config, updateConfig } = useDisplayConfig();
  return (
    <button onClick={() => updateConfig({ theme: config.theme === "dark" ? "light" : "dark" })}>
      Switch to {config.theme === "dark" ? "light" : "dark"} mode
    </button>
  );
}

export default ThemeToggleButton;