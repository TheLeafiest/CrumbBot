# Build stage: compile TypeScript and run the tests, so a failing build never produces an image
FROM node:24-alpine AS build

WORKDIR /build

# Copy package files first for better caching
COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm test && find dist -name '*.test.js*' -delete

# Runtime stage: production dependencies and compiled output only
FROM node:24-alpine

WORKDIR /crumbbot

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /build/dist ./dist
COPY --chmod=755 start.sh ./

# config.json, birthdays.json and images/ are bind-mounted into /crumbbot by the host (Unraid).
# No VOLUME lines: on a single file path Docker creates an empty directory when the mount is
# missing, which then fails as "EISDIR" instead of a clear "config.json not found"

# Run the startup script that deploys commands first
CMD ["./start.sh"]
