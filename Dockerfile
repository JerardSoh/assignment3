# Use the official Node.js image from Docker Hub
FROM node:18-alpine

# Create and set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json to the container
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code to the container
COPY . .

# Create a non-root user and group without a home directory
RUN addgroup appgroup && adduser -D -G appgroup appuser

# Change ownership of the application directory
RUN chown -R appuser:appgroup /app

# Switch to the non-root user
USER appuser

# Expose the port your app runs on
EXPOSE 3002

# Command to run your application
CMD ["node", "index.js"]
