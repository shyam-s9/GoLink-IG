FROM node:18-alpine

# Create app directory
WORKDIR /app

# Install app dependencies
COPY package*.json ./
RUN npm install --production

# Bundle app source
COPY . .

# Set environment variables
ENV NODE_ENV=production
# Render uses 10000 by default for free services
ENV PORT=10000

# Expose the correct port
EXPOSE 10000

# Start the server using the script we added to package.json
CMD ["npm", "start"]
