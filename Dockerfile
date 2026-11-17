FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY server.js index.html style.css app.js question-data.js extra-questions.js scan-passage-questions.js manus-routes.json config.js sw.js manifest.webmanifest apple-touch-icon.png icon-192.png icon-512.png icon-maskable-512.png ./
USER node
EXPOSE 3000
CMD ["node", "server.js"]
