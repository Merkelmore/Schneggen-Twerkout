FROM node:24.19.0-alpine

WORKDIR /app
COPY package.json server.mjs ./
COPY public ./public
COPY server ./server
COPY scripts ./scripts
RUN mkdir -p /data && chown node:node /data

ENV PORT=8080
ENV SCHNEGGEN_DB_PATH=/data/schneggen.sqlite
USER node
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 CMD wget -qO- http://127.0.0.1:8080/healthz | grep -qx ok

CMD ["node", "server.mjs"]
