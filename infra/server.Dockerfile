FROM node:20-slim AS base
WORKDIR /app

# Copy workspace root files
COPY package.json package-lock.json tsconfig.base.json ./

# Copy shared package
COPY packages/shared/ packages/shared/

# Copy server package
COPY apps/server/ apps/server/

# Copy UI package (server serves UI static files)
COPY apps/ui/ apps/ui/

# Install all dependencies
RUN npm ci --workspace=packages/shared --workspace=apps/server --workspace=apps/ui --include-workspace-root

# Build shared first, then UI, then server
RUN npm run build -w packages/shared
RUN npm run build -w apps/ui
RUN npm run build -w apps/server

EXPOSE 3000

CMD ["node", "apps/server/dist/index.js"]
