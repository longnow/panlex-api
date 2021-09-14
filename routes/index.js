const config = require('../config');

module.exports = function(app) {
  app.get('/', redirectDocs);

  require('./v1')(app);
  require('./v2')(app);
};

function redirectDocs(req, res, next) {
  res.setHeader('Location', config.docUrl);
  res.send(302);
  next();
}
