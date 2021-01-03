const mongoose = require('mongoose');

module.exports = function () {
  const app = this;

  const newConnection = mongoose.createConnection(app.get('mongodb'), {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      useCreateIndex: true,
      promoteBuffers: true
  });
  // mongoose.Promise = global.Promise;

  app.set('mongooseClient', newConnection);
};
