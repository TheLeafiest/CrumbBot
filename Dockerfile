FROM node:20-alpine

# Create app directory
WORKDIR /crumbbot

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Create volume mount points for persistent data
VOLUME /crumbbot/config.json
VOLUME /crumbbot/images
VOLUME /crumbbot/birthdays.json

# Make the startup script executable
RUN chmod +x start.sh

# Set environment variables
ENV NODE_ENV=production

# Run the startup script that deploys commands first
CMD ["./start.sh"]
