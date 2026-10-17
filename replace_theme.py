import os

files = [
    'src/components/CommandCenter.tsx',
    'src/components/TelemetryDashboard.tsx',
    'src/components/AuditLog.tsx',
    'src/components/StatusBar.tsx'
]

replacements = {
    '#111': '#eee',
    '#333': '#eee',
    '#555': '#aaa',
    '#666': '#aaa',
    '#0066cc': '#ff6600',
    '#004c99': '#cc5200',
    'rgba(0,102,204,0.1)': 'rgba(255,102,0,0.15)',
    'rgba(255,255,255,0.8)': 'rgba(20,20,20,0.8)',
    'rgba(255,255,255,0.9)': 'rgba(15,15,15,0.95)',
    'rgba(0,0,0,0.1)': 'rgba(255,255,255,0.1)',
    'rgba(0,0,0,0.05)': 'rgba(255,255,255,0.05)',
    '#ccc': '#444',
    '#ddd': '#333',
    '#f1f5f9': '#222',
    '#cbd5e1': '#444',
    '#e6f7ff': '#2b1a0f',
    '#ccffcc': '#143314',
    '#ffcccc': '#4d1a1a',
    '#f99': '#633',
}

for filepath in files:
    if os.path.exists(filepath):
        with open(filepath, 'r') as f:
            content = f.read()
        for old, new in replacements.items():
            content = content.replace(old, new)
        with open(filepath, 'w') as f:
            f.write(content)
print("Theme updated")
