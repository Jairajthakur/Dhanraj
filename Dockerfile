FROM node:18-alpine

WORKDIR /app

# Install expo-cli globally for web export
RUN npm install -g @expo/cli --legacy-peer-deps

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .

# Build the web app into static-build/
RUN npx expo export --platform web --output-dir static-build || echo "Web build failed, skipping"

# Build the server
RUN npx esbuild server/index.ts --platform=node --packages=external --bundle --format=cjs --outdir=server_dist

EXPOSE 3000

CMD ["node", "server_dist/index.js"]
