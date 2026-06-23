# RetailZero Z-Merchant (A4AA) -- single-host demo image.
# Serves the built SPA plus the /api, MCP, and third-party API on
# one container. Subdomain-based tenant resolution + runtime config
# mean one image serves every demo instance.

FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
# Built SPA + server sources (server runs via node at start).
COPY --from=build /app/dist ./dist
COPY server ./server

EXPOSE 3000
CMD ["npm", "run", "start"]
