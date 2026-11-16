FROM node:22-alpine
WORKDIR /app
COPY heartos-ai-gateway.mjs ./
ENV PORT=8787 DATA_FILE=/data/heartos-ai-usage.json
VOLUME /data
EXPOSE 8787
USER node
CMD ["node", "heartos-ai-gateway.mjs"]
