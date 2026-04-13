FROM node:20-alpine
# Alpine needs these for native modules (canvas, sharp, etc.)
RUN apk add --no-cache python3 make g++ libc6-compat
WORKDIR /app
# Install expo CLI globally first
RUN npm install -g @expo/cli --legacy-peer-deps
# Copy package files and install deps
COPY package*.json ./
RUN npm install --legacy-peer-deps
# Copy all source files
COPY . .
# Build web frontend
RUN EXPO_PUBLIC_BASE_URL=/ npx expo export --platform web --output-dir static-build
# Build server — external keeps node_modules as require() calls at runtime
RUN npx esbuild server/index.ts \
  --platform=node \
  --packages=external \
  --bundle \
  --format=cjs \
  --outdir=server_dist \
  --loader:.ts=ts \
  --log-level=warning
EXPOSE 5000
CMD ["node", "server_dist/index.js"]
