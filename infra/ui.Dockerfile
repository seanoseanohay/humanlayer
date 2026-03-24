FROM node:20-slim AS build
WORKDIR /app

# Copy workspace root files
COPY package.json package-lock.json tsconfig.base.json ./

# Copy UI package
COPY apps/ui/ apps/ui/

# Install dependencies
RUN npm ci --workspace=apps/ui --include-workspace-root

# Build the UI — API URL is set for the Docker environment
# The browser connects to the server via host-mapped port
ARG VITE_API_URL=http://localhost:3000
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build -w apps/ui

# Serve with a lightweight static server
FROM node:20-slim
WORKDIR /app
RUN npm install -g serve@14
COPY --from=build /app/apps/ui/dist ./dist

EXPOSE 5173

CMD ["serve", "-s", "dist", "-l", "5173"]
