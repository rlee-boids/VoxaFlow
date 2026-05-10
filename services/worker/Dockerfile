FROM node:20-alpine
WORKDIR /app
COPY package.json tsconfig.json /app/
COPY src /app/src
RUN npm install --silent
CMD ["npm", "run", "dev"]
