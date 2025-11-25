FROM node:18-alpine AS dev

RUN apk add --no-cache libc6-compat curl

WORKDIR /app

COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* .npmrc* ./
COPY public/ ./public

RUN corepack enable pnpm && pnpm i --frozen-lockfile


EXPOSE 3000

ENV NODE_ENV=development
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV NEXT_PUBLIC_IN_DOCKER=true

HEALTHCHECK --start-period=15s \
    CMD curl --fail http://localhost:3000/ || exit 1

CMD ["pnpm", "dev"]