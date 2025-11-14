# Use lightweight Node image
FROM node:18-alpine

# Create app directory
WORKDIR /app

# Copy package files first (use layer caching)
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install --production

# Copy the rest of the project
COPY . .

# Expose port (Render uses 8080)
EXPOSE 8080

# Start the server
CMD ["node", "index.js"]
