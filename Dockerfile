FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY frontend/package.json frontend/package.json
COPY backend/package.json backend/package.json
RUN npm install
COPY . .
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app /app
EXPOSE 4000 3000
CMD ["sh", "-c", "node backend/dist/index.js & node node_modules/next/dist/bin/next start -p 3000 -H 0.0.0.0 frontend"]
