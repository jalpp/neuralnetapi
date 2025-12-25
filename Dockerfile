# ---------- build ----------
FROM node:20-slim AS builder
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source and models
COPY src ./src
COPY models ./models
COPY tsconfig*.json ./

# Build the project and remove dev dependencies
RUN npm run build
RUN npm prune --production

# ---------- runtime ----------
FROM node:20-slim
WORKDIR /app

# Copy production artifacts from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/models ./models

# Set environment variables to the correct internal paths
ENV PORT=8080
ENV MAIA_MODEL_PATH=/app/models/maia_rapid.onnx
ENV LEELA_MODEL_PATH=/app/models/t1-256x10.onnx
ENV ELITE_LEELA_MODEL_PATH=/app/models/eliteleelav2.onnx

EXPOSE 8080

# Start the application
CMD ["node", "dist/index.js"]
