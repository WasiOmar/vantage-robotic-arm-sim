import type { ArmCommand } from '../../types/commands';

export interface ParseError {
  ok: false;
  reason: string;
  raw: string;
  /** Optional suggestion shown to the operator ("Try: press key 3"). */
  hint?: string;
}

export interface SequenceParse {
  commands: ArmCommand[];
  error: ParseError | null;
}

const DEG = Math.PI / 180;
const DEFAULT_JOINT_STEP_DEG = 10;
const DEFAULT_CARTESIAN_STEP_M = 0.02;

const SMALL_NUMBERS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const ORDINALS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6,
  '1st': 1, '2nd': 2, '3rd': 3, '4th': 4, '5th': 5, '6th': 6,
};

// Named joints → joint numbers (URDF joint_1..joint_6).
const NAMED_JOINTS: [RegExp, string][] = [
  [/\bwrist (?:roll|one|1)\b|\bforearm\b/g, 'joint 4'],
  [/\bwrist (?:pitch|two|2)\b/g, 'joint 5'],
  [/\bwrist (?:yaw|three|3)\b|\b(?:tool|flange|gripper) (?:roll|rotation)\b/g, 'joint 6'],
  [/\bwrist\b/g, 'joint 5'],
  [/\b(?:base|waist)\b/g, 'joint 1'],
  [/\bshoulder\b/g, 'joint 2'],
  [/\belbow\b/g, 'joint 3'],
];

const POSITIVE_DIRS = /^(?:left|counterclockwise|anticlockwise|ccw|up|upward|upwards|positive|plus|increase|raise|forward|forwards)$/;
const NEGATIVE_DIRS = /^(?:right|clockwise|cw|down|downward|downwards|negative|minus|decrease|lower|back|backward|backwards)$/;

// Verb-ish words that start a new command when they follow "and".
const COMMAND_STARTERS = 'press|tap|hit|push|click|go|move|jog|rotate|turn|spin|set|enter|type|input|home|return|reset|release|stop|halt|speed|slow|nudge|lift|raise|lower|drop|wait|pause|joint|key|up|down|left|right|forward|forwards|back|backward';

function makeId(): string {
  return crypto.randomUUID();
}

function base(type: ArmCommand['type']): ArmCommand {
  return { id: makeId(), source: 'voice', type, timestamp: Date.now() };
}

function err(reason: string, raw: string, hint?: string): ParseError {
  return hint ? { ok: false, reason, raw, hint } : { ok: false, reason, raw };
}

export function isParseError(result: unknown): result is ParseError {
  return typeof result === 'object' && result !== null && (result as ParseError).ok === false;
}

/** Convert runs of English number words into digits ("forty five" → "45"). */
function wordsToDigits(text: string): string {
  const tokens = text.split(' ');
  const out: string[] = [];
  let acc: number | null = null;
  let decimal: string | null = null;

  const flush = () => {
    if (acc !== null) out.push(decimal !== null ? `${acc}.${decimal || '0'}` : String(acc));
    acc = null;
    decimal = null;
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t in SMALL_NUMBERS) {
      const v = SMALL_NUMBERS[t];
      if (decimal !== null) {
        decimal += String(v);
      } else if (acc !== null && acc >= 20 && acc % 10 === 0 && acc % 100 !== 0 && v < 10) {
        acc += v; // "forty" + "five"
      } else if (acc !== null && acc >= 100 && acc % 100 === 0) {
        acc += v; // "one hundred" + "five"
      } else {
        flush();
        acc = v;
      }
    } else if (t in TENS) {
      if (acc !== null && acc >= 100 && acc % 100 === 0 && decimal === null) {
        acc += TENS[t];
      } else {
        flush();
        acc = TENS[t];
      }
    } else if (t === 'hundred' && acc !== null && acc < 10 && decimal === null) {
      acc *= 100;
    } else if (t === 'hundred' && acc === null) {
      acc = 100;
    } else if ((t === 'point' || t === 'dot') && acc !== null && decimal === null) {
      decimal = '';
    } else if (t === 'and' && acc !== null && acc >= 100 && acc % 100 === 0) {
      // "one hundred and twenty" – swallow the "and"
    } else {
      flush();
      out.push(t);
    }
  }
  flush();
  return out.join(' ');
}

/** Lower-cases and cleans a transcript while preserving decimals and negative numbers. */
export function normalize(text: string): string {
  let s = ` ${text.toLowerCase()} `;
  s = s.replace(/°/g, ' degrees ');
  s = s.replace(/\be[\s-]?stop\b/g, ' estop ');
  s = s.replace(/[’']/g, '');
  // Keep "-" only when it's a sign (start of a number); "1-2-3" (no spaces) is a separator (PINs).
  s = s.replace(/(\d)-(?=\d)/g, '$1 ');
  s = s.replace(/[^a-z0-9.\-+\s]/g, ' ');
  s = s.replace(/-(?!\d|\.\d)/g, ' ');
  s = s.replace(/\+(?!\d)/g, ' plus ');
  // Keep "." only between digits / before a digit.
  s = s.replace(/\.(?!\d)/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();

  // Fillers and politeness.
  s = s.replace(/\b(?:a little bit|a little|a tiny bit|a bit|slightly|a touch)\b/g, ' small ');
  s = s.replace(/\b(?:a lot|a bunch|way)\b/g, ' large ');
  s = s.replace(/\b(?:please|kindly|could you|can you|would you|will you|i want you to|i need you to|id like you to|go ahead and|lets|let us|okay|ok|hey|robot|arm|uh|um|er|hmm|now|just|quickly|the|a|an)\b/g, ' ');

  // Common Whisper mishearings around numbers and nouns.
  s = s.replace(/\bjoin(?:ts?)?\b|\bjoints\b/g, 'joint');
  s = s.replace(/\b(?:keys|kee|qi|button|buttons)\b/g, 'key');
  s = s.replace(/\bpin code\b|\bpasscode\b|\bpass code\b|\bpassword\b|\bcode\b|\bpin number\b/g, 'pin');
  s = s.replace(/\b(key|joint|axis|number) (?:to|too)\b/g, '$1 2');
  s = s.replace(/\b(key|joint|axis|number) (?:for|fore)\b/g, '$1 4');
  s = s.replace(/\b(key|joint|axis|number) won\b/g, '$1 1');
  s = s.replace(/\b(key|joint|axis|number) (?:sex|sick|sicks)\b/g, '$1 6');
  s = s.replace(/\bdegree\b|\bdeg\b|\bdegs\b/g, 'degrees');
  s = s.replace(/\b(?:radian|rads?)\b/g, 'radians');

  s = s.replace(/\s+/g, ' ').trim();
  s = wordsToDigits(s);
  s = s.replace(/\b(?:minus|negative) (\d)/g, '-$1');

  // Ordinals: "third key" / "key third" → "key 3".
  s = s.replace(/\b(first|second|third|fourth|fifth|sixth|1st|2nd|3rd|4th|5th|6th) (key|joint)\b/g, (_m, o: string, n: string) => `${n} ${ORDINALS[o]}`);
  s = s.replace(/\b(key|joint) (first|second|third|fourth|fifth|sixth)\b/g, (_m, n: string, o: string) => `${n} ${ORDINALS[o]}`);

  for (const [re, rep] of NAMED_JOINTS) s = s.replace(re, rep);

  return s.replace(/\s+/g, ' ').trim();
}

const NUM = '[-+]?\\d+(?:\\.\\d+)?|[-+]?\\.\\d+';

function toNum(token: string | undefined): number | null {
  if (token === undefined) return null;
  const n = parseFloat(token);
  return Number.isFinite(n) ? n : null;
}

function angleToRad(value: number, unit: string | undefined): number {
  return unit === 'radians' ? value : value * DEG;
}

function lengthToMeters(value: number, unit: string | undefined, defaultUnit: 'cm' | 'm'): number {
  switch (unit) {
    case 'mm': case 'millimeter': case 'millimeters': case 'millimetre': case 'millimetres':
      return value / 1000;
    case 'cm': case 'centimeter': case 'centimeters': case 'centimetre': case 'centimetres': case 'centi':
      return value / 100;
    case 'inch': case 'inches': case 'in':
      return value * 0.0254;
    case 'm': case 'meter': case 'meters': case 'metre': case 'metres':
      return value;
    default:
      return defaultUnit === 'cm' ? value / 100 : value;
  }
}

function sizeWordToFactor(seg: string): number {
  if (/\bsmall\b|\btiny\b/.test(seg)) return 0.5;
  if (/\blarge\b|\bbig\b/.test(seg)) return 3;
  return 1;
}

function jointIndexFrom(token: string, raw: string): number | ParseError {
  const n = toNum(token);
  if (n === null || !Number.isInteger(n)) return err(`Invalid joint number: ${token}`, raw);
  if (n < 1 || n > 6) return err(`Joint index out of range (1-6): ${n}`, raw, 'The arm has joints 1 to 6.');
  return n - 1;
}

const LENGTH_UNITS = '(mm|millimeters?|millimetres?|cm|centimeters?|centimetres?|inch|inches|m|meters?|metres?)';

/** Parse one command segment. May return several commands ("press keys 1 2 and 3"). */
function parseSegment(seg: string, raw: string): ArmCommand[] | ParseError | null {
  if (!seg) return null;

  // --- Reset / release E-stop ---------------------------------------------
  if (/\b(?:reset|release|rearm|unlock|recover|clear (?:error|fault|stop|estop))\b/.test(seg)) {
    return [base('reset')];
  }

  // --- Emergency stop -----------------------------------------------------
  if (/\b(?:estop|emergency|halt|freeze|abort|kill)\b/.test(seg) || /^stop\b|\bstop$|^stop$/.test(seg)) {
    return [base('estop')];
  }

  // --- Wait / pause -------------------------------------------------------
  const waitMatch = seg.match(new RegExp(`^(?:wait|pause|sleep|hold)(?: for)? ?(${NUM})? ?(seconds?|secs?|s|milliseconds?|ms)?$`));
  if (waitMatch) {
    const v = toNum(waitMatch[1]) ?? 1;
    const ms = /^m/.test(waitMatch[2] ?? '') ? v : v * 1000;
    return [{ ...base('wait'), durationMs: Math.min(10000, Math.max(0, ms)) }];
  }

  // --- Speed --------------------------------------------------------------
  if (/\b(?:speed|rpm|velocity|faster|slower|slow down|speed up)\b/.test(seg)) {
    const abs = seg.match(new RegExp(`(${NUM}) ?(?:rpm|percent)?`));
    if (/\b(?:faster|speed up|quicker|increase)\b/.test(seg) && !abs) return [{ ...base('set_speed'), speedScale: 1.5 }];
    if (/\b(?:slower|slow down|decrease|reduce)\b/.test(seg) && !abs) return [{ ...base('set_speed'), speedScale: 0.66 }];
    if (abs) {
      const rpm = toNum(abs[1])!;
      if (rpm <= 0) return err('Speed must be positive', raw, 'Try "set speed to 30 rpm".');
      return [{ ...base('set_speed'), rpm }];
    }
    return err('Missing speed value', raw, 'Try "set speed to 30 rpm", "faster" or "slower".');
  }

  // --- Home ---------------------------------------------------------------
  if (/\b(?:home|homing|rest position|zero position|neutral position|park|starting position)\b/.test(seg)) {
    const goto: ArmCommand = { ...base('goto'), targetName: 'home' };
    return [goto];
  }

  // --- PIN ----------------------------------------------------------------
  const pinMatch = seg.match(/\bpin\b(.*)$/);
  if (pinMatch) {
    const digitsStr = pinMatch[1].replace(/[^\d]/g, '');
    if (!/\d/.test(pinMatch[1]) && /[a-z]/.test(pinMatch[1].replace(/\b(?:is|of|as|number|digits)\b/g, '').trim())) {
      return err('PIN must contain only digits, spaces, or dashes', raw);
    }
    if (digitsStr.length !== 6) {
      return err(`PIN must be exactly 6 digits, got ${digitsStr.length}`, raw, 'Say e.g. "enter pin 1 2 3 4 5 6".');
    }
    const digits = digitsStr.split('').map(Number);
    const bad = digits.find((d) => d < 1 || d > 6);
    if (bad !== undefined) {
      return err(`PIN digit ${bad} is not on the keypad (keys 1-6)`, raw, 'The keypad only has keys 1 to 6.');
    }
    return [{ ...base('enter_pin'), digits }];
  }

  // --- Absolute Cartesian move: "move to x 0.5 y 0 z 0.2" -----------------
  const xyz = seg.match(new RegExp(`\\bx (?:is |equals |=)?(${NUM}) ?,? ?y (?:is |equals |=)?(${NUM}) ?,? ?z (?:is |equals |=)?(${NUM})(?: ?${LENGTH_UNITS})?`));
  const triple = !xyz
    ? seg.match(new RegExp(`\\b(?:coordinates?|position|point|xyz|location)\\b ?(?:of |at |to )?(${NUM}) (${NUM}) (${NUM})(?: ?${LENGTH_UNITS})?`))
    : null;
  const coords = xyz ?? triple;
  if (coords) {
    const vals = [toNum(coords[1])!, toNum(coords[2])!, toNum(coords[3])!];
    const unit = coords[4];
    // No unit and large numbers → the operator almost certainly meant centimeters.
    const defaultUnit = !unit && vals.some((v) => Math.abs(v) > 2) ? 'cm' : 'm';
    const [x, y, z] = vals.map((v) => lengthToMeters(v, unit, defaultUnit));
    return [{ ...base('moveTo'), target: { x, y, z, approach: [0, 0, -1] } }];
  }

  // --- Key presses ----------------------------------------------------------
  const isKeyCommand = /\bkey\b/.test(seg) || /^(?:press|tap|hit|push|click|punch)\b/.test(seg);
  if (isKeyCommand && !/\bjoint\b/.test(seg)) {
    const numbers = (seg.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    if (numbers.length === 0) {
      return err('Which key?', raw, 'Say e.g. "press key 3".');
    }
    const cmds: ArmCommand[] = [];
    for (const n of numbers) {
      if (!Number.isInteger(n) || n < 1 || n > 6) {
        return err(`Key index out of range (1-6): ${n}`, raw, 'The keypad has keys 1 to 6.');
      }
      cmds.push({ ...base('press_key'), keyIndex: n });
    }
    return cmds;
  }

  // --- Joint commands -------------------------------------------------------
  const jointMatch = seg.match(/\b(?:joint|axis) (\S+)\b ?(.*)$/);
  if (jointMatch) {
    const idx = jointIndexFrom(jointMatch[1], raw);
    if (isParseError(idx)) return idx;
    const rest = jointMatch[2].trim();
    const verbBefore = seg.slice(0, jointMatch.index).trim();

    // Absolute: "joint 2 to 90", "set joint 2 at -30 degrees"
    const absMatch = rest.match(new RegExp(`^(?:to|at|=|equals|position) (${NUM}) ?(degrees|radians)?$`));
    if (absMatch) {
      const v = toNum(absMatch[1])!;
      return [{ ...base('rotate_joint'), jointIndex: idx, absRad: angleToRad(v, absMatch[2]) }];
    }

    // Relative: "by 10", "plus 10", "-10", "left 10 degrees", "10 degrees clockwise", or no amount.
    const tokens = rest.split(' ').filter(Boolean);
    let sign = 1;
    let amount: number | null = null;
    let unit: string | undefined;
    let sawDirection = false;
    for (const t of tokens) {
      if (POSITIVE_DIRS.test(t)) { sawDirection = true; }
      else if (NEGATIVE_DIRS.test(t)) { sign = -sign; sawDirection = true; }
      else if (t === 'degrees' || t === 'radians') unit = t;
      else if (amount === null && toNum(t) !== null && /^[-+]?\d|^[-+]?\./.test(t)) amount = toNum(t);
      else if (/^(?:by|of|small|large|big|tiny|more|some|and|step|steps|around|about|over|deg|to)$/.test(t)) { /* noise */ }
      else return err('Unrecognized command', raw, `Couldn't understand "${rest}" for joint ${idx + 1}. Try "jog joint ${idx + 1} by 10 degrees".`);
    }
    const relativeVerb = /\b(?:jog|nudge|move|turn|rotate|spin|bump|shift|adjust)\b/.test(verbBefore) || tokens.includes('by') || sawDirection || amount !== null;
    if (!relativeVerb && tokens.length === 0) {
      return err('Unrecognized command', raw, `What should joint ${idx + 1} do? Try "jog joint ${idx + 1} by 10 degrees".`);
    }
    const magnitude = amount !== null ? amount : DEFAULT_JOINT_STEP_DEG * sizeWordToFactor(rest);
    const deltaRad = angleToRad(magnitude, unit) * sign;
    if (deltaRad === 0) return err('Jog amount is zero', raw);
    return [{ ...base('jog'), jointIndex: idx, deltaRad }];
  }

  // --- "turn left 20 degrees" without a joint → base rotation --------------
  const turnMatch = seg.match(new RegExp(`^(?:turn|rotate|spin|swivel|pan) (left|right|clockwise|counterclockwise|anticlockwise)(?: by)? ?(${NUM})? ?(degrees|radians)?$`));
  if (turnMatch) {
    const sign = NEGATIVE_DIRS.test(turnMatch[1]) ? -1 : 1;
    const mag = toNum(turnMatch[2]) ?? DEFAULT_JOINT_STEP_DEG;
    return [{ ...base('jog'), jointIndex: 0, deltaRad: angleToRad(mag, turnMatch[3]) * sign }];
  }

  // --- Cartesian nudge: "move up 5 cm", "left 2", "lift 3 centimeters" ----
  const cart = seg.match(new RegExp(`^(?:(?:move|nudge|shift|go|jog|slide|bring|take|step)(?: tip| stylus| tool| end effector| hand| it)? )?(up|upward|upwards|down|downward|downwards|left|right|forward|forwards|ahead|back|backward|backwards|lift|raise|lower|drop)(?: by)?(?: (small|large|big|tiny))? ?(${NUM})? ?${LENGTH_UNITS}?$`));
  const liftOnly = !cart ? seg.match(new RegExp(`^(lift|raise|lower|drop)(?: tip| stylus| tool| it)?(?: up| down)?(?: by)? ?(${NUM})? ?${LENGTH_UNITS}?$`)) : null;
  if (cart || liftOnly) {
    const dirWord = cart ? cart[1] : liftOnly![1];
    const amountTok = cart ? cart[3] : liftOnly![2];
    const unit = cart ? cart[4] : liftOnly![3];
    const factor = cart && cart[2] ? sizeWordToFactor(cart[2]) : 1;
    const mag = toNum(amountTok) !== null ? lengthToMeters(toNum(amountTok)!, unit, 'cm') : DEFAULT_CARTESIAN_STEP_M * factor;
    if (Math.abs(mag) > 0.5) return err('Nudge too large (max 50 cm)', raw, 'Use a smaller step, e.g. "move up 5 cm".');
    const delta = { x: 0, y: 0, z: 0 };
    if (/^(?:up|upward|upwards|lift|raise)$/.test(dirWord)) delta.z = mag;
    else if (/^(?:down|downward|downwards|lower|drop)$/.test(dirWord)) delta.z = -mag;
    else if (dirWord === 'left') delta.y = mag;
    else if (dirWord === 'right') delta.y = -mag;
    else if (/^(?:forward|forwards|ahead)$/.test(dirWord)) delta.x = mag;
    else delta.x = -mag;
    return [{ ...base('jog'), delta }];
  }

  return null;
}

function splitSegments(normalized: string): string[] {
  return normalized
    .replace(/\b(?:and then|then|after that|afterwards|followed by|next|and finally|finally)\b/g, ' | ')
    .replace(new RegExp(`\\band (?=(?:${COMMAND_STARTERS})\\b)`, 'g'), ' | ')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);
}

const UNRECOGNIZED_HINT = 'Try "press key 3", "jog joint 1 by 10 degrees", "move up 5 cm", "go home" or "stop".';

/** Parse a full utterance into an ordered list of commands. Stops at the first bad segment. */
export function parseCommandSequence(text: string): SequenceParse {
  const raw = text;
  // A comma that introduces a new command word separates steps
  // ("go home, wait 1 second, then press 5"); commas between PIN digits don't.
  const clauses = (text ?? '').replace(new RegExp(`[,;]\\s*(?=(?:and\\s+)?(?:then\\s+)?(?:${COMMAND_STARTERS})\\b)`, 'gi'), ' then ');
  const normalized = normalize(clauses);
  if (!normalized) {
    return { commands: [], error: err('Unrecognized command', raw, UNRECOGNIZED_HINT) };
  }

  // Safety first: any stop word anywhere wins over the rest of the sentence,
  // unless the operator is explicitly asking to reset/release the stop.
  const isReset = /\b(?:reset|release|rearm|unlock|recover|clear (?:error|fault|stop|estop))\b/.test(normalized);
  if (!isReset && (/\b(?:estop|emergency|halt|freeze|abort)\b/.test(normalized) || /^stop\b|\bstop$/.test(normalized))) {
    const stop = base('estop');
    return { commands: [stop], error: null };
  }

  const commands: ArmCommand[] = [];
  let last: ArmCommand | null = null;
  for (const seg of splitSegments(normalized)) {
    // A bare number after a key press continues it: "press key 1 then 4".
    let segment = seg;
    if (/^(?:-?\d+(?:\.\d+)?\s*)+$/.test(segment) && last?.type === 'press_key') {
      segment = `key ${segment}`;
    }
    const parsed = parseSegment(segment, raw);
    if (parsed === null) {
      return { commands, error: err('Unrecognized command', raw, commands.length ? `Couldn't understand "${seg}". ${UNRECOGNIZED_HINT}` : UNRECOGNIZED_HINT) };
    }
    if (isParseError(parsed)) return { commands, error: parsed };
    commands.push(...parsed);
    last = parsed[parsed.length - 1] ?? last;
  }

  if (commands.length === 0) {
    return { commands, error: err('Unrecognized command', raw, UNRECOGNIZED_HINT) };
  }
  return { commands, error: null };
}

/** Single-command parse (first command of the sequence). Kept for existing callers/tests. */
export function parseUtterance(text: string): ArmCommand | ParseError {
  const { commands, error } = parseCommandSequence(text);
  if (error) return error;
  return commands[0];
}

/** Human description of a command, used by the voice + agent UIs. */
export function describeCommand(cmd: ArmCommand): string {
  switch (cmd.type) {
    case 'press_key': return `Press key ${cmd.keyIndex}`;
    case 'enter_pin': return `Enter PIN ${(cmd.digits ?? []).join('')}`;
    case 'goto': return 'Go home';
    case 'estop': return 'Emergency stop';
    case 'reset': return 'Reset E-stop';
    case 'wait': return `Wait ${((cmd.durationMs ?? 0) / 1000).toFixed(1)} s`;
    case 'set_speed':
      return cmd.rpm !== undefined ? `Set speed ${Math.round(cmd.rpm)} RPM` : (cmd.speedScale ?? 1) > 1 ? 'Speed up' : 'Slow down';
    case 'rotate_joint':
      return `Joint ${(cmd.jointIndex ?? 0) + 1} → ${Math.round(((cmd.absRad ?? 0) / DEG) * 10) / 10}°`;
    case 'jog':
      if (cmd.delta) {
        const parts: string[] = [];
        const fmt = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v * 1000) / 10} cm`;
        if (cmd.delta.x) parts.push(`X ${fmt(cmd.delta.x)}`);
        if (cmd.delta.y) parts.push(`Y ${fmt(cmd.delta.y)}`);
        if (cmd.delta.z) parts.push(`Z ${fmt(cmd.delta.z)}`);
        return `Nudge tip ${parts.join(', ') || '0'}`;
      }
      {
        const deg = Math.round(((cmd.deltaRad ?? 0) / DEG) * 10) / 10;
        return `Jog joint ${(cmd.jointIndex ?? 0) + 1} ${deg > 0 ? '+' : ''}${deg}°`;
      }
    case 'moveTo': {
      const t = cmd.target;
      return t ? `Move to (${t.x.toFixed(2)}, ${t.y.toFixed(2)}, ${t.z.toFixed(2)}) m` : 'Move';
    }
    default:
      return cmd.type;
  }
}
