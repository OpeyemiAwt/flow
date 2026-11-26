"use client";

import {
  type CSSProperties,
  type InputHTMLAttributes,
  type Ref,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

const NON_OVERLAY_TYPES = new Set([
  "password",
  "checkbox",
  "radio",
  "file",
  "hidden",
  "date",
  "datetime-local",
  "time",
  "month",
  "week",
  "color",
  "range",
  "number",
  "submit",
  "button",
  "reset",
]);

interface CharEntry {
  readonly id: number;
  readonly char: string;
  readonly animate: boolean;
  readonly delayMs: number;
}

interface DiffState {
  readonly text: string;
  readonly entries: readonly CharEntry[];
  readonly nextId: number;
}

function buildInitialState(text: string): DiffState {
  const chars = Array.from(text);
  return {
    text,
    entries: chars.map((char, index) => ({
      id: index + 1,
      char,
      animate: false,
      delayMs: 0,
    })),
    nextId: chars.length + 1,
  };
}

function computeNextDiffState(
  prev: DiffState,
  nextText: string,
  staggerMs: number,
  maxDelayMs: number,
): DiffState {
  const prevEntries = prev.entries;
  const nextChars = Array.from(nextText);

  let prefix = 0;
  const minLen = Math.min(prevEntries.length, nextChars.length);
  while (prefix < minLen && prevEntries[prefix]!.char === nextChars[prefix]) {
    prefix++;
  }

  let suffix = 0;
  while (
    suffix < minLen - prefix &&
    prevEntries[prevEntries.length - 1 - suffix]!.char ===
      nextChars[nextChars.length - 1 - suffix]
  ) {
    suffix++;
  }

  let nextId = prev.nextId;
  const result: CharEntry[] = [];

  for (let i = 0; i < prefix; i++) {
    result.push(prevEntries[i]!);
  }

  const insertedEnd = nextChars.length - suffix;
  for (let i = prefix; i < insertedEnd; i++) {
    result.push({
      id: nextId++,
      char: nextChars[i]!,
      animate: true,
      delayMs: Math.min((i - prefix) * staggerMs, maxDelayMs),
    });
  }

  for (let i = prevEntries.length - suffix; i < prevEntries.length; i++) {
    result.push(prevEntries[i]!);
  }

  return {
    text: nextText,
    entries: result,
    nextId,
  };
}

function deriveWrapperLayoutClasses(
  inputClassName: string,
  explicitWrapperClassName?: string,
  isHero = false,
): string {
  if (explicitWrapperClassName) {
    return `relative inline-grid align-middle ${explicitWrapperClassName}`;
  }
  const tokens = inputClassName.split(/\s+/).filter(Boolean);
  const picked: string[] = ["relative", "inline-grid", "align-middle"];
  let hasFlex1 = false;
  let hasWidth = false;
  for (const token of tokens) {
    if (token === "w-full") {
      picked.push("w-full");
      hasWidth = true;
    } else if (token === "flex-1") {
      picked.push("flex-1", "min-w-0");
      hasFlex1 = true;
    } else if (token === "min-w-0") {
      picked.push("min-w-0");
    } else if (
      token.startsWith("max-w-") ||
      token.startsWith("sm:max-w-") ||
      token.startsWith("md:max-w-") ||
      token.startsWith("lg:max-w-")
    ) {
      picked.push(token);
    }
  }
  if (!isHero && !hasFlex1 && !hasWidth) {
    picked.push("w-full");
  }
  return Array.from(new Set(picked)).join(" ");
}

function stripContainerSizingClasses(inputClassName: string): string {
  return inputClassName
    .split(/\s+/)
    .filter(
      (token) =>
        Boolean(token) &&
        token !== "flex-1" &&
        !token.startsWith("max-w-") &&
        !token.startsWith("sm:max-w-") &&
        !token.startsWith("md:max-w-") &&
        !token.startsWith("lg:max-w-"),
    )
    .join(" ");
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (!ref) return;
  if (typeof ref === "function") {
    ref(value);
  } else {
    (ref as { current: T | null }).current = value;
  }
}

export interface TypewriterInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "ref"> {
  readonly ref?: Ref<HTMLInputElement>;
  readonly variant?: "field" | "hero";
  readonly wrapperClassName?: string;
  readonly wrapperStyle?: CSSProperties;
}

export function TypewriterInput({
  ref,
  variant = "field",
  wrapperClassName,
  wrapperStyle,
  className = "",
  style,
  type = "text",
  value,
  defaultValue,
  onChange,
  onInput,
  onScroll,
  onKeyUp,
  onClick,
  onSelect,
  onFocus,
  onCompositionStart,
  onCompositionEnd,
  ...rest
}: TypewriterInputProps) {
  const internalInputRef = useRef<HTMLInputElement | null>(null);
  const mirrorRef = useRef<HTMLSpanElement | null>(null);

  const isControlled = value !== undefined;
  const [uncontrolledValue, setUncontrolledValue] = useState<string>(() =>
    defaultValue !== undefined && defaultValue !== null
      ? String(defaultValue)
      : "",
  );
  const [isComposing, setIsComposing] = useState(false);

  const strValue = isControlled
    ? value === null
      ? ""
      : String(value)
    : uncontrolledValue;

  const isHero = variant === "hero";
  const staggerMs = isHero ? 26 : 14;
  const maxDelayMs = isHero ? 160 : 140;

  const [diffState, setDiffState] = useState<DiffState>(() =>
    buildInitialState(strValue),
  );

  if (diffState.text !== strValue) {
    setDiffState(
      computeNextDiffState(diffState, strValue, staggerMs, maxDelayMs),
    );
  }

  const syncScroll = useCallback(() => {
    const syncNow = () => {
      if (mirrorRef.current && internalInputRef.current) {
        mirrorRef.current.scrollLeft = internalInputRef.current.scrollLeft;
      }
    };
    syncNow();
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(syncNow);
    }
  }, []);

  useIsomorphicLayoutEffect(() => {
    syncScroll();
  }, [strValue, syncScroll]);

  const setMergedRef = useCallback(
    (node: HTMLInputElement | null) => {
      internalInputRef.current = node;
      assignRef(ref, node);
    },
    [ref],
  );

  const overlaySupported = !NON_OVERLAY_TYPES.has(type.toLowerCase());

  if (!overlaySupported) {
    return (
      <input
        ref={setMergedRef}
        type={type}
        value={value}
        defaultValue={defaultValue}
        className={className}
        style={style}
        onChange={onChange}
        onInput={onInput}
        onScroll={onScroll}
        onKeyUp={onKeyUp}
        onClick={onClick}
        onSelect={onSelect}
        onFocus={onFocus}
        onCompositionStart={onCompositionStart}
        onCompositionEnd={onCompositionEnd}
        {...rest}
      />
    );
  }

  const showOverlay = strValue.length > 0 && !isComposing;
  const computedWrapperClass = deriveWrapperLayoutClasses(
    className,
    wrapperClassName,
    isHero,
  );
  const innerClassName = stripContainerSizingClasses(className);
  const isCentered = innerClassName.split(/\s+/).includes("text-center");
  const charAnimClass = isHero
    ? "flow-type-char-hero"
    : "flow-type-char-field";

  const inputStyle: CSSProperties = {
    ...style,
    ...(showOverlay
      ? {
          color: "transparent",
          WebkitTextFillColor: "transparent",
        }
      : {}),
  };

  const mirrorStyle: CSSProperties = {
    ...style,
    backgroundColor: "transparent",
    borderColor: "transparent",
    boxShadow: "none",
    outline: "none",
  };

  return (
    <span className={computedWrapperClass} style={wrapperStyle}>
      {/* Intrinsic width sizer for hero inputs — measures in the EXACT hero font size */}
      {isHero && (
        <span
          aria-hidden="true"
          className={`${innerClassName} col-start-1 row-start-1 invisible pointer-events-none select-none whitespace-pre min-w-[1.6ch]`}
          style={mirrorStyle}
        >
          {strValue || rest.placeholder || "0"}
        </span>
      )}

      <input
        ref={setMergedRef}
        type={type}
        value={value}
        defaultValue={defaultValue}
        className={`${innerClassName} col-start-1 row-start-1 w-full min-w-0`}
        style={inputStyle}
        onChange={(event) => {
          if (!isControlled) {
            setUncontrolledValue(event.target.value);
          }
          onChange?.(event);
          syncScroll();
        }}
        onInput={(event) => {
          onInput?.(event);
          syncScroll();
        }}
        onScroll={(event) => {
          onScroll?.(event);
          syncScroll();
        }}
        onKeyUp={(event) => {
          onKeyUp?.(event);
          syncScroll();
        }}
        onClick={(event) => {
          onClick?.(event);
          syncScroll();
        }}
        onSelect={(event) => {
          onSelect?.(event);
          syncScroll();
        }}
        onFocus={(event) => {
          onFocus?.(event);
          syncScroll();
        }}
        onCompositionStart={(event) => {
          setIsComposing(true);
          onCompositionStart?.(event);
        }}
        onCompositionEnd={(event) => {
          setIsComposing(false);
          onCompositionEnd?.(event);
          syncScroll();
        }}
        {...rest}
      />

      {showOverlay && (
        <span
          ref={mirrorRef}
          aria-hidden="true"
          className={`${innerClassName} col-start-1 row-start-1 flex items-center ${
            isCentered ? "justify-center" : "justify-start"
          } w-full min-w-0 pointer-events-none select-none overflow-hidden whitespace-pre ${
            rest.disabled ? "opacity-50" : ""
          }`}
          style={mirrorStyle}
        >
          {diffState.entries.map((entry) => (
            <span
              key={entry.id}
              className={
                entry.animate ? charAnimClass : "inline-block whitespace-pre"
              }
              style={
                entry.animate && entry.delayMs > 0
                  ? { animationDelay: `${entry.delayMs}ms` }
                  : undefined
              }
            >
              {entry.char}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
