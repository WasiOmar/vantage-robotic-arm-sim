const fs = require('fs');

const files = [
  'src/components/CommandCenter.tsx',
  'src/components/TelemetryDashboard.tsx',
  'src/components/AuditLog.tsx',
  'src/components/StatusBar.tsx'
];

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  
  // Text colors
  content = content.replace(/#111/g, '#eee');
  content = content.replace(/#333/g, '#eee');
  content = content.replace(/#555/g, '#aaa');
  content = content.replace(/#666/g, '#aaa');
  
  // Brand / Accents
  content = content.replace(/#0066cc/g, '#ff6600');
  content = content.replace(/#004c99/g, '#cc5200');
  content = content.replace(/rgba\(0,102,204,0\.1\)/g, 'rgba(255,102,0,0.15)');
  
  // Backgrounds / Borders
  content = content.replace(/rgba\(255,255,255,0\.8\)/g, 'rgba(20,20,20,0.8)');
  content = content.replace(/rgba\(255,255,255,0\.9\)/g, 'rgba(15,15,15,0.95)');
  content = content.replace(/rgba\(0,0,0,0\.1\)/g, 'rgba(255,255,255,0.1)');
  content = content.replace(/rgba\(0,0,0,0\.05\)/g, 'rgba(255,255,255,0.05)');
  content = content.replace(/#ccc/g, '#444');
  content = content.replace(/#ddd/g, '#333');
  content = content.replace(/#f1f5f9/g, '#222');
  content = content.replace(/#cbd5e1/g, '#444');
  content = content.replace(/#e6f7ff/g, '#2b1a0f');
  content = content.replace(/#ccffcc/g, '#143314');
  content = content.replace(/#ffcccc/g, '#4d1a1a');
  content = content.replace(/#f99/g, '#633');

  fs.writeFileSync(file, content);
});
console.log("Theme updated");
