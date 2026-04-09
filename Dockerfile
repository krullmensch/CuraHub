# Build Stage
FROM node:20-alpine AS build

# Add dependencies for native modules and Prisma on Alpine
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    vips-dev \
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
RUN npm install
# Prisma generate needs to know we are on alpine
RUN npx prisma generate
COPY server/src ./src/
COPY server/tsconfig.json ./
RUN npm run build

# Production Stage
FROM node:20-alpine
# Runtime dependencies for sharp (vips) and Prisma (openssl, libc6-compat)
RUN apk add --no-cache vips openssl libc6-compat
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

# Run migrations and start
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
