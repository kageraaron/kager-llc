# Stub, self-hosted. Built on the box and run behind Caddy at stub.example.org.
#
# NEXT_PUBLIC_* values are inlined into the client bundle at BUILD time, so
# they are build args, not runtime env. Everything secret is runtime-only and
# comes from the compose env_file.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN=false
ARG NEXT_PUBLIC_COOKIE_DOMAIN
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S stub && adduser -S stub -G stub
COPY --from=build --chown=stub:stub /app/.next/standalone ./
COPY --from=build --chown=stub:stub /app/.next/static ./.next/static
COPY --from=build --chown=stub:stub /app/public ./public
USER stub
EXPOSE 3000
CMD ["node", "server.js"]
