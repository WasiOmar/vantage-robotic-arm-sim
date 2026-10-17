const fs = require('fs');

function fix(file, replaces) {
  let content = fs.readFileSync(file, 'utf8');
  for (const [search, replace] of replaces) {
    content = content.replace(search, replace);
  }
  fs.writeFileSync(file, content);
}

fix('src/audit/index.ts', [
  ["import { ArmCommand }", "import type { ArmCommand }"],
  ["import { ValidationReport } from '../validation';\n", ""]
]);

fix('src/bus/commandBus.ts', [
  ["import { ArmCommand }", "import type { ArmCommand }"],
  ["import { JointState }", "import type { JointState }"]
]);

fix('src/components/AuditLog.tsx', [
  ["import { auditLog, AuditEntry }", "import { auditLog }\nimport type { AuditEntry }"],
  ["Terminal, CheckCircle2, XCircle, AlertCircle", "Terminal, CheckCircle2, XCircle"]
]);

fix('src/executor/index.ts', [
  ["import { JointState }", "import type { JointState }"]
]);

fix('src/fsm/index.ts', [
  ["import { ArmCommand }", "import type { ArmCommand }"]
]);

fix('src/kinematics/index.ts', [
  ["import { JointState }", "import type { JointState }"],
  ["target: {", "_target: {"],
  ["jointAngles: JointState", "_jointAngles: JointState"]
]);

fix('src/triggers/autonomous.ts', [
  ["pin: string", "_pin: string"]
]);

fix('src/triggers/dashboard.ts', [
  ["import { commandBus } from '../bus/commandBus';\nimport { ArmCommand } from '../types/commands';\n", ""]
]);

fix('src/triggers/voice.ts', [
  ["spokenText: string", "_spokenText: string"]
]);

fix('src/types.ts', [
  ["import { CommandSource, ArmCommand }", "import type { CommandSource, ArmCommand }"]
]);

fix('src/validation/index.ts', [
  ["import { JointState }", "import type { JointState }"],
  ["import { ArmCommand }", "import type { ArmCommand }"],
  ["command: ArmCommand", "_command: ArmCommand"]
]);

console.log("Fixed");
