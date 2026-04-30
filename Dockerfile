FROM node:22-alpine AS frontendbuilder

WORKDIR /src/Frontend

COPY Frontend/package*.json ./
RUN npm i

COPY Frontend ./
RUN npm run build

FROM python:3.13-alpine AS runtime

RUN apk add --no-cache ca-certificates curl

ENV DATA_DIR=/data 

RUN mkdir -p /data

WORKDIR /app

COPY --from=frontendbuilder /src/serve/ ./serve/
COPY app.py lopolis.py ./

VOLUME ["/data"]
EXPOSE 5847

CMD ["python", "app.py", "--docker", "--port", "5847"]
