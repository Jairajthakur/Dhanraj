FROM node:18-alpine

WORKDIR /app

RUN npm install -g @expo/cli --legacy-peer-deps

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .

RUN npx expo export --platform web --output-dir static-build || echo "Web build skipped"

RUN npx esbuild server/index.ts --platform=node --packages=external --bundle --format=cjs --outdir=server_dist

EXPOSE 3000

CMD ["node", "server_dist/index.js"]
```

After you commit this on GitHub, Railway will rebuild. The build will take **3-5 minutes** because it's compiling the entire Expo web app.

Watch the Railway build logs — you should see:
```
Exporting 1 bundle using 1 worker
...
✓ Exported web app to static-build/
