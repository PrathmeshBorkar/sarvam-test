# Multi-stage Dockerfile for unified deployment
FROM node:20-alpine AS builder

WORKDIR /app

# Build Client
COPY client/package*.json ./client/
RUN cd client && npm install

COPY client/ ./client/
RUN cd client && npm run build

# Build Server
COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev

COPY server/ ./server/

# Production runner stage
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

COPY --from=builder /app/server ./server
COPY --from=builder /app/client/dist ./client/dist

EXPOSE 5000

WORKDIR /app/server
CMD ["node", "index.js"]
