// Match KeyboardEvent against binding strings such as "Mod + Alt + V".

export interface ParsedChord {
  mod: boolean;
  alt: boolean;
  shift: boolean;
  ctrl: boolean; // explicit Ctrl (not Mod)
  key: string; // normalized: a-z, enter, backspace, delete, arrowleft, …
  /** Second key held with primary (e.g. K + J). */
  withKey?: string;
}

/** Shifted punctuation folded back to the key that is printed on the cap, so a binding
 *  written as "Shift + ," matches the "<" the browser reports. The chord's own Shift flag
 *  still has to agree, so folding can never make an unshifted binding fire with Shift. */
const UNSHIFT: Record<string, string> = {
  '<': ',', '>': '.', '?': '/', ':': ';', '"': "'", '{': '[', '}': ']',
  '|': '\\', '~': '`', '_': '-',
};

/** Physical key → the character on the cap (US/QWERTY reference layout). Used only as a
 *  fallback when `event.key` is not a plain binding key — macOS turns ⌥[ into “ and ⌥M
 *  into µ, which would otherwise make every Option binding in the FCP layout unreachable. */
const CODE_KEY: Record<string, string> = {
  Space: 'space', Enter: 'enter', NumpadEnter: 'enter', Tab: 'tab',
  Backspace: 'backspace', Delete: 'delete', Escape: 'escape',
  ArrowLeft: 'arrowleft', ArrowRight: 'arrowright', ArrowUp: 'arrowup', ArrowDown: 'arrowdown',
  Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'",
  BracketLeft: '[', BracketRight: ']', Backslash: '\\', Backquote: '`',
  Minus: '-', Equal: '=',
  NumpadAdd: '=', NumpadSubtract: '-',
};

/** True for a key a binding string can name directly (letters, digits, punctuation, named keys). */
function isPlainBindingKey(key: string): boolean {
  return /^[a-z0-9`\-=[\]\\;',./]$/.test(key)
    || ['space', 'enter', 'tab', 'backspace', 'delete', 'escape', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(key);
}

/** The cap character for a KeyboardEvent.code, or null when the code is unmapped. */
export function keyFromCode(code: string | undefined): string | null {
  if (!code) return null;
  if (CODE_KEY[code]) return CODE_KEY[code]!;
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^(Digit|Numpad)[0-9]$/.test(code)) return code.slice(-1);
  return null;
}

/** The key a chord should be matched against: `event.key`, falling back to the physical
 *  key when the character the OS produced is not something a binding can name. */
export function eventBindingKey(
  e: Pick<KeyboardEvent, 'key'> & { code?: string },
): string {
  const key = normalizeKey(e.key);
  if (isPlainBindingKey(key)) return key;
  return keyFromCode(e.code) ?? key;
}

export function normalizeKey(key: string): string {
  const k = key.length === 1 ? key.toLowerCase() : key.toLowerCase();
  if (UNSHIFT[k]) return UNSHIFT[k]!;
  if (k === ' ') return 'space';
  if (k === 'escape') return 'escape';
  if (k === 'backspace') return 'backspace';
  if (k === 'delete') return 'delete';
  if (k === 'enter') return 'enter';
  if (k === 'tab') return 'tab';
  if (k === '`' || k === 'backquote') return '`';
  if (k === '/' || k === 'slash') return '/';
  if (k === '=' || k === 'equal') return '=';
  if (k === '+' || k === 'add') return '+';
  if (k === '-' || k === 'subtract' || k === 'minus') return '-';
  if (k.startsWith('arrow')) return k; // arrowleft …
  return k;
}

function tokenToKey(tok: string): string {
  const t = tok.trim().toLowerCase();
  if (t === 'space') return 'space';
  if (t === '←' || t === 'left') return 'arrowleft';
  if (t === '→' || t === 'right') return 'arrowright';
  if (t === '↑' || t === 'up') return 'arrowup';
  if (t === '↓' || t === 'down') return 'arrowdown';
  if (t === 'backspace') return 'backspace';
  if (t === 'delete') return 'delete';
  if (t === 'enter') return 'enter';
  if (t === 'tab') return 'tab';
  if (t === 'mod' || t === 'cmd' || t === 'command' || t === 'meta' || t === 'ctrl' || t === 'control' || t === 'alt' || t === 'option' || t === 'shift') {
    return ''; // modifiers handled separately
  }
  return t;
}

/** Parse one chord like "Mod + Alt + V" or "K + J". */
export function parseChord(raw: string): ParsedChord | null {
  const parts = raw.split('+').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return null;
  let mod = false;
  let alt = false;
  let shift = false;
  let ctrl = false;
  const keys: string[] = [];
  for (const p of parts) {
    const low = p.toLowerCase();
    if (low === 'mod' || low === 'cmd' || low === 'command' || low === 'meta') mod = true;
    else if (low === 'ctrl' || low === 'control') ctrl = true;
    else if (low === 'alt' || low === 'option') alt = true;
    else if (low === 'shift') shift = true;
    else {
      const k = tokenToKey(p);
      if (k) keys.push(k);
    }
  }
  if (!keys.length) return null;
  if (keys.length === 1) return { mod, alt, shift, ctrl, key: keys[0]! };
  // K + J style
  return { mod, alt, shift, ctrl, key: keys[keys.length - 1]!, withKey: keys[0] };
}

/** Split "A / B / C" into alternative chords. */
export function parseBindingAlts(keys: string): ParsedChord[] {
  if (!keys.trim()) return [];
  return keys
    .split('/')
    .map((s) => parseChord(s.trim()))
    .filter((c): c is ParsedChord => !!c);
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false;
  const el = target as { tagName?: string; isContentEditable?: boolean; closest?: (s: string) => unknown };
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  try {
    return !!el.closest?.('[contenteditable="true"]');
  } catch {
    return false;
  }
}

export interface MatchContext {
  /** Currently held non-modifier keys (lowercase normalized). */
  held: ReadonlySet<string>;
  isMac?: boolean;
  /** Preserve the browser's native Copy command when visible text is selected. */
  hasTextSelection?: boolean;
}

/**
 * Return matching action id for this keydown, preferring longer/more-modified chords.
 * `catalog` items need { id, keys, disabledWhenTyping? }.
 */
export function matchShortcut(
  e: KeyboardEvent,
  catalog: { id: string; keys: string; disabledWhenTyping?: boolean }[],
  ctx: MatchContext,
): string | null {
  if (e.repeat) {
    // allow repeat only for seek/nudge — caller can filter; we still match
  }
  const key = normalizeKey(e.key);
  if (['shift', 'control', 'alt', 'meta'].includes(key)) return null;
  // Match on the reported character *or* the physical key: on macOS ⌥[ arrives as “ and
  // ⇧, as <, neither of which a binding string can name.
  const codeKey = keyFromCode((e as KeyboardEvent & { code?: string }).code);

  const typing = isTypingTarget(e.target);
  const isMac = ctx.isMac ?? (typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform));

  type Cand = { id: string; score: number };
  const cands: Cand[] = [];

  for (const action of catalog) {
    if (action.id === 'copy' && ctx.hasTextSelection) continue;
    if ((action.disabledWhenTyping !== false) && typing) continue;
    const alts = parseBindingAlts(action.keys);
    for (const chord of alts) {
      if (chord.key !== key && chord.key !== codeKey) continue;
      // Mod = meta on Mac, ctrl on Windows
      const wantMod = chord.mod;
      const hasMod = isMac ? e.metaKey : e.ctrlKey;
      if (wantMod !== hasMod) continue;
      // explicit Ctrl (rare) — on Mac must be ctrlKey; on Win same as mod if only ctrl
      if (chord.ctrl) {
        if (!e.ctrlKey) continue;
        // if also mod and mac, both meta and ctrl unusual — require ctrl
      } else if (!wantMod && e.ctrlKey && !isMac) {
        // bare key shouldn't fire with ctrl held unless chord wants mod
        // (already handled by wantMod)
      }
      // when not wanting mod, reject accidental cmd/ctrl
      if (!wantMod && !chord.ctrl) {
        if (isMac && e.metaKey) continue;
        if (!isMac && e.ctrlKey) continue;
      }
      if (chord.alt !== e.altKey) continue;
      if (chord.shift !== e.shiftKey) continue;
      if (chord.withKey) {
        const need = normalizeKey(chord.withKey);
        if (!ctx.held.has(need) && need !== key) continue;
      }
      // score: more modifiers + combo wins
      let score = 0;
      if (wantMod) score += 4;
      if (chord.alt) score += 2;
      if (chord.shift) score += 2;
      if (chord.ctrl) score += 3;
      if (chord.withKey) score += 5;
      cands.push({ id: action.id, score });
    }
  }

  if (!cands.length) return null;
  cands.sort((a, b) => b.score - a.score);
  return cands[0]!.id;
}

export { isTypingTarget };
