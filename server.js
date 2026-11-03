const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const setupSocketHandler = require('./server/socket/socketHandler');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// تقديم الملفات الثابتة عبر المسار المطلق لضمان عملها في أي بيئة
app.use(express.static(path.join(__dirname, 'public')));

// ربط جميع أحداث السوكيت وإدارة الغرف
setupSocketHandler(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎮 لعبة كمّلها أونلاين - السيرفر يعمل على: http://localhost:${PORT}`);
});
