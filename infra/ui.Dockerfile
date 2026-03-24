FROM node:20-slim AS build
WORKDIR /app

# Copy workspace root files
COPY package.json package-lock.json tsconfig.base.json ./

# Copy UI package
COPY apps/ui/ apps/ui/

# Install dependencies
RUN npm ci --workspace=apps/ui --include-workspace-root

# Build the UI
RUN npm run build -w apps/ui

# Serve with a lightweight static server
FROM node:20-slim
WORKDIR /app
RUN npm install -g serve@14
COPY --from=build /app/apps/ui/dist ./dist

EXPOSE 5173

CMD ["serve", "-s", "dist", "-l", "5173"]
