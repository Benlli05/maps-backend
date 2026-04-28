FROM node:20-alpine
RUN apk add --no-cache python3 make g++ libc6-compat
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 4005
CMD ["node", "index.js"]
