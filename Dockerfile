FROM node:lts-alpine

WORKDIR /web-server
ENV NODE_ENV development
ENV NODE_CONFIG_DIR config

RUN npm install -g pm2

RUN apk update && apk upgrade && \
    apk add --no-cache bash vim git openssh python openssl

COPY package.json /web-server/package.json
COPY package-lock.json /web-server/package-lock.json

RUN npm set unsafe-perm true
RUN npm install
# RUN npm ci
# RUN npm audit fix
# RUN npx npm-force-resolutions
# RUN npm install

COPY . /web-server

# HTTPS Server
EXPOSE 4343/tcp

# CMD ["pm2-runtime", "server/index.js", "--name", "interact.do.dev"]
CMD ["pm2-runtime", "pm2config.json"]
