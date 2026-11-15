"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  applyLocale,
  LOCALE_CHANGE_EVENT,
  LOCALE_META,
  MESSAGES,
  readStoredLocale,
  type FlowLocale,
  type FlowTranslations,
} from "../lib/i18n.ts";
import { PHRASE_DICT } from "../lib/i18n-phrases.ts";

interface LanguageContextValue {
  locale: FlowLocale;
  dir: "ltr" | "rtl";
  setLocale: (next: FlowLocale) => void;
  t: FlowTranslations;
}

const LanguageContext = createContext<LanguageContextValue>({
  locale: "en",
  dir: "ltr",
  setLocale: () => {},
  t: MESSAGES.en,
});

const SKIP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "SVG",
  "CODE",
  "PRE",
  "TEXTAREA",
  "INPUT",
]);

const originalTextMap = new WeakMap<Text, string>();
const originalAttrMap = new WeakMap<
  Element,
  { placeholder?: string; ariaLabel?: string }
>();

function shouldSkipText(trimmed: string): boolean {
  if (!trimmed || trimmed.length < 2) return true;
  if (!/[A-Za-z]/.test(trimmed)) return true;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return true;
  if (trimmed.startsWith("0x") && trimmed.length >= 10) return true;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return true;
  if (/^[A-Z0-9._-]{2,10}$/.test(trimmed)) return true;
  return false;
}

function lookupPhrase(
  dict: Record<string, string>,
  trimmed: string,
): string | undefined {
  if (dict[trimmed]) return dict[trimmed];
  if (trimmed.endsWith(":")) {
    const base = trimmed.slice(0, -1).trim();
    if (dict[base]) return `${dict[base]}:`;
  }
  return undefined;
}

function shouldSkipElement(el: Element | null): boolean {
  let cur: Element | null = el;
  while (cur) {
    if (SKIP_TAGS.has(cur.tagName)) return true;
    if (cur.hasAttribute("data-no-translate")) return true;
    if ((cur as HTMLElement).isContentEditable) return true;
    cur = cur.parentElement;
  }
  return false;
}

function translateElementAttributes(
  el: Element,
  locale: FlowLocale,
  dict: Record<string, string> | null,
) {
  if (el.hasAttribute("data-no-translate")) return;
  const tag = el.tagName;
  if (tag === "SCRIPT" || tag === "STYLE" || tag === "SVG") return;

  const placeholder = el.getAttribute("placeholder");
  const ariaLabel = el.getAttribute("aria-label");
  if (placeholder === null && ariaLabel === null) return;

  let saved = originalAttrMap.get(el);
  if (!saved) {
    saved = {};
    if (placeholder !== null) saved.placeholder = placeholder;
    if (ariaLabel !== null) saved.ariaLabel = ariaLabel;
    originalAttrMap.set(el, saved);
  }

  if (locale === "en" || !dict) {
    if (saved.placeholder !== undefined && placeholder !== saved.placeholder) {
      el.setAttribute("placeholder", saved.placeholder);
    }
    if (saved.ariaLabel !== undefined && ariaLabel !== saved.ariaLabel) {
      el.setAttribute("aria-label", saved.ariaLabel);
    }
    return;
  }

  if (saved.placeholder !== undefined) {
    const nextPh = lookupPhrase(dict, saved.placeholder.trim());
    if (nextPh && placeholder !== nextPh) {
      el.setAttribute("placeholder", nextPh);
    }
  }
  if (saved.ariaLabel !== undefined) {
    const nextAria = lookupPhrase(dict, saved.ariaLabel.trim());
    if (nextAria && ariaLabel !== nextAria) {
      el.setAttribute("aria-label", nextAria);
    }
  }
}

function translateSubtree(root: Node, locale: FlowLocale) {
  const dict = locale === "en" ? null : PHRASE_DICT[locale];

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode() as Text | null;
  while (node) {
    const parent = node.parentElement;
    if (!shouldSkipElement(parent)) {
      const currentVal = node.nodeValue ?? "";
      const orig = originalTextMap.get(node) ?? currentVal;
      if (!originalTextMap.has(node)) {
        originalTextMap.set(node, orig);
      }

      if (locale === "en" || !dict) {
        if (currentVal !== orig) {
          node.nodeValue = orig;
        }
      } else {
        const match = orig.match(/^(\s*)([\s\S]*?)(\s*)$/);
        if (match) {
          const [, leading = "", core = "", trailing = ""] = match;
          const normalized = core.replace(/\s+/g, " ").trim();
          if (!shouldSkipText(normalized)) {
            const translated = lookupPhrase(dict, normalized);
            if (translated) {
              const nextVal = `${leading}${translated}${trailing}`;
              if (currentVal !== nextVal) {
                node.nodeValue = nextVal;
              }
            }
          }
        }
      }
    }
    node = walker.nextNode() as Text | null;
  }

  if (root instanceof Element) {
    translateElementAttributes(root, locale, dict);
    const allWithAttrs = root.querySelectorAll("[placeholder], [aria-label]");
    for (let i = 0; i < allWithAttrs.length; i += 1) {
      translateElementAttributes(allWithAttrs[i]!, locale, dict);
    }
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<FlowLocale>("en");
  const isApplyingRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const sync = () => {
      const next = readStoredLocale();
      setLocaleState(next);
      const meta = LOCALE_META[next];
      document.documentElement.lang = meta.code;
      document.documentElement.dir = meta.dir;
    };
    sync();
    window.addEventListener(LOCALE_CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(LOCALE_CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined" || !document.body) return;

    const runPass = () => {
      if (isApplyingRef.current) return;
      isApplyingRef.current = true;
      try {
        translateSubtree(document.body, locale);
      } finally {
        isApplyingRef.current = false;
      }
    };

    runPass();

    if (locale === "en") return;

    const observer = new MutationObserver(() => {
      if (isApplyingRef.current) return;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        runPass();
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      observer.disconnect();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [locale]);

  const setLocale = useCallback((next: FlowLocale) => {
    applyLocale(next);
    setLocaleState(next);
  }, []);

  const value = useMemo<LanguageContextValue>(
    () => ({
      locale,
      dir: LOCALE_META[locale].dir,
      setLocale,
      t: MESSAGES[locale],
    }),
    [locale, setLocale],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation(): LanguageContextValue {
  return useContext(LanguageContext);
}
