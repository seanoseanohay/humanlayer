FROM node:20-slim AS base
WORKDIR /app

# Install common shell tools the agent may need
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    jq \
    && rm -rf /var/lib/apt/lists/*

# Copy workspace root files
COPY package.json package-lock.json tsconfig.base.json ./

# Copy shared package
COPY packages/shared/ packages/shared/

# Copy agent package
COPY apps/agent/ apps/agent/

# Install all dependencies
RUN npm ci --workspace=packages/shared --workspace=apps/agent --include-workspace-root

# Build shared first, then agent
RUN npm run build -w packages/shared
RUN npm run build -w apps/agent

# Create workspace directory for the agent to operate in
RUN mkdir -p /workspace

# The agent container must NOT expose any ports
CMD ["node", "apps/agent/dist/index.js"]
