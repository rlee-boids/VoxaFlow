FROM node:20-alpine
WORKDIR /app
COPY package.json tsconfig.json /app/
COPY src /app/src
RUN npm install --silent
EXPOSE 3000
CMD ["npm", "run", "dev"]
