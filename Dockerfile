FROM node:18-alpine

WORKDIR /app

RUN npm install -g @expo/cli --legacy-peer-deps

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .

RUN EXPO_PUBLIC_BASE_URL=/ npx expo export --platform web --output-dir static-build

RUN npx esbuild server/index.ts --platform=node --packages=external --bundle --format=cjs --outdir=server_dist

EXPOSE 3000

CMD ["node", "server_dist/index.js"]
