"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { GLOSSARY, type GlossaryId, glossaryById } from "@/lib/match/glossary";
import { isNewYorkGeofencePoint, newYorkGeofenceFromEnv } from "@/lib/match/newYorkGeofence";

type GlossaryCtx = {
  openId: string | null;
  setOpen: (id: string | null, anchor?: DOMRect) => void;
  inNewYork: boolean;
};

const Ctx = createContext<GlossaryCtx | null>(null);

function placeSheet(anchor: DOMRect | null, sheetH: number) {
  const pad = 12;
  const width = Math.min(340, window.innerWidth - pad * 2);
  const maxTop = Math.max(pad, window.innerHeight - sheetH - pad);
  const wide = window.innerWidth >= 1024;
  if (wide) {
    const left = Math.min(16 + 384 + 12, window.innerWidth - width - pad);
    const top = Math.min(Math.max(56, anchor?.top ?? 56), maxTop);
    return { top, left, width };
  }
  return {
    top: Math.min(56, maxTop),
    left: pad,
    width: window.innerWidth - pad * 2,
  };
}

function GlossarySheet({
  id,
  inNewYork,
  anchor,
  onClose,
}: {
  id: GlossaryId;
  inNewYork: boolean;
  anchor: DOMRect | null;
  onClose: () => void;
}) {
  const entry = glossaryById(id);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState(() => placeSheet(anchor, 280));
  const showNy = id === "watershed" && inNewYork && Boolean(entry.nyParagraphs?.length);

  useLayoutEffect(() => {
    const h = sheetRef.current?.offsetHeight ?? 280;
    setBox(placeSheet(anchor, h));
  }, [anchor, id, showNy]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onPointer = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (sheetRef.current?.contains(t)) return;
      if (t.closest("[data-glossary-term]")) return;
      onClose();
    };
    const onScroll = (e: Event) => {
      if (sheetRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [onClose]);

  return (
    <div
      ref={sheetRef}
      role="tooltip"
      style={{ top: box.top, left: box.left, width: box.width }}
      className="match-glossary"
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium">{entry.term}</p>
        <button type="button" onClick={onClose} className="text-[12px] text-[var(--quiet)]">
          Close
        </button>
      </div>
      {entry.paragraphs.map((p, i) => (
        <p key={p} className={`text-[13px] leading-[1.55] ${i > 0 ? "mt-2.5" : ""}`}>
          {p}
        </p>
      ))}
      {showNy &&
        entry.nyParagraphs?.map((p) => (
          <p key={p} className="mt-3 border-t border-[#14212B]/20 pt-3 text-[13px] leading-[1.55]">
            {p}
          </p>
        ))}
    </div>
  );
}

export function GlossaryProvider({
  children,
  newYorkLesson = false,
}: {
  children: React.ReactNode;
  /** True when the selected metro is New York, or the device is in the geofence. */
  newYorkLesson?: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [inNewYork, setInNewYork] = useState(newYorkLesson);

  useEffect(() => {
    if (newYorkLesson || newYorkGeofenceFromEnv()) {
      setInNewYork(true);
      return;
    }
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (isNewYorkGeofencePoint(pos.coords.longitude, pos.coords.latitude)) {
          setInNewYork(true);
        }
      },
      () => undefined,
      { maximumAge: 300000, timeout: 4000, enableHighAccuracy: false }
    );
  }, [newYorkLesson]);

  const setOpen = useCallback((id: string | null, nextAnchor?: DOMRect) => {
    setOpenId(id);
    setAnchor(id ? (nextAnchor ?? null) : null);
  }, []);

  return (
    <Ctx.Provider value={{ openId, setOpen, inNewYork }}>
      {children}
      {openId && (
        <GlossarySheet
          id={openId as GlossaryId}
          inNewYork={inNewYork}
          anchor={anchor}
          onClose={() => setOpen(null)}
        />
      )}
    </Ctx.Provider>
  );
}

function useGlossary() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("GlossaryTerm needs GlossaryProvider");
  return ctx;
}

export function GlossaryTerm({
  id,
  children,
  hover = true,
}: {
  id: GlossaryId;
  children?: React.ReactNode;
  hover?: boolean;
}) {
  const entry = glossaryById(id);
  const tipId = useId();
  const btnRef = useRef<HTMLButtonElement>(null);
  const { openId, setOpen } = useGlossary();
  const open = openId === id;

  const openAt = () => {
    setOpen(open ? null : id, btnRef.current?.getBoundingClientRect());
  };

  return (
    <span className="relative inline">
      <button
        ref={btnRef}
        type="button"
        className="rounded-sm text-inherit underline decoration-dotted decoration-[#14607A] underline-offset-[5px]"
        data-glossary-term=""
        aria-expanded={open}
        aria-describedby={open ? tipId : undefined}
        onClick={(e) => {
          e.stopPropagation();
          openAt();
        }}
        onMouseEnter={() => {
          if (!hover) return;
          setOpen(id, btnRef.current?.getBoundingClientRect());
        }}
      >
        {children ?? entry.term}
      </button>
    </span>
  );
}

export function GlossaryRow() {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-[var(--quiet)]">
      {GLOSSARY.map((entry) => (
        <GlossaryTerm key={entry.id} id={entry.id} hover={false} />
      ))}
    </div>
  );
}
