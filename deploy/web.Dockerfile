# BRLN Community web app: the static build with deploy/brln.env, served by an
# unprivileged nginx. The same image backs chat.br-ln.com and the LightningOS app.
FROM --platform=$BUILDPLATFORM node:24-slim AS build

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app
ENV NODE_OPTIONS=--max_old_space_size=8192

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages packages
RUN pnpm i --frozen-lockfile

COPY . .
RUN cp deploy/brln.env .env

ARG VITE_BUILD_HASH
ENV VITE_BUILD_HASH=$VITE_BUILD_HASH
RUN bash scripts/build-web.sh

FROM nginxinc/nginx-unprivileged:1.27-alpine

COPY deploy/web-nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build /usr/share/nginx/html

EXPOSE 8080
