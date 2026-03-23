FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json vite.config.ts index.html ./
COPY src/ ./src/

RUN npx vite build


FROM node:22-alpine AS runtime

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY server.ts ./

EXPOSE 5173

CMD ["node", "--experimental-strip-types", "server.ts"]
