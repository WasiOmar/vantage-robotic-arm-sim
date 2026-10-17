import { describe, it, expect } from 'vitest';
import { parseCommandSequence, normalize } from './grammar';

const DEG = Math.PI / 180;

function summary(text: string): string[] {
  const { commands, error } = parseCommandSequence(text);
  if (error) return [`ERR:${error.reason}`];
  return commands.map((c) => {
    switch (c.type) {
      case 'press_key': return `key${c.keyIndex}`;
      case 'enter_pin': return `pin${c.digits!.join('')}`;
      case 'goto': return 'home';
      case 'estop': return 'estop';
      case 'reset': return 'reset';
      case 'wait': return `wait${c.durationMs}`;
      case 'set_speed': return c.rpm !== undefined ? `rpm${c.rpm}` : `scale${c.speedScale}`;
      case 'rotate_joint': return `j${c.jointIndex! + 1}=${Math.round(c.absRad! / DEG)}`;
      case 'moveTo': return `to(${c.target!.x},${c.target!.y},${c.target!.z})`;
      case 'jog':
        if (c.delta) return `d(${+c.delta.x.toFixed(3)},${+c.delta.y.toFixed(3)},${+c.delta.z.toFixed(3)})`;
        return `j${c.jointIndex! + 1}${c.deltaRad! > 0 ? '+' : ''}${Math.round(c.deltaRad! / DEG)}`;
      default: return c.type;
    }
  });
}

describe('normalize', () => {
  it('keeps decimals and negative numbers', () => {
    expect(normalize('Go to X=0.5, Y=-0.1, Z=0.2.')).toBe('go to x 0.5 y -0.1 z 0.2');
  });
  it('converts number words', () => {
    expect(normalize('jog joint two by forty five degrees')).toBe('jog joint 2 by 45 degrees');
  });
});

describe('parseCommandSequence: wide phrasing coverage', () => {
  const cases: [string, string[]][] = [
    // keys
    ['press key 3', ['key3']],
    ['Press key three.', ['key3']],
    ['hit button 2', ['key2']],
    ['tap the second key', ['key2']],
    ['press key for', ['key4']],
    ['press keys 1, 4 and 6', ['key1', 'key4', 'key6']],
    ['press 2', ['key2']],
    ['go to key 5', ['key5']],
    ['press key 1 then 4', ['key1', 'key4']],
    // pin
    ['enter pin 1 2 3 4 5 6', ['pin123456']],
    ['type the code 123-456', ['pin123456']],
    ['enter passcode one two three four five six', ['pin123456']],
    ['Enter PIN 1, 2, 3, 4, 5, 6.', ['pin123456']],
    // joints
    ['jog joint 1 by 15 degrees', ['j1+15']],
    ['jog joint 1 by -15 degrees', ['j1-15']],
    ['jog joint one minus twenty', ['j1-20']],
    ['move joint 3 by negative 10 degrees', ['j3-10']],
    ['joint 2 plus 5', ['j2+5']],
    ['turn the base left 20 degrees', ['j1+20']],
    ['rotate base clockwise 30 degrees', ['j1-30']],
    ['elbow down a little', ['j3-5']],
    ['jog the shoulder', ['j2+10']],
    ['turn right 15 degrees', ['j1-15']],
    ['rotate joint 2 to 30 degrees', ['j2=30']],
    ['set the wrist to minus 45', ['j5=-45']],
    ['Join 4 to 90°', ['j4=90']],
    // cartesian
    ['move up 5 cm', ['d(0,0,0.05)']],
    ['nudge left 2 centimeters', ['d(0,0.02,0)']],
    ['move forward 30 mm', ['d(0.03,0,0)']],
    ['lift 3 cm', ['d(0,0,0.03)']],
    ['move down a bit', ['d(0,0,-0.01)']],
    ['move up 5 cm and left 3 cm', ['d(0,0,0.05)', 'd(0,0.03,0)']],
    ['go to x 0.5 y 0 z 0.2', ['to(0.5,0,0.2)']],
    ['move to x=50 y=0 z=20', ['to(0.5,0,0.2)']],
    ['move to coordinates 0.55 0.05 0.1', ['to(0.55,0.05,0.1)']],
    // system
    ['go home', ['home']],
    ['return to the home position', ['home']],
    ['stop', ['estop']],
    ['STOP STOP', ['estop']],
    ['emergency stop!', ['estop']],
    ['e-stop', ['estop']],
    ['halt', ['estop']],
    ['reset', ['reset']],
    ['reset the e-stop', ['reset']],
    ['set speed to 40 rpm', ['rpm40']],
    ['faster', ['scale1.5']],
    ['wait 2 seconds', ['wait2000']],
    // chains
    ['press key 2 then go home', ['key2', 'home']],
    ['go home, wait 1 second, then press key 5', ['home', 'wait1000', 'key5']],
    ['reset and go home', ['reset', 'home']],
    ['please press key 3 and then key 5 and then go home', ['key3', 'key5', 'home']],
    // rejections
    ['press key 9', ['ERR:Key index out of range (1-6): 9']],
    ['enter pin 123457', ['ERR:PIN digit 7 is not on the keypad (keys 1-6)']],
    ['make me a sandwich', ['ERR:Unrecognized command']],
    ['press key 2 then dance', ['ERR:Unrecognized command']],
  ];

  for (const [input, expected] of cases) {
    it(`"${input}"`, () => {
      expect(summary(input)).toEqual(expected);
    });
  }
});
