module.exports = function(app) {
  // load early so params can be used below
  require('./ap').init(app);
  require('./lv').init(app);

  require('./df').init(app);
  require('./dn').init(app);
  require('./ex').init(app);
  require('./mn').init(app);
  require('./norm').init(app);
  require('./td').init(app);
};
