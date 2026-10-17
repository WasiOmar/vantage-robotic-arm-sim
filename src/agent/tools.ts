// Tool schemas use operator units (1-based joints, degrees, centimeters) so the
// model never has to convert to 0-based indices or radians. agent.ts maps them
// onto ArmCommands; legacy names (goto, jog, rotate_joint, keyIndex…) are still accepted.
export const toolSchemas = [
  {
    name: 'press_key',
    description: 'Press one keypad key (1-6) with the stylus. For several keys, call this once per key in order.',
    input_schema: {
      type: 'object',
      properties: {
        key: { type: 'integer', minimum: 1, maximum: 6, description: 'Key number, 1 to 6.' },
      },
      required: ['key'],
    },
  },
  {
    name: 'enter_pin',
    description: 'Type a full 6-digit PIN on the keypad (hover, press and retract for each digit). Every digit must be 1-6.',
    input_schema: {
      type: 'object',
      properties: {
        digits: {
          type: 'array',
          items: { type: 'integer', minimum: 1, maximum: 6 },
          minItems: 6,
          maxItems: 6,
          description: 'Exactly 6 digits, each 1 to 6.',
        },
      },
      required: ['digits'],
    },
  },
  {
    name: 'jog_joint',
    description: 'Rotate one joint RELATIVE to its current angle. Positive = counter-clockwise about the joint axis.',
    input_schema: {
      type: 'object',
      properties: {
        joint: { type: 'integer', minimum: 1, maximum: 6, description: 'Joint number 1-6 (1 base, 2 shoulder, 3 elbow, 4 wrist roll, 5 wrist pitch, 6 wrist yaw).' },
        degrees: { type: 'number', description: 'Signed change in degrees.' },
      },
      required: ['joint', 'degrees'],
    },
  },
  {
    name: 'set_joint',
    description: 'Rotate one joint to an ABSOLUTE angle in degrees.',
    input_schema: {
      type: 'object',
      properties: {
        joint: { type: 'integer', minimum: 1, maximum: 6, description: 'Joint number 1-6.' },
        degrees: { type: 'number', description: 'Target angle in degrees.' },
      },
      required: ['joint', 'degrees'],
    },
  },
  {
    name: 'move_tip',
    description: 'Move the stylus tip RELATIVE to where it is now, in centimeters. +x forward (away from base), +y left, +z up.',
    input_schema: {
      type: 'object',
      properties: {
        dx_cm: { type: 'number' },
        dy_cm: { type: 'number' },
        dz_cm: { type: 'number' },
      },
    },
  },
  {
    name: 'move_to',
    description: 'Move the stylus tip to an absolute position in meters in the base frame (z up, floor at z=0). Reach is 1.19 m.',
    input_schema: {
      type: 'object',
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        z: { type: 'number' },
      },
      required: ['x', 'y', 'z'],
    },
  },
  {
    name: 'go_home',
    description: 'Return every joint to the home pose (all zeros).',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'set_speed',
    description: 'Set the motion speed in RPM (5-140) used by autonomous sequences.',
    input_schema: {
      type: 'object',
      properties: { rpm: { type: 'number', minimum: 5, maximum: 140 } },
      required: ['rpm'],
    },
  },
  {
    name: 'wait',
    description: 'Pause between steps.',
    input_schema: {
      type: 'object',
      properties: { seconds: { type: 'number', minimum: 0, maximum: 10 } },
      required: ['seconds'],
    },
  },
  {
    name: 'get_state',
    description: 'Read the live arm state: joint angles (deg), joint limits, tip position (m), safety mode and speed. Use before relative moves or to answer questions about the arm.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'estop',
    description: 'Emergency stop: immediately halts the arm and latches STOP. Only the human operator can reset it.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'clarify',
    description: 'Ask the operator a short question when the request is ambiguous or missing details. Do not guess.',
    input_schema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The question to ask.' },
      },
      required: ['question'],
    },
  },
];
