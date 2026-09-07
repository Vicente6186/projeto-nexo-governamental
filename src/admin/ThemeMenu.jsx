import React, {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Check, ChevronDown, Monitor, Moon, Sun } from "lucide-react";
import { themeStore } from "./theme.cjs";

const ThemeContext = createContext(null);
const choices = [
  {
    value: "light",
    label: "Claro",
    description: "Uma aparência leve e luminosa",
    Icon: Sun,
  },
  {
    value: "dark",
    label: "Escuro",
    description: "Mais conforto em pouca luz",
    Icon: Moon,
  },
  {
    value: "system",
    label: "Sistema",
    description: "Acompanha seu dispositivo",
    Icon: Monitor,
  },
];

export function ThemeProvider({ children }) {
  const snapshot = useSyncExternalStore(
    themeStore.subscribe,
    themeStore.getSnapshot,
    themeStore.getSnapshot,
  );
  const value = useMemo(
    () => ({ ...snapshot, setPreference: themeStore.setPreference }),
    [snapshot],
  );
  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const theme = useContext(ThemeContext);
  if (!theme)
    throw new Error("useTheme precisa estar dentro de ThemeProvider.");
  return theme;
}

export default function ThemeMenu({ className = "" }) {
  const { preference, setPreference } = useTheme();
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const optionRefs = useRef([]);
  const initialFocusRef = useRef(null);
  const menuId = useId();
  const triggerId = useId();
  const current = choices.find((choice) => choice.value === preference);
  const CurrentIcon = current.Icon;

  function close(restoreFocus = false) {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }

  useLayoutEffect(() => {
    if (!open) return;
    const selected = choices.findIndex((choice) => choice.value === preference);
    optionRefs.current[initialFocusRef.current ?? selected]?.focus();
    initialFocusRef.current = null;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleOutside(event) {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", handleOutside);
    document.addEventListener("focusin", handleOutside);
    return () => {
      document.removeEventListener("pointerdown", handleOutside);
      document.removeEventListener("focusin", handleOutside);
    };
  }, [open]);

  function handleMenuKey(event) {
    const currentIndex = optionRefs.current.indexOf(document.activeElement);
    let next;
    if (event.key === "ArrowDown") next = (currentIndex + 1) % choices.length;
    else if (event.key === "ArrowUp")
      next = (currentIndex + choices.length - 1) % choices.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = choices.length - 1;
    else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    } else if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      next = choices.findIndex((choice) =>
        choice.label
          .toLocaleLowerCase("pt-BR")
          .startsWith(event.key.toLocaleLowerCase("pt-BR")),
      );
      if (next < 0) return;
    }
    if (next === undefined) return;
    event.preventDefault();
    optionRefs.current[next]?.focus();
  }

  return (
    <div className={`theme-menu ${className}`.trim()} ref={containerRef}>
      <button
        type="button"
        className="theme-trigger"
        ref={triggerRef}
        id={triggerId}
        aria-label={`Aparência: ${current.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title="Alterar aparência"
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            initialFocusRef.current =
              event.key === "ArrowDown" ? 0 : choices.length - 1;
            setOpen(true);
          } else if (event.key === "Escape" && open) {
            event.preventDefault();
            close(true);
          }
        }}
      >
        <CurrentIcon size={17} aria-hidden="true" />
        <span className="theme-label">{current.label}</span>
        <ChevronDown className="theme-chevron" size={13} aria-hidden="true" />
      </button>
      {open && (
        <div
          className="theme-popover"
          id={menuId}
          role="menu"
          aria-label="Aparência"
          onKeyDown={handleMenuKey}
        >
          {choices.map(({ value, label, description, Icon }, index) => (
            <button
              key={value}
              type="button"
              className="theme-option"
              role="menuitemradio"
              aria-checked={preference === value}
              aria-label={label}
              tabIndex={-1}
              ref={(element) => {
                optionRefs.current[index] = element;
              }}
              onClick={() => {
                setPreference(value);
                close(true);
              }}
            >
              <Icon size={18} aria-hidden="true" />
              <span className="theme-option-copy">
                <strong>{label}</strong>
                <span>{description}</span>
              </span>
              {preference === value && (
                <Check
                  className="theme-option-check"
                  size={16}
                  aria-hidden="true"
                />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
