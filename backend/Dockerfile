# Build from the repo root so the fake restaurant data in docs/mock/ is included:
#   docker build -f backend/Dockerfile -t crave-backend .
#   docker run --rm -p 3000:3000 crave-backend
FROM node:24-slim
WORKDIR /app/backend

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

COPY backend/src ./src
COPY backend/tsconfig.json ./
COPY docs/mock /app/docs/mock

ENV NODE_ENV=production PORT=3000
EXPOSE 3000
USER node
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node_modules/.bin/tsx", "src/index.ts"]
