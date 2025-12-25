FROM node:20-bullseye AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY src ./src
COPY models ./models
COPY tsconfig*.json ./

RUN npm run build
RUN npm prune --production

# ---------- runtime ----------
FROM node:20-bullseye
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/models ./models

ENV PORT=8080
ENV MAIA_MODEL_PATH=/models/maia_rapid.onnx
ENV LEELA_MODEL_PATH=/models/t1-256x10.onnx
ENV ELITE_LEELA_MODEL_PATH=/models/eliteleelav2.onnx

EXPOSE 8080
CMD ["node", "dist/index.js"]
