# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies
RUN corepack enable && corepack prepare yarn@4.6.0 --activate

# Copy workspace files
COPY package.json yarn.lock .yarnrc.yml ./
COPY turbo.json ./
COPY tsconfig.base.json ./

# Copy package files for all workspaces
COPY packages/shared/package.json ./packages/shared/
COPY apps/server/package.json ./apps/server/

# Install dependencies
RUN yarn install

# Copy source code
COPY packages/shared ./packages/shared
COPY apps/server ./apps/server

# Build shared package first, then server
RUN yarn turbo run build --filter=@photo-processor/server

# Production stage - use Playwright base image
FROM mcr.microsoft.com/playwright:v1.58.1-jammy

WORKDIR /app

# Install Node.js 22
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Copy built files
COPY --from=builder /app/apps/server/dist ./dist
COPY --from=builder /app/apps/server/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./node_modules/@photo-processor/shared/dist
COPY --from=builder /app/packages/shared/package.json ./node_modules/@photo-processor/shared/

# Create data directory
RUN mkdir -p /app/data

# Set environment
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

EXPOSE 3000

CMD ["node", "dist/index.js"]
