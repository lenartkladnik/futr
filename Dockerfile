FROM node:22-alpine AS frontendBuilder

WORKDIR /src/Frontend

COPY Frontend/package*.json ./
RUN npm i

COPY Frontend ./
RUN npm run build

FROM python:3.13-slim AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

ENV DATA_DIR=/data 

RUN mkdir -p /data

WORKDIR /app

COPY --from=frontendBuilder /src/serve/ ./serve/
COPY app.py lopolis.py ./

VOLUME ["/data"]
EXPOSE 5847

CMD ["python", "app.py", "--docker"]
