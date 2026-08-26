#!/bin/sh
# Start Aquarius Cut locally. The MCP token is persisted server-side, so it survives restarts.
# Usage: ./dev-with-mcp.sh
exec npm run dev:isolated
