FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .

RUN npx esbuild server/index.ts --platform=node --packages=external --bundle --format=cjs --outdir=server_dist

EXPOSE 3000

CMD ["node", "server_dist/index.js"]
