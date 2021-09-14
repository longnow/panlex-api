const panlex = require('panlex');

module.exports = function(url, body, done, cb) {
  if (process.env.PANLEX_API === undefined)
    url = 'https://api.panlex.org' + url;

  panlex.query(url, body, function (err, data) {
    if (err) {
        console.log(data);
        done(err);
    }
    else cb(data);
  });
};
