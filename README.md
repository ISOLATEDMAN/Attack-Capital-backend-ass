MediNote Backend
This is the backend service for the MediNote application.

Prerequisites
Before you begin, ensure you have the following installed:

Git

Docker Desktop

Getting Started
Follow these steps to get the project running locally.

1. Clone the Repository

git clone <your-github-repo-url>
cd medinote-backend

2. Configure Environment Variables

The application requires a Google Cloud service account key and some environment variables to run.

a. Create your .env file:
Copy the example file to create your own local configuration.

cp .env.example .env

Now, open the .env file and fill in any necessary values.

b. Add Google Cloud Credentials:
You must have your own Google Cloud service account JSON key file.

Obtain your key file from the Google Cloud Console.

Place it in the root of this project directory.

Make sure the filename matches the one in docker-compose.yml (asstest-473218-b86a5555bb0b.json) or update the docker-compose.yml file to match your filename.

3. Run the Application

With Docker Desktop running, use Docker Compose to build and start the application.

docker compose up

The server will start, and you can access it at http://localhost:8080.

4. Stopping the Application

To stop the running container, press Ctrl + C in the terminal. To remove the container and network completely, run:

docker compose down

