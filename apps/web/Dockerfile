# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies
RUN corepack enable && corepack prepare yarn@4.6.0 --activate

# Copy workspace files
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn ./.yarn
COPY turbo.json ./
COPY tsconfig.base.json ./

# Copy package files
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/

# Install dependencies
RUN yarn install --immutable

# Copy source code
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

# Build
RUN yarn turbo run build --filter=@photo-processor/web

# Production stage - Nginx
FROM nginx:alpine

# Copy built static files
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Copy nginx config
COPY nginx/nginx.conf /etc/nginx/nginx.conf

# Health check endpoint
RUN echo "OK" > /usr/share/nginx/html/health

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
