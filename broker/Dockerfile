FROM node:22-alpine

WORKDIR /app
COPY lib.mjs app.mjs server.mjs ./

USER node
ENV PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q -O - http://127.0.0.1:8080/health >/dev/null || exit 1

CMD ["node", "server.mjs"]
