# OCB - OpenCode Bridge

**✅ Use OpenCode AI models directly in Claude Code with one command!**

## Quick Start

```bash
# Clone the repo
git clone https://github.com/veokhan/ocb.git
cd ocb

# Install dependencies
npm install

# Setup + Start (one command)
npm run cli -- install
```

## Or Install Globally

```bash
# Clone
git clone https://github.com/veokhan/ocb.git
cd ocb

# Install
npm install
npm run build
npm link

# Run
ocb install
```

## Usage

```bash
# From repo directory
npm run cli -- start
npm run cli -- stop
npm run cli -- setup
npm run cli -- remove
```

### Available Commands

| Command | Description |
|---------|-------------|
| `npm run cli -- install` | Setup + Start |
| `npm run cli -- start` | Start server |
| `npm run cli -- stop` | Stop server |
| `npm run cli -- setup` | Configure Claude Code |
| `npm run cli -- remove` | Remove config |

## After Setup

1. **Dashboard:** http://localhost:8300
   - Switch models with one click
   - View usage stats

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
