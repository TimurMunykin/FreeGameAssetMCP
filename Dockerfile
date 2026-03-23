FROM node:22-alpine AS builder

RUN apk add --no-cache p7zip

WORKDIR /app

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY tsconfig.json ./
COPY src/ ./src/

RUN npx tsc


FROM node:22-alpine AS runtime

RUN apk add --no-cache p7zip

WORKDIR /app

COPY --from=builder /app/package.json /app/package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/index.js"]
