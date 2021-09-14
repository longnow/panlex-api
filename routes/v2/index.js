module.exports = function(app) {
  // load early so params can be used below
  require('./source').init(app);
  require('./langvar').init(app);

  require('./admin').init(app);
  require('./definition').init(app);
  require('./denotation').init(app);
  require('./expr').init(app);
  require('./fake_expr').init(app);
  require('./fallback').init(app);
  require('./graph').init(app);
  require('./langvar_pair').init(app);
  require('./meaning').init(app);
  require('./norm').init(app);
  require('./suggest').init(app);
  require('./transliterate').init(app);
  require('./txt_degr').init(app);
};
