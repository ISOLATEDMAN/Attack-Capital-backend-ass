# Step 1: Start with an official Node.js base image.
# 'node:18-alpine' is a specific, lightweight version, which is great for production.
FROM node:18-alpine

# Step 2: Set the working directory inside the container.
# This is like running 'cd /app' inside your container.
WORKDIR /app

# Step 3: Copy package.json and package-lock.json.
# We copy these first to take advantage of Docker's layer caching.
# 'npm install' will only re-run if these files have changed.
COPY package*.json ./

# Step 4: Install your app's dependencies inside the container.
RUN npm install

# Step 5: Copy all the other files from your project into the container.
# The '.' means copy from the current directory on your machine to the WORKDIR in the container.
COPY . .

# Step 6: Expose the port your app runs on.
# This tells Docker that the application inside the container will be listening on port 8080.
EXPOSE 8080

# Step 7: Define the default command to run your app.
# This command starts your server. We will override this in docker-compose for development.
CMD [ "node", "server.js" ]

