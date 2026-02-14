# OCB - OpenCode Bridge

**Use OpenCode AI models directly in Claude Code!**

## Quick Start

```bash
# Clone the repo
git clone https://github.com/veokhan/ocb.git
cd ocb

# Install dependencies
npm install

# Build
npm run build

# Start the server
npm run start
```

## Usage Commands

```bash
# Start server only
npm run start

# Stop server
npm run stop

# Setup Claude Code config
npm run cli -- setup
```

## Or Use npx (No Install Needed)

```bash
# Clone
git clone https://github.com/veokhan/ocb.git
cd ocb

# Install deps
npm install

# Use via npx
npx tsx src/cli.ts start
npx tsx src/cli.ts setup
```

## After Running

1. **Dashboard:** http://localhost:8300
2. **Use Claude Code:**
   ```bash
   claude --print
   ```

## Features

- 🌐 **2540+ Models** from 89 providers
- 📊 **Usage Tracking**
- ⚡ **Auto-Configuration**

## GitHub

https://github.com/veokhan/ocb
