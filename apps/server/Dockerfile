FROM oven/bun:1

WORKDIR /workspace

COPY bun.lock package.json nx.json tsconfig.base.json tsconfig.json ./
COPY apps ./apps
COPY packages ./packages

RUN bun install --frozen-lockfile
RUN bun nx build server

WORKDIR /workspace/apps/server

EXPOSE 4000

CMD ["bun", "dist/bin/http-server.js"]
