FROM debian:jessie
RUN apt-get update && apt-get install -y nodejs nodejs-legacy git wget build-essential npm && rm -rf /var/lib/apt/lists/*
ENV NVM_DIR /usr/local/nvm
RUN wget -qO- https://raw.githubusercontent.com/creationix/nvm/v0.33.6/install.sh | bash && . $NVM_DIR/nvm.sh && nvm install 6.11.1
RUN mkdir /opt/service
ADD . /opt/service
WORKDIR /opt/service
RUN . $NVM_DIR/nvm.sh && nvm use 6.11.1 && npm install && npm dedupe
ENV HOME=/root/ LINK=g++
ENV IN_DOCKER=1
CMD . $NVM_DIR/nvm.sh && nvm use 6.11.1 && npm test