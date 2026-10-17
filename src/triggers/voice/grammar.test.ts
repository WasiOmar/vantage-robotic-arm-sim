import { describe, it, expect } from 'vitest';
import { parseUtterance } from './grammar';

describe('parseUtterance', () => {
  // happy path: jog joint
  it('parses "jog joint 3 by 45 degrees"', () => {
    const result = parseUtterance('jog joint 3 by 45 degrees');
    if (result.ok) throw new Error('Expected ok:true');
    expect(result.type).toBe('jog');
    expect(result.jointIndex).toBe(2);
    expect(result.deltaRad).toBeCloseTo(Math.PI / 4, 10);
    expect(result.source).toBe('voice');
    expect(typeof result.id).toBe('string');
    expect(typeof result.timestamp).toBe('number');
  });

  // happy path: go to key
  it('parses "go to key 2"', () => {
    const result = parseUtterance('go to key 2');
    if (result.ok) throw new Error('Expected ok:true');
    expect(result.type).toBe('press_key');
    expect(result.keyIndex).toBe(2);
    expect(result.source).toBe('voice');
  });

  // happy path: press key
  it('parses "press key 4"', () => {
    const result = parseUtterance('press key 4');
    if (result.ok) throw new Error('Expected ok:true');
    expect(result.type).toBe('press_key');
    expect(result.keyIndex).toBe(4);
    expect(result.source).toBe('voice');
  });

  // happy path: enter pin with digits
  it('parses "enter pin 123456"', () => {
    const result = parseUtterance('enter pin 123456');
    if (result.ok) throw new Error('Expected ok:true');
    expect(result.type).toBe('enter_pin');
    expect(result.digits).toEqual([1, 2, 3, 4, 5, 6]);
    expect(result.source).toBe('voice');
  });

  // happy path: enter pin with dashes
  it('parses "enter pin 1-2-3-4-5-6"', () => {
    const result = parseUtterance('enter pin 1-2-3-4-5-6');
    if (result.ok) throw new Error('Expected ok:true');
    expect(result.type).toBe('enter_pin');
    expect(result.digits).toEqual([1, 2, 3, 4, 5, 6]);
  });

  // happy path: enter pin with spaces
  it('parses "enter pin 1 2 3 4 5 6"', () => {
    const result = parseUtterance('enter pin 1 2 3 4 5 6');
    if (result.ok) throw new Error('Expected ok:true');
    expect(result.type).toBe('enter_pin');
    expect(result.digits).toEqual([1, 2, 3, 4, 5, 6]);
  });

  // happy path: rotate joint
  it('parses "rotate joint 2 to 90 degrees"', () => {
    const result = parseUtterance('rotate joint 2 to 90 degrees');
    if (result.ok) throw new Error('Expected ok:true');
    expect(result.type).toBe('rotate_joint');
    expect(result.jointIndex).toBe(1);
    expect(result.absRad).toBeCloseTo(Math.PI / 2, 10);
    expect(result.source).toBe('voice');
  });

  // happy path: home
  it('parses "home"', () => {
    const result = parseUtterance('home');
    if (result.ok) throw new Error('Expected ok:true');
    expect(result.type).toBe('goto');
    expect(result.targetName).toBe('home');
    expect(result.source).toBe('voice');
  });

  // happy path: go home
  it('parses "go home"', () => {
    const result = parseUtterance('go home');
    if (result.ok) throw new Error('Expected ok:true');
    expect(result.type).toBe('goto');
    expect(result.targetName).toBe('home');
  });

  // happy path: stop
  it('parses "stop"', () => {
    const result = parseUtterance('stop');
    if (result.ok) throw new Error('Expected ok:true');
    expect(result.type).toBe('estop');
    expect(result.source).toBe('voice');
  });

  // happy path: emergency stop
  it('parses "emergency stop"', () => {
    const result = parseUtterance('emergency stop');
    if (result.ok) throw new Error('Expected ok:true');
    expect(result.type).toBe('estop');
  });

  // happy path: e stop
  it('parses "e stop"', () => {
    const result = parseUtterance('e stop');
    if (result.ok) throw new Error('Expected ok:true');
    expect(result.type).toBe('estop');
  });

  // filler-word tolerance
  it('tolerates filler words in jog command', () => {
    const result = parseUtterance('please jog joint 3 by 45 degrees');
    if (result.ok) throw new Error('Expected ok:true');
    expect(result.type).toBe('jog');
    expect(result.jointIndex).toBe(2);
  });

  it('tolerates "could you" in key command', () => {
    const result = parseUtterance('could you press key 3');
    if (result.ok) throw new Error('Expected ok:true');
    expect(result.type).toBe('press_key');
    expect(result.keyIndex).toBe(3);
  });

  it('tolerates "uh" in pin command', () => {
    const result = parseUtterance('uh enter pin 123456');
    if (result.ok) throw new Error('Expected ok:true');
    expect(result.type).toBe('enter_pin');
    expect(result.digits).toEqual([1, 2, 3, 4, 5, 6]);
  });

  // word-number vs digit
  it('parses word number "one" for joint', () => {
    const result = parseUtterance('jog joint one by 30 degrees');
    if (result.ok) throw new Error('Expected ok:true');
    expect(result.type).toBe('jog');
    expect(result.jointIndex).toBe(0);
    expect(result.deltaRad).toBeCloseTo(30 * Math.PI / 180, 10);
  });

  it('parses digit "1" for joint', () => {
    const result = parseUtterance('jog joint 1 by 30 degrees');
    if (result.ok) throw new Error('Expected ok:true');
    expect(result.type).toBe('jog');
    expect(result.jointIndex).toBe(0);
  });

  it('parses word number "five" for key', () => {
    const result = parseUtterance('press key five');
    if (result.ok) throw new Error('Expected ok:true');
    expect(result.type).toBe('press_key');
    expect(result.keyIndex).toBe(5);
  });

  // rejects out of range
  it('rejects "jog joint 9 by 30 degrees" (out of range)', () => {
    const result = parseUtterance('jog joint 9 by 30 degrees');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('out of range');
    }
  });

  it('rejects "press key 7" (out of range)', () => {
    const result = parseUtterance('press key 7');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('out of range');
    }
  });

  // rejects too short PIN
  it('rejects "enter pin 12345" (too short)', () => {
    const result = parseUtterance('enter pin 12345');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('6 digits');
    }
  });

  it('rejects "enter pin 1234567" (too long)', () => {
    const result = parseUtterance('enter pin 1234567');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('6 digits');
    }
  });

  // rejects garbage utterances
  it('rejects unrecognized utterance', () => {
    const result = parseUtterance('garbage text here');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('Unrecognized command');
    }
  });

  it('rejects empty string', () => {
    const result = parseUtterance('');
    expect(result.ok).toBe(false);
  });

  // case-insensitivity
  it('is case-insensitive', () => {
    const result = parseUtterance('JOG JOINT 3 BY 45 DEGREES');
    if (result.ok) throw new Error('Expected ok:true');
    expect(result.type).toBe('jog');
    expect(result.jointIndex).toBe(2);
  });

  // whitespace tolerance
  it('tolerates extra whitespace', () => {
    const result = parseUtterance('jog   joint   3   by   45   degrees');
    if (result.ok) throw new Error('Expected ok:true');
    expect(result.type).toBe('jog');
    expect(result.jointIndex).toBe(2);
  });

  // punctuation tolerance
  it('tolerates trailing periods and other punctuation', () => {
    const result1 = parseUtterance('press key 6.');
    if (result1.ok) throw new Error('Expected ok:true for press key 6.');
    expect(result1.type).toBe('press_key');
    expect(result1.keyIndex).toBe(6);

    const result2 = parseUtterance('go home!');
    if (result2.ok) throw new Error('Expected ok:true for go home!');
    expect(result2.type).toBe('goto');
    expect(result2.targetName).toBe('home');
  });
});
