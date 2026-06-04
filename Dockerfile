FROM node:22-alpine

WORKDIR /app

# Install deps first for better layer caching
COPY package.json ./
RUN npm install

COPY . .

EXPOSE 3000

# Run TypeScript directly via tsx (skeleton — no build step yet)
CMD ["npm", "run", "start"]
