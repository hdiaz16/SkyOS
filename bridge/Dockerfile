# Etapa 1: compilar TypeScript.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# Etapa 2: imagen final, solo runtime.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8787
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
EXPOSE 8787
USER node
CMD ["node", "dist/index.js"]
