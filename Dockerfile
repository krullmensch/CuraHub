# Build Stage
FROM node:20-alpine AS build

# Add basic build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    openssl \
    libc6-compat

WORKDIR /app

# 1. Build Frontend
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# 2. Build Backend
WORKDIR /app/server
COPY server/package*.json ./
COPY server/prisma ./prisma/

# Configure npm for sharp on Alpine/musl
RUN npm install --include=optional

# Prisma generate
RUN npx prisma generate

# Copy backend source and build
COPY server/src ./src/
COPY server/tsconfig.json ./
RUN npm run build

# Production Stage
FROM node:20-alpine
# Runtime dependencies
RUN apk add --no-cache openssl libc6-compat ca-certificates curl
WORKDIR /app

# Copy Frontend Build
COPY --from=build /app/dist ./dist

# Copy Backend runtime files
WORKDIR /app/server
COPY --from=build /app/server/dist ./dist
COPY --from=build /app/server/package*.json ./
COPY --from=build /app/server/prisma ./prisma
COPY --from=build /app/server/node_modules ./node_modules

# Environment
ENV NODE_ENV=production
ENV PORT=3000

# Ensure uploads directory exists
RUN mkdir -p uploads

# Expose backend port
EXPOSE 3000

# Run prisma db push to ensure tables exist, then start
# We use db push instead of migrate deploy because there are no migration files yet
CMD ["sh", "-c", "npx prisma db push && npm start"]
